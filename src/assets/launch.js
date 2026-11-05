/* Launch flow helpers shared by /submit, /under-review, /changes-requested, /scheduled, /launch-week, /launch-recap */
(function () {
  const { icon, esc } = H;
  function card(s, opts) {
    opts = opts || {};
    return `<div class="card lcard">${H.plogo(s)}
      <div class="grow stack gap-6"><p class="t-h4">${esc(s.name || 'Your product')}</p><p class="c-2">${esc(s.tagline || 'Your tagline appears here')}</p>
        <div class="row gap-8 wrap"><span class="badge">${esc((s.categories || [])[0] || 'Category')}</span>${opts.flag ? `<span class="row gap-6 t-caption c-2">${H.flag(s.country || 'NG')}${esc(s.city || '')}</span>` : `<span class="row gap-4 t-caption c-2">${icon('comment', 'ic-14')}${s.comment_count || 0}</span>`}${(s.pay_methods || []).length ? `<span class="badge badge--outline">${esc(s.pay_methods.join(' · '))}</span>` : ''}</div></div>
      <span class="upvote" aria-hidden="true">${icon('upvote')}<span class="t-count">${(s.upvote_count || 0).toLocaleString('en-US')}</span></span></div>`;
  }
  function timeline(steps) {
    return `<ol class="timeline">${steps.map(([state, t, m], i) => `<li class="${state} reveal" style="--i:${i}"><span class="tl-dot">${state === 'done' ? icon('check') : ''}</span><div><p class="tl-title">${t}</p>${m ? `<p class="tl-meta">${m}</p>` : ''}</div></li>`).join('')}</ol>`;
  }
  function fmtDate(ts) { if (!ts) return ''; const d = new Date(ts); return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }) + ' · ' + d.toTimeString().slice(0, 5); }
  function range(p) { if (!p.week_starts_at) return ''; const s = new Date(p.week_starts_at), e = new Date(new Date(p.week_ends_at) - 864e5); return `${s.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}–${s.getMonth() === e.getMonth() ? e.getDate() : e.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}`; }
  // Load the product named by ?p=slug (or the user's most relevant one for this stage)
  async function mine(stages) {
    await API.ready;
    if (!API.uid) { location.replace('/signin?next=' + encodeURIComponent(location.pathname + location.search)); throw new Error('AUTH_REQUIRED'); }
    const slug = H.params().get('p');
    const all = await API.myProducts();
    let p = slug ? all.find(x => x.slug === slug) : all.find(x => stages.includes(x.effective_status || x.status));
    if (!p && slug && API.isAdmin) p = await API.product(slug);
    return { p, all };
  }
  function none(msg) {
    document.querySelector('main').innerHTML = `<div class="card card--pad reveal" style="max-width:560px;margin:80px auto;text-align:center"><div class="icon-badge" style="margin:0 auto 14px">${icon('rocket')}</div><p class="t-h3">${msg}</p><p class="c-2" style="margin:8px 0 20px">Start a launch draft or pick a product from your list.</p><div class="row gap-8" style="justify-content:center"><a class="btn btn--accent" href="/submit?new=1">${icon('plus')}Start a draft</a><a class="btn btn--secondary" href="/my-products">My products</a></div></div>`;
  }
  window.L = { card, timeline, fmtDate, range, mine, none };
})();
