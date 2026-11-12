/* Hentity's own listing (Figma 238:4196 "Hentity on Hentity"). /products/hentity uses this layout instead of the
   normal product page: no founders, makers, company or alternatives. Reviews of Hentity carry a feature tag,
   can be anonymous, collect "Me too" votes and get replies from the Hentity team. The side column lists the
   most-requested features (members vote) and what shipped. */
(function () {
  const { esc, icon, toast, avatar, qs } = H;
  const FEATURES = [['launches', 'Launches'], ['find', 'Find'], ['funding', 'Funding'], ['insights', 'Insights'], ['chats', 'Chats']];
  const FNAME = Object.fromEntries(FEATURES.concat([['betas', 'Beta tests'], ['validate', 'Validate'], ['directory', 'Directory']]));
  const MIN = 20, MAX = 2000, FIRST = 8;
  const STAR = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.4l-4.94 2.6.94-5.5-4-3.9 5.53-.8z"/></svg>';
  const UP = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2.2 10.4 9.8H1.6z"/></svg>';
  const MARK = '<svg viewBox="0 0 416 416" aria-hidden="true"><circle cx="208" cy="208" r="208" fill="#000"/><path fill="#fff" d="M184 90H232V184H326V232A94 94 0 0 0 232 326H184V232H90V184A94 94 0 0 0 184 90Z"/></svg>';
  const stars = R.stars;
  const day = d => new Date(String(d).length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const ago = d => { const m = (Date.now() - new Date(d)) / 6e4; return m < 2 ? 'Just now' : H.ago(d); };
  const fchip = f => f ? `<span class="hx-f hx-f--${esc(f)}">${esc(FNAME[f] || f)}</span>` : '';

  function render(p) {
    const root = qs('#pp'); root.classList.add('hx-page');
    let S = { count: 0, reviews: [], dist: {}, by_feature: [] }, RM = { requested: [], shipped: [] };
    let sort = 'newest', showAll = false, replying = null, pick = { rating: 0, feature: null, anon: false }, editing = false;
    const url = location.origin + '/products/' + p.slug;
    document.title = 'Hentity reviews | Where African startups launch, get found and grow';

    root.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Discover</a><span>/</span><a href="/directory">Platforms</a><span>/</span><span aria-current="page">Hentity</span></nav>
    <div class="pp-top hx-top">
      <div class="hx-stage">${p.video_url ? `<a class="btn btn--secondary btn--sm" href="${esc(p.video_url)}" target="_blank" rel="noopener">${icon('video', 'ic-16')}See how Hentity works</a>`
        : `<div class="hx-stage__in"><span class="hx-stage__mark">${MARK}</span><p>Launch, get found and grow</p><a class="btn btn--secondary btn--sm" href="/guidelines">${icon('info', 'ic-14')}See how Hentity works</a></div>`}</div>
      <div class="hx-head">
        <span class="hx-mark">${MARK}</span>
        <div class="hx-name"><h1>Hentity${p.verified ? `<span class="hx-v">${H.verified('ic-24')}</span>` : ''}</h1><p>${esc(p.tagline)}</p></div>
        <button class="btn btn--accent btn--block hx-write" type="button" data-hx-write>${STAR}Write a review</button>
        <div class="hx-share"><span class="c-3">Share</span>
          <a href="https://wa.me/?text=${encodeURIComponent('Hentity: ' + p.tagline + ' ' + url)}" target="_blank" rel="noopener">${icon('share', 'ic-14')}WhatsApp</a>
          <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}" target="_blank" rel="noopener">${icon('share', 'ic-14')}LinkedIn</a>
          <a href="https://x.com/intent/post?url=${encodeURIComponent(url)}&text=${encodeURIComponent('Hentity: ' + p.tagline)}" target="_blank" rel="noopener">${icon('share', 'ic-14')}X</a>
          <button type="button" data-hx-copy>${icon('link', 'ic-14')}Copy link</button></div>
      </div>
    </div>
    <div class="facts hx-facts">
      <div><span class="t-eyebrow c-3">Countries</span><span>All of Africa</span></div>
      <div><span class="t-eyebrow c-3">Price</span><span>Free for founders</span></div>
      <div><span class="t-eyebrow c-3">Currencies</span><span>${esc(p.currencies || 'All African currencies')}</span></div>
      <div><span class="t-eyebrow c-3">Languages</span><span>${esc(p.languages || 'English')}</span></div>
      <div><span class="t-eyebrow c-3">Platforms</span><span>Web · iOS · Android</span></div>
    </div>
    <div class="hx-where m-only"><p class="t-eyebrow c-3">Where it works</p><p class="t-body-sm" style="font-weight:500;margin-top:6px">All of Africa</p><p class="t-body-sm c-2" style="margin-top:4px">Free for founders · Web, iOS, Android</p></div>
    <p class="hx-replies m-only">${icon('clock', 'ic-14')}The team replies to every review</p>
    <div class="pp-body">
      <div style="min-width:0">
        <div class="d-only"><p class="t-eyebrow c-3" style="margin-bottom:10px">About</p><p class="c-2 t-body-sm">${esc(p.description || '')}</p></div>
        <div class="kpis hx-kpis d-only" id="hx-kpis"></div>
        <div class="hx-score m-only" id="hx-score"></div>
        <div class="row between gap-12 hx-rh"><h2 class="t-h3">Reviews · <span id="hx-n">0</span></h2>
          <label class="hx-sort"><span class="sr-only">Sort reviews</span><select id="hx-sort"><option value="newest">Newest</option><option value="helpful">Most “me too”</option><option value="high">Highest rated</option><option value="low">Lowest rated</option></select>${icon('chevron-down', 'ic-14')}</label></div>
        <div class="hx-two d-only" id="hx-dist"></div>
        <div id="hx-compose"></div>
        <div class="hx-list" id="hx-list"><div class="skel" style="height:160px;border-radius:14px"></div><div class="skel" style="height:160px;border-radius:14px"></div></div>
        <div id="hx-more"></div>
      </div>
      <aside class="stack gap-16 hx-side" id="hx-side"></aside>
    </div>`;

    // ---------------------------------------------------------------- pieces
    function kpis() {
      const n = S.count || 0;
      qs('#hx-kpis').innerHTML = [
        [n ? (+S.avg).toFixed(1) : '–', 'average rating', `${n} review${n === 1 ? '' : 's'}`],
        [S.recommend != null ? S.recommend + '%' : '–', 'would recommend', 'of reviewers'],
        [S.week || 0, 'new this week', 'reviews', true],
        [S.replies_month || 0, 'team replies', 'this month']
      ].map(([v, l, s, hot]) => `<div class="kpi"><b${hot ? ' class="c-accent"' : ''}>${v}</b><span class="t-caption c-2" style="font-weight:400;display:block">${l}</span><span class="t-caption hx-green" style="font-weight:400">${s}</span></div>`).join('');
      const weak = (S.by_feature || []).filter(f => f.n >= 2).sort((a, b) => a.avg - b.avg)[0];
      qs('#hx-score').innerHTML = n ? `<b>${(+S.avg).toFixed(1)}</b><div>${stars(S.avg, 'rv-stars--md')}<p class="t-caption c-3" style="font-weight:400;margin-top:4px">${n} review${n === 1 ? '' : 's'}${weak && weak.avg < 4 ? ` · ${esc(FNAME[weak.feature])} needs work (${(+weak.avg).toFixed(1)})` : ''}</p></div>` : `<p class="t-body-sm c-2">No reviews yet. Yours will be the first.</p>`;
      qs('#hx-n').textContent = n;
    }
    function dist() {
      const d = S.dist || {}, top = Math.max(1, ...[1, 2, 3, 4, 5].map(k => +d[k] || 0));
      qs('#hx-dist').innerHTML = `<div class="card hx-card"><p class="t-eyebrow c-3">Ratings</p>${[5, 4, 3, 2, 1].map(k => `<div class="hx-bar"><span>${k}</span><i><em style="width:${(+d[k] || 0) / top * 100}%"></em></i><span class="n">${+d[k] || 0}</span></div>`).join('')}</div>
        <div class="card hx-card"><p class="t-eyebrow c-3">By feature</p>${(S.by_feature || []).length ? S.by_feature.slice(0, 5).map(f => `<div class="hx-feat">${fchip(f.feature)}<span class="${f.avg < 4 ? 'hx-low' : ''}">${(+f.avg).toFixed(1)} ★</span></div>`).join('') : '<p class="t-caption c-3" style="font-weight:400;margin-top:10px">Scores appear here as reviews tag a feature.</p>'}</div>`;
    }
    function composer() {
      const box = qs('#hx-compose'), me = S.reviews.find(r => r.mine);
      if (S.is_maker) { box.innerHTML = `<div class="hx-compose hx-compose--team"><p class="t-label" style="color:#fff">You’re on the Hentity team</p><p class="t-body-sm" style="color:#a3a3a3;margin-top:4px">Reply to reviews below. Every review gets a reply.</p></div>`; return; }
      if (me && !editing) { box.innerHTML = `<div class="hx-compose hx-compose--done"><p class="t-label" style="color:#fff">Thanks for reviewing Hentity</p><p class="t-body-sm" style="color:#a3a3a3;margin-top:4px">Your review is below. You can change it any time.</p><button class="btn btn--secondary btn--sm" type="button" data-hx-edit style="margin-top:12px">${icon('edit', 'ic-14')}Edit your review</button></div>`; return; }
      if (me && editing && !pick.rating) pick = { rating: me.rating, feature: me.feature, anon: me.anonymous };
      box.innerHTML = `<form class="hx-compose" id="hx-form" novalidate>
        <p class="hx-q">${me ? 'Edit your review' : 'How’s Hentity working for you?'}</p>
        <div class="hx-pick" role="radiogroup" aria-label="Your rating">${[1, 2, 3, 4, 5].map(k => `<button type="button" role="radio" aria-checked="${k === pick.rating}" aria-label="${k} star${k === 1 ? '' : 's'}" data-hx-rate="${k}" class="${k <= pick.rating ? 'is-on' : ''}">${STAR}</button>`).join('')}</div>
        <div class="hx-chips" role="group" aria-label="Which part of Hentity?">${FEATURES.map(([k, l]) => `<button type="button" class="hx-chip" data-hx-feat="${k}" aria-pressed="${pick.feature === k}">${l}</button>`).join('')}</div>
        <textarea class="hx-input" id="hx-body" rows="1" maxlength="${MAX}" placeholder="Tell us what works, what’s broken, what to build" aria-label="Your review">${esc(me && editing ? me.body : '')}</textarea>
        <div class="row between gap-12 wrap"><label class="hx-anon"><input type="checkbox" id="hx-anon"${pick.anon ? ' checked' : ''}><span>Post anonymously</span></label><span class="hx-count" id="hx-count"></span></div>
        <div class="row gap-8">${me ? '<button class="btn btn--ghost btn--sm hx-ghost" type="button" data-hx-cancel>Cancel</button>' : ''}<button class="btn btn--accent btn--block" type="submit" id="hx-post">${me ? 'Save changes' : 'Post review'}</button></div>
      </form>`;
      const f = qs('#hx-form'), ta = qs('#hx-body');
      const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(200, ta.scrollHeight) + 'px'; const n = ta.value.trim().length; qs('#hx-count').textContent = n && n < MIN ? `${MIN - n} more character${MIN - n === 1 ? '' : 's'}` : ''; };
      ta.addEventListener('input', grow); grow();
      const paint = k => f.querySelectorAll('[data-hx-rate]').forEach(b => { const v = +b.dataset.hxRate; b.classList.toggle('is-on', v <= k); b.setAttribute('aria-checked', String(v === pick.rating)); });
      f.querySelectorAll('[data-hx-rate]').forEach(b => { b.onclick = () => { if (!API.uid) return signin(); pick.rating = +b.dataset.hxRate; paint(pick.rating); }; b.onmouseenter = () => paint(+b.dataset.hxRate); b.onmouseleave = () => paint(pick.rating); });
      f.querySelector('.hx-pick').onkeydown = e => { if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return; e.preventDefault(); pick.rating = Math.max(1, Math.min(5, (pick.rating || 0) + (e.key === 'ArrowRight' ? 1 : -1))); paint(pick.rating); f.querySelector(`[data-hx-rate="${pick.rating}"]`).focus(); };
      f.querySelectorAll('[data-hx-feat]').forEach(b => b.onclick = () => { pick.feature = pick.feature === b.dataset.hxFeat ? null : b.dataset.hxFeat; f.querySelectorAll('[data-hx-feat]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.hxFeat === pick.feature))); });
      qs('#hx-anon').onchange = e => { pick.anon = e.target.checked; };
      ta.addEventListener('focus', () => { if (!API.uid) signin(); });
      f.onsubmit = async e => {
        e.preventDefault(); if (!API.uid) return signin();
        const body = ta.value.trim();
        if (!pick.rating) { toast('Pick a star rating', 'error'); f.querySelector('[data-hx-rate]').focus(); return; }
        if (body.length < MIN) { toast(`Write at least ${MIN} characters`, 'error'); ta.focus(); return; }
        const b = qs('#hx-post'); b.disabled = true;
        try { await API.saveReview(p.id, me && me.id, pick.rating, body, { feature: pick.feature, anonymous: pick.anon }); toast(me ? 'Review updated' : 'Thanks! The team reads every review'); editing = false; pick = { rating: 0, feature: null, anon: false }; await load(); }
        catch (err) { b.disabled = false; H.fail(err); }
      };
    }
    function card(r) {
      const u = r.user || {}, fresh = r.mine && Date.now() - new Date(r.created_at) < 36e5;
      const who = u.anonymous ? `<span class="hx-anonav">${icon('user', 'ic-14')}</span>` : `<a href="/makers/${esc(u.username || '')}" tabindex="-1">${avatar(u, 28)}</a>`;
      const sub = [u.anonymous ? '' : u.headline, u.city].filter(Boolean).join(' · ');
      const reply = r.reply ? `<div class="hx-reply"><p class="row gap-6"><span class="hx-rmark">${MARK}</span><b>Hentity team</b></p><p>${esc(r.reply.body)}</p>${S.is_maker ? `<button class="link t-caption" type="button" data-hx-reply="${r.id}">Edit reply</button>` : ''}</div>` : '';
      const rform = replying === r.id ? `<form class="hx-rform" data-hx-rform="${r.id}"><textarea class="input" rows="3" maxlength="1000" placeholder="Thank them, answer, or say what you’re fixing">${esc((r.reply || {}).body || '')}</textarea><div class="row gap-8" style="justify-content:flex-end">${r.reply ? '<button class="btn btn--ghost btn--sm" type="button" data-hx-unreply>Remove</button>' : ''}<button class="btn btn--ghost btn--sm" type="button" data-hx-rcancel>Cancel</button><button class="btn btn--primary btn--sm" type="submit">Reply as Hentity team</button></div></form>` : '';
      return `<article class="hx-rv${r.mine ? ' is-mine' : ''}" id="hx-${r.id}">
        <div class="row between gap-8">${stars(r.rating)}${fresh ? '<span class="hx-just">Just now</span>' : `<span class="t-caption c-3" style="font-weight:400">${esc(ago(r.created_at))}${r.edited_at ? ' · edited' : ''}</span>`}</div>
        <p class="hx-body">${esc(r.body)}</p>
        ${reply}${rform}
        <div class="hx-by">${who}<div style="min-width:0"><p class="t-label truncate">${esc(u.name || 'Member')}${r.mine ? ' <span class="c-3" style="font-weight:400">(you)</span>' : ''}</p>${sub ? `<p class="t-caption c-3 truncate" style="font-weight:400">${esc(sub)}</p>` : ''}</div></div>
        <div class="hx-foot">${fchip(r.feature) || '<span></span>'}<span class="row gap-10">
          ${S.is_maker && !r.reply && replying !== r.id ? `<button class="link t-caption" type="button" data-hx-reply="${r.id}">Reply</button>` : ''}
          ${r.mine ? `<button class="link t-caption" type="button" data-hx-edit>Edit</button><button class="link t-caption" type="button" data-hx-del="${r.id}">Delete</button>` : `<button class="link t-caption c-3" type="button" data-hx-report="${r.id}">Report</button>${API.isAdmin ? `<button class="link t-caption" type="button" data-hx-del="${r.id}" style="color:#B42318">Delete</button>` : ''}`}
          <button class="hx-metoo" type="button" data-hx-metoo="${r.id}" aria-pressed="${!!r.voted}"${r.mine ? ' disabled title="Your own review"' : ''}>${UP}Me too · ${r.helpful || 0}</button></span></div>
      </article>`;
    }
    function list() {
      const all = S.reviews.slice().sort((a, b) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0)), shown = showAll ? all : all.slice(0, FIRST);
      qs('#hx-list').innerHTML = shown.map(card).join('') || `<div class="card hx-empty"><p class="t-h4">No reviews yet</p><p class="t-body-sm c-2" style="margin-top:6px">Tell the team what works, what’s broken and what to build next.</p></div>`;
      qs('#hx-more').innerHTML = all.length > FIRST ? `<button class="link link--accent hx-all" type="button" data-hx-all>${showAll ? 'Show fewer' : `See all ${all.length} reviews`}</button>` : '';
      qs('#hx-list').classList.toggle('is-single', shown.length < 2);
    }
    function side() {
      const req = RM.requested || [], sh = RM.shipped || [];
      qs('#hx-side').innerHTML = (req.length ? `<section class="card hx-scard"><div class="row between"><p class="t-eyebrow c-3">Most requested</p><span class="hx-live"><i></i>Live</span></div>
          ${req.map(i => `<div class="hx-req"><span>${esc(i.title)}</span><button class="hx-up" type="button" data-hx-vote="${i.id}" aria-pressed="${!!i.voted}" aria-label="Vote for ${esc(i.title)}, ${i.votes} votes">${UP}${i.votes}</button></div>`).join('')}</section>` : '')
        + (sh.length ? `<section class="card hx-scard"><p class="t-label" style="margin-bottom:6px">Shipped from your reviews</p>${sh.map(i => `<div class="hx-ship"><span>${esc(i.title)}</span><span class="c-3">${i.at ? esc(day(i.at)) : ''}</span></div>`).join('')}</section>` : '');
    }
    function all() { kpis(); dist(); composer(); list(); side(); H.contentShown(); }

    async function load() {
      const [s, rm] = await Promise.all([API.reviews(p.id, sort).catch(() => null), API.roadmap(p.id).catch(() => null)]);
      if (s) S = s; if (rm) RM = rm;
      all();
      if (location.hash === '#reviews' || location.hash === '#write') { const t = qs('#hx-compose'); t && t.scrollIntoView({ behavior: 'smooth', block: 'center' }); history.replaceState(null, '', location.pathname); }
    }
    const signin = () => { location.href = '/signin?next=' + encodeURIComponent('/products/hentity#write'); };

    // ---------------------------------------------------------------- events
    root.addEventListener('click', async e => {
      const t = e.target;
      if (t.closest('[data-hx-write]')) { if (!API.uid) return signin(); const me = S.reviews.find(r => r.mine); if (me) { editing = true; composer(); } const c = qs('#hx-compose'); c.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => { const b = qs('#hx-body'); b && b.focus({ preventScroll: true }); }, 400); return; }
      if (t.closest('[data-hx-copy]')) { navigator.clipboard.writeText(url).then(() => toast('Link copied')); return; }
      if (t.closest('[data-hx-edit]')) { editing = true; pick = { rating: 0, feature: null, anon: false }; composer(); qs('#hx-compose').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      if (t.closest('[data-hx-cancel]')) { editing = false; pick = { rating: 0, feature: null, anon: false }; composer(); return; }
      if (t.closest('[data-hx-all]')) { showAll = !showAll; list(); return; }
      const mt = t.closest('[data-hx-metoo]'); if (mt) {
        if (!API.uid) return signin();
        const r = S.reviews.find(x => x.id === mt.dataset.hxMetoo), on = !r.voted; r.voted = on; r.helpful += on ? 1 : -1; list();
        try { await API.reviewHelpful(r.id, on); } catch (err) { r.voted = !on; r.helpful += on ? -1 : 1; list(); H.fail(err); }
        return;
      }
      const v = t.closest('[data-hx-vote]'); if (v) {
        if (!API.uid) return signin();
        const i = RM.requested.find(x => x.id === v.dataset.hxVote), on = !i.voted; i.voted = on; i.votes += on ? 1 : -1; side();
        try { await API.roadmapVote(i.id, on); } catch (err) { i.voted = !on; i.votes += on ? -1 : 1; side(); H.fail(err); }
        return;
      }
      const d = t.closest('[data-hx-del]'); if (d) {
        if (!(await H.confirm('Delete your review?', { ok: 'Delete', danger: true }))) return;
        try { await API.deleteReview(d.dataset.hxDel); toast('Review deleted'); editing = false; load(); } catch (err) { H.fail(err); }
        return;
      }
      const rp = t.closest('[data-hx-report]'); if (rp) {
        if (!API.uid) return signin();
        const why = await H.ask('Why are you reporting this review?', { placeholder: 'Fake, abusive, personal details…', multiline: true, ok: 'Report' }); if (!why) return;
        try { await API.report('review', rp.dataset.hxReport, why); toast('Thanks. A moderator will take a look'); } catch (err) { H.fail(err); }
        return;
      }
      const ry = t.closest('[data-hx-reply]'); if (ry) { replying = ry.dataset.hxReply; list(); const a = qs(`[data-hx-rform="${replying}"] textarea`); a && a.focus(); return; }
      if (t.closest('[data-hx-rcancel]')) { replying = null; list(); return; }
      if (t.closest('[data-hx-unreply]')) { try { await API.reviewReply(replying, ''); replying = null; toast('Reply removed'); load(); } catch (err) { H.fail(err); } }
    });
    root.addEventListener('submit', async e => {
      const f = e.target.closest('[data-hx-rform]'); if (!f) return; e.preventDefault();
      const txt = f.querySelector('textarea').value.trim(); if (!txt) return;
      try { await API.reviewReply(f.dataset.hxRform, txt); replying = null; toast('Reply posted'); load(); } catch (err) { H.fail(err); }
    });
    root.addEventListener('change', e => { if (e.target.id === 'hx-sort') { sort = e.target.value; showAll = false; load(); } });

    load();
  }

  window.HP = { render };
})();
