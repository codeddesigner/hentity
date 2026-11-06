/* Shared product UI: ranked rows, upvote buttons with optimistic updates, motion and realtime counts. */
(function () {
  const fmt = n => (n || 0).toLocaleString('en-US');
  const voted = new Set();
  const byId = new Map();

  function remember(list) { (list || []).forEach(p => byId.set(p.id, p)); }
  async function loadVotes(list) {
    remember(list);
    const ids = (list || []).map(p => p.id);
    const mine = await API.myVotes(ids);
    mine.forEach(id => voted.add(id));
    document.querySelectorAll('[data-vote]').forEach(syncBtn);
  }
  function isLive(p) { return (p.effective_status || p.status) === 'live'; }
  function upBtn(p, extra) {
    const on = voted.has(p.id);
    const mine = API.uid && p.owner_id === API.uid;
    return `<button class="upvote${on ? ' is-voted' : ''}${extra ? ' ' + extra : ''}" type="button" data-vote="${p.id}" aria-pressed="${on}" aria-label="Upvote ${H.esc(p.name)}, ${fmt(p.upvote_count)} votes"${mine ? ' disabled title="Makers can’t upvote their own product"' : ''}>${H.icon('upvote')}<span class="t-count" data-count>${fmt(p.upvote_count)}</span></button>`;
  }
  function syncBtn(b) {
    const p = byId.get(b.dataset.vote); if (!p) return;
    const on = voted.has(p.id);
    b.classList.toggle('is-voted', on); b.setAttribute('aria-pressed', on);
    const c = b.querySelector('[data-count]'); if (c && c.textContent !== (b.dataset.prefix || '') + fmt(p.upvote_count)) M.roll(c, (b.dataset.prefix || '') + fmt(p.upvote_count));
  }
  function row(p, rank, opts) {
    opts = opts || {};
    const { icon, flag, verified, esc, plogo } = H;
    const r = rank && !p.promoted ? `<span class="prow__rank${rank <= 3 ? ' prow__rank--' + rank : ''}" aria-label="Rank ${rank}">${rank}</span>` : (opts.noRank ? '' : '<span class="prow__rank" aria-hidden="true"></span>');
    const cat = (p.categories || [])[0] || '';
    const rails = (p.pay_methods || []).join(' · ');
    const up = (p.promoted || !isLive(p) || opts.noVote) ? (opts.trailing || '<span style="width:56px" class="hide-sm"></span>') : upBtn(p);
    return `<article class="prow" data-key="${p.id}">
      ${p.promoted ? '' : r}
      <a href="/products/${p.slug}" tabindex="-1" aria-hidden="true">${plogo(p)}</a>
      <div class="prow__info">
        <div class="prow__name"><a href="/products/${p.slug}">${esc(p.name)}</a>${p.verified ? verified() : ''}${p.featured ? '<span class="badge badge--featured">Featured</span>' : ''}${p.promoted ? '<span class="badge">Promoted</span>' : ''}${opts.badge || ''}</div>
        <p class="prow__tag">${esc(p.tagline)}</p>
        <div class="prow__meta">
          ${cat ? `<span class="badge">${esc(cat)}</span>` : ''}
          <span class="row hide-sm">${icon('comment', 'ic-14')}${fmt(p.comment_count)}</span>
          <span class="row loc">${flag(p.country)}${esc(p.city)}</span>
          ${rails && !opts.noRails ? `<span class="badge badge--outline hide-sm">${esc(rails)}</span>` : ''}
        </div>
      </div>
      ${up}
    </article>`;
  }
  let busy = new Set();
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-vote]'); if (!b || b.disabled) return;
    if (!API.uid) { location.href = '/signin?next=' + encodeURIComponent(location.pathname + location.search); return; }
    const id = b.dataset.vote; const p = byId.get(id); if (!p) return;
    if (busy.has(id)) return; busy.add(id);
    const on = !voted.has(id);
    on ? voted.add(id) : voted.delete(id); p.upvote_count += on ? 1 : -1;
    document.querySelectorAll(`[data-vote="${id}"]`).forEach(x => { syncBtn(x); if (on) M.burst(x); });
    document.dispatchEvent(new CustomEvent('hentity:vote', { detail: { id, on, product: p } }));
    try { await API.vote(id, on); }
    catch (err) { on ? voted.delete(id) : voted.add(id); p.upvote_count += on ? -1 : 1; document.querySelectorAll(`[data-vote="${id}"]`).forEach(syncBtn); H.fail(err); }
    finally { busy.delete(id); }
  });
  // Live counts from other voters
  let stop = null;
  function liveCounts(onChange) {
    if (stop) stop();
    stop = API.live('counts', 'products', null, ({ new: n }) => {
      if (!n || !byId.has(n.id)) return;
      const p = byId.get(n.id); if (p.upvote_count === n.upvote_count) return;
      p.upvote_count = n.upvote_count; p.comment_count = n.comment_count;
      document.querySelectorAll(`[data-vote="${n.id}"]`).forEach(syncBtn);
      onChange && onChange(p);
    });
  }
  window.D = { row, upBtn, loadVotes, remember, voted, byId, fmt, isLive, liveCounts };
})();
