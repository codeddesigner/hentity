// Discuss (Figma Community: Discuss feed 254:3602, Discuss thread 255:3385, Discuss boards 258:3537).
// One page, three views, chosen by the URL:
//   /discuss                  the feed: Hot, New, Top, Rising; city; communities, most-discussed products, house rules
//   /d/<community>            a community board (topics, or h/<product> with Planned / In progress / Shipped / Fixed)
//   /d/<community>/<post>     a thread: the post, nested replies, related discussions (public, server-rendered for search)
// Starting a discussion opens the composer (?new=1, or the buttons).
(function () {
  const { qs, qsa, esc, icon, toast, plogo, verified, avatar } = H;
  const root = qs('#dsc');
  const FLAIR = { discussion: ['Discussion', 'gray'], question: ['Question', 'purple'], review: ['Review', 'blue'], feedback: ['Feedback wanted', 'orange'],
    show: ['Show Hentity', 'green'], megathread: ['Megathread', 'black'], bug: ['Bug', 'red'], feature: ['Feature request', 'yellow'], announcement: ['Announcement', 'black'] };
  const STATUS = { planned: ['Planned', 'gray', 'clock'], in_progress: ['In progress', 'blue', 'clock'], shipped: ['Shipped', 'green', 'check'], fixed: ['Fixed', 'green', 'check'] };
  const TAG = { maker: ['Maker', 'orange'], developer: ['Developer', 'blue'], designer: ['Designer', 'purple'], tester: ['Tester', 'green'] };
  const RULES = ['Be useful, not rude. Critique products, not people.', 'Makers: say you built it. Your posts get a Maker tag.', 'No referral spam or crypto shilling.'];
  const PERIODS = [['day', 'Today'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year'], ['all', 'All time']];
  const parts = location.pathname.split('/').filter(Boolean);
  const view = parts[0] === 'd' && parts[2] ? 'thread' : parts[0] === 'd' && parts[1] ? 'board' : 'feed';
  const comm = parts[0] === 'd' ? decodeURIComponent(parts[1] || '').toLowerCase() : null;
  const postSlug = view === 'thread' ? decodeURIComponent(parts[2]).toLowerCase() : null;
  const signedIn = () => !!(window.API && API.uid);
  const n = v => (+v || 0).toLocaleString('en-US');
  const k = v => v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(v || 0);
  const ago = ts => { const s = (Date.now() - new Date(ts)) / 1000; return s < 60 ? 'now' : s < 3600 ? Math.round(s / 60) + 'm' : s < 86400 ? Math.round(s / 3600) + 'h' : s < 7 * 86400 ? Math.round(s / 86400) + 'd' : s < 60 * 86400 ? Math.round(s / 604800) + 'w' : new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
  const pill = (txt, tone, ic) => `<span class="dp dp--${tone}">${ic ? icon(ic, 'ic-12') : ''}${esc(txt)}</span>`;
  const flairPill = f => FLAIR[f] && f !== 'discussion' ? pill(FLAIR[f][0], FLAIR[f][1]) : '';
  const statusPill = s => STATUS[s] ? pill(STATUS[s][0], STATUS[s][1], STATUS[s][2]) : '';
  const tagPill = t => TAG[t] ? pill(TAG[t][0], TAG[t][1]) : '';
  const dot = c => c && c.kind === 'product' && c.logo_url ? `<span class="dd dd--img" style="background-image:url('${esc(c.logo_url)}')"></span>` : `<span class="dd" style="background:${esc((c && c.color) || '#FF5B14')}"></span>`;
  const postUrl = p => `/d/${p.community.slug}/${p.slug}`;
  const handle = u => u ? 'u/' + (u.username || 'member') : 'deleted';
  // Plain text in, safe HTML out: paragraphs, links, h/community and u/member mentions
  const rich = t => esc(t || '').split(/\n{2,}/).map(par => '<p>' + par
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, u => `<a href="${u}" target="_blank" rel="noopener nofollow ugc">${u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}</a>`)
    .replace(/(^|[\s(])h\/([a-z0-9][a-z0-9-]{1,47})/g, '$1<a href="/d/$2">h/$2</a>')
    .replace(/(^|[\s(])u\/([a-z0-9_.]{2,30})/gi, '$1<a href="/makers/$2">u/$2</a>')
    .replace(/\n/g, '<br>') + '</p>').join('');
  const need = (msg) => { if (signedIn()) return false; H.toast(msg || 'Sign in to join the conversation'); setTimeout(() => { location.href = '/signin?next=' + encodeURIComponent(location.pathname + location.search); }, 700); return true; };
  const share = async (url, title) => { const u = location.origin + url; try { if (navigator.share && matchMedia('(max-width: 768px)').matches) { await navigator.share({ title, url: u }); return; } } catch (e) { return; } navigator.clipboard.writeText(u).then(() => toast('Link copied'), () => toast('Couldn’t copy', 'error')); };

  // ---------------------------------------------------------------- shared pieces
  const votes = (kind, o, inline) => `<div class="dv${inline ? ' dv--inline' : ''}" data-vote="${kind}" data-id="${o.id}"><button type="button" class="dv-up" aria-label="Upvote" aria-pressed="${o.my_vote === 1}">${icon('upvote', 'ic-16')}</button><b class="dv-n">${n(o.score)}</b><button type="button" class="dv-down" aria-label="Downvote" aria-pressed="${o.my_vote === -1}">${icon('upvote', 'ic-16')}</button></div>`;
  const prodChip = pr => pr ? `<a class="dpc" href="/products/${esc(pr.slug)}">${plogo(pr, 32)}<b>${esc(pr.name)}</b><span>on Hentity</span></a>` : '';
  function card(p, opts = {}) {
    const board = opts.board;
    return `<article class="dcard${p.pinned && opts.pins ? ' is-pinned' : ''}" data-post="${p.id}" data-href="${postUrl(p)}">
      ${votes('post', p)}
      <div class="dcard-b">
        <div class="dmeta">${board ? '' : `<a class="dmeta-c" href="/d/${esc(p.community.slug)}">${dot(p.community)}h/${esc(p.community.slug)}</a>`}
          ${board ? flairPill(p.flair) + statusPill(p.status) : ''}<span class="c-3">${board ? '' : '· '}${esc(handle(p.author))}${p.author && p.author.tag && (board || p.author.tag === 'maker') ? '' : ''} · ${ago(p.created_at)}</span>${board && p.author && p.author.tag ? tagPill(p.author.tag) : ''}
          ${p.pinned && opts.pins ? `<span class="dp dp--gray dmeta-pin">${icon('pin', 'ic-12')}Pinned</span>` : ''}</div>
        ${board ? '' : `<div class="dflair">${flairPill(p.flair)}${statusPill(p.status)}</div>`}
        <h2 class="dtitle"><a href="${postUrl(p)}">${esc(p.title)}</a></h2>
        ${p.body ? `<p class="dprev">${esc(p.body)}</p>` : ''}
        ${!board && p.product ? prodChip(p.product) : ''}
        <div class="dact">${votes('post', p, true)}<a href="${postUrl(p)}#comments">${icon('comment', 'ic-14')}${n(p.comment_count)}<span class="d-only">comment${p.comment_count === 1 ? '' : 's'}</span></a>
          ${board && p.maker_replied ? `<span class="dmr">${icon('reply', 'ic-14')}Maker replied</span>` : ''}
          <button type="button" data-share="${postUrl(p)}" data-title="${esc(p.title)}">${icon('share', 'ic-14')}Share</button>
          <button type="button" data-save="${p.id}" aria-pressed="${!!p.saved}">${icon('bookmark', 'ic-14')}${p.saved ? 'Saved' : 'Save'}</button></div>
      </div></article>`;
  }
  const empty = (t, s, cta) => `<div class="dempty">${icon('comment', 'ic-24')}<p class="t-label" style="margin-top:10px">${esc(t)}</p><p class="t-body-sm c-3" style="margin-top:4px">${esc(s)}</p>${cta || ''}</div>`;
  const rules = () => `<section class="drail-plain"><p class="t-label">House rules</p><ul>${RULES.map(r => `<li>${esc(r)}</li>`).join('')}</ul></section>`;

  // ---------------------------------------------------------------- votes, saves, shares (everywhere)
  root.addEventListener('click', async e => {
    const vb = e.target.closest('.dv-up,.dv-down');
    if (vb) {
      e.preventDefault(); e.stopPropagation();
      if (need('Sign in to vote')) return;
      const box = vb.closest('[data-vote]'), id = box.dataset.id, kind = box.dataset.vote;
      const all = qsa(`[data-vote="${kind}"][data-id="${id}"]`, root);
      const cur = box.querySelector('.dv-up').getAttribute('aria-pressed') === 'true' ? 1 : box.querySelector('.dv-down').getAttribute('aria-pressed') === 'true' ? -1 : 0;
      const want = vb.classList.contains('dv-up') ? (cur === 1 ? 0 : 1) : (cur === -1 ? 0 : -1);
      const was = +box.querySelector('.dv-n').textContent.replace(/,/g, '');
      const paint = (score, v) => all.forEach(b => { b.querySelector('.dv-n').textContent = n(score); b.querySelector('.dv-up').setAttribute('aria-pressed', v === 1); b.querySelector('.dv-down').setAttribute('aria-pressed', v === -1); });
      paint(was - cur + want, want);
      try { paint(await API.d.vote(kind, id, want), want); } catch (er) { paint(was, cur); H.fail(er); }
      return;
    }
    const sv = e.target.closest('[data-save]');
    if (sv) {
      e.preventDefault(); e.stopPropagation();
      if (need('Sign in to save posts')) return;
      const on = sv.getAttribute('aria-pressed') !== 'true';
      sv.setAttribute('aria-pressed', on); sv.lastChild.textContent = on ? 'Saved' : 'Save';
      try { await API.d.save(sv.dataset.save, on); toast(on ? 'Saved' : 'Removed from saved'); } catch (er) { sv.setAttribute('aria-pressed', !on); sv.lastChild.textContent = on ? 'Save' : 'Saved'; H.fail(er); }
      return;
    }
    const sh = e.target.closest('[data-share]'); if (sh) { e.preventDefault(); e.stopPropagation(); share(sh.dataset.share, sh.dataset.title); return; }
    const jn = e.target.closest('[data-join]');
    if (jn) {
      e.preventDefault(); if (need('Sign in to join communities')) return;
      const on = jn.getAttribute('aria-pressed') !== 'true';
      const set = v => qsa(`[data-join="${jn.dataset.join}"]`, root).forEach(b => { b.setAttribute('aria-pressed', v); b.innerHTML = v ? icon('check', 'ic-14') + 'Joined' : (b.dataset.lbl || 'Join'); });
      set(on);
      try { const cnt = await API.d.join(jn.dataset.join, on); qsa(`[data-members="${jn.dataset.join}"]`, root).forEach(el => { el.textContent = k(cnt) + ' member' + (cnt === 1 ? '' : 's'); }); } catch (er) { set(!on); H.fail(er); }
      return;
    }
    if (e.target.closest('[data-compose]')) { e.preventDefault(); compose({ comm: e.target.closest('[data-compose]').dataset.compose || comm }); return; }
    // The whole card opens the thread (links and buttons inside keep their own behaviour)
    const c = e.target.closest('.dcard'); if (c && !e.target.closest('a,button,input,textarea,select')) location.href = c.dataset.href;
  });

  // ---------------------------------------------------------------- FEED
  async function feed() {
    const F = { sort: H.params().get('sort') || 'hot', city: H.params().get('city') || '', period: H.params().get('t') || 'week' };
    let rail = { communities: [], products: [], cities: [], mine: [] }, posts = [], done = false, loading = false;
    const me = API.uid ? H.user() : null;
    const head = () => `<header class="dhead"><div><h1>Discuss</h1><p class="c-2">Talk about African startups and products. Ask, review, give makers feedback.</p></div><button class="btn btn--accent" type="button" data-compose>${icon('plus')}Start a discussion</button></header>`;
    const mhead = () => `<header class="dmhead m-only-f"><h1>Community</h1><div class="row gap-4"><button class="nav__icon" type="button" data-compose aria-label="Start a discussion">${icon('plus', 'ic-20')}</button></div></header>${H.communitySwitch ? H.communitySwitch('discuss') : ''}`;
    const sorts = () => `<div class="dsorts"><div class="dchips">${[['hot', 'Hot'], ['new', 'New'], ['top', 'Top'], ['rising', 'Rising']].map(([s, l]) => `<button class="chip" type="button" data-sort="${s}" aria-pressed="${F.sort === s}">${icon('check')}${l}</button>`).join('')}
        <span class="m-only-f dchips-c">${rail.communities.map(c => `<a class="chip" href="/d/${esc(c.slug)}">h/${esc(c.slug)}</a>`).join('')}</span></div>
      <div class="dsels d-only">${rail.cities.length ? `<label class="fu-sel"><select data-city aria-label="City"><option value="">Everywhere</option>${rail.cities.map(c => `<option${F.city.toLowerCase() === c.toLowerCase() ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>${icon('chevron-down', 'ic-14')}</label>` : ''}
        ${F.sort === 'top' ? `<label class="fu-sel"><select data-period aria-label="Period">${PERIODS.map(([v, l]) => `<option value="${v}"${F.period === v ? ' selected' : ''}>${l}</option>`).join('')}</select>${icon('chevron-down', 'ic-14')}</label>` : ''}</div></div>`;
    const ask = () => `<button class="dask d-only" type="button" data-compose>${me ? avatar(me, 'sm') : `<span class="avatar avatar--sm">${icon('user', 'ic-14')}</span>`}<span>Ask a question, review a product, share what you built…</span>${icon('image', 'ic-18')}${icon('link', 'ic-18')}</button>`;
    const side = () => `<aside class="drail">
        <section class="card drail-c"><p class="t-label">Communities</p>${rail.communities.map(c => `<div class="dcomm"><a href="/d/${esc(c.slug)}">${dot(c)}<span><b>h/${esc(c.slug)}</b><small data-members="${esc(c.slug)}">${k(c.member_count)} member${c.member_count === 1 ? '' : 's'}</small></span></a><button class="btn btn--sm ${c.joined ? 'btn--ghost' : 'btn--secondary'} djoin" type="button" data-join="${esc(c.slug)}" aria-pressed="${!!c.joined}">${c.joined ? icon('check', 'ic-14') + 'Joined' : 'Join'}</button></div>`).join('')}</section>
        ${rail.products.length ? `<section class="card drail-c"><p class="t-label">Most discussed products this week</p>${rail.products.map(p => `<a class="dprod" href="/d/${esc(p.slug)}">${plogo(p, 32)}<span><b>${esc(p.name)}</b><small>h/${esc(p.slug)} · ${p.threads} thread${p.threads === 1 ? '' : 's'}</small></span></a>`).join('')}</section>` : ''}
        ${rules()}</aside>`;
    function paint() {
      root.innerHTML = `<div class="dwrap">${mhead()}<div class="dgrid"><div class="dmain">${head()}${ask()}${sorts()}<div class="dlist" id="dlist">${posts.length ? posts.map(p => card(p, { pins: F.sort === 'hot' })).join('') : (loading ? '<div class="skel" style="height:160px;border-radius:14px"></div>' : empty('No discussions yet', F.city ? 'Nothing from ' + F.city + ' yet. Try everywhere.' : 'Be the first: ask a question or share what you built.', `<button class="btn btn--accent btn--sm" type="button" data-compose style="margin-top:14px">${icon('plus', 'ic-14')}Start a discussion</button>`))}</div>
        ${posts.length && !done ? '<div style="text-align:center;margin-top:16px"><button class="btn btn--secondary" type="button" id="dmore">Show more</button></div>' : ''}</div>${side()}</div></div>`;
      H.contentShown();
    }
    async function load(more) {
      loading = true;
      const rows = await API.d.feed({ sort: F.sort, city: F.city || null, period: F.sort === 'top' ? F.period : 'all', off: more ? posts.length : 0, lim: 20 }).catch(e => { H.fail(e); return []; });
      posts = more ? posts.concat(rows) : rows; done = rows.length < 20; loading = false; paint();
    }
    [rail] = await Promise.all([API.d.rail().catch(() => rail)]);
    rail = rail || { communities: [], products: [], cities: [], mine: [] };
    await load(false);
    root.addEventListener('click', e => {
      const s = e.target.closest('[data-sort]'); if (s) { F.sort = s.dataset.sort; const u = new URL(location.href); F.sort === 'hot' ? u.searchParams.delete('sort') : u.searchParams.set('sort', F.sort); history.replaceState(null, '', u); load(false); return; }
      if (e.target.closest('#dmore')) load(true);
    });
    root.addEventListener('change', e => {
      if (e.target.matches('[data-city]')) { F.city = e.target.value; load(false); }
      if (e.target.matches('[data-period]')) { F.period = e.target.value; load(false); }
    });
  }

  // ---------------------------------------------------------------- BOARD (a community)
  async function board() {
    const C = await API.d.community(comm).catch(() => null);
    if (!C) return notFound('We couldn’t find h/' + comm, 'Check the link, or browse all discussions.');
    document.title = `h/${C.slug}: ${C.title} | Hentity Discuss`;
    const isProd = C.kind === 'product';
    const F = { flair: '', sort: isProd ? 'new' : 'hot' };
    let posts = [], done = false;
    const flairs = isProd ? [['', 'All'], ['feature', 'Feature requests'], ['bug', 'Bugs'], ['review', 'Reviews'], ['question', 'Questions'], ['announcement', 'Announcements']]
      : [['', 'All'], ['question', 'Questions'], ['review', 'Reviews'], ['feedback', 'Feedback wanted'], ['show', 'Show Hentity']];
    const pr = C.product;
    const st = C.statuses || {};
    const head = () => `<div class="dbanner" style="--c:${esc(C.color || '#FF5B14')}"></div>
      <header class="dbhead"><div class="dbid">${pr ? plogo(pr, 64) : `<span class="dbdot" style="background:${esc(C.color)}">h/</span>`}<div style="min-width:0"><h1>h/${esc(C.slug)}${pr && pr.verified ? verified('ic-18') : ''}</h1>
          <p class="c-3">${isProd ? `Official community for ${esc(pr.name)} · ` : esc(C.title) + ' · '}<span data-members="${esc(C.slug)}">${k(C.member_count)} member${C.member_count === 1 ? '' : 's'}</span>${isProd ? ' · makers reply here' : ''}</p></div></div>
        <div class="row gap-8 dbbtn">${pr ? `<a class="btn btn--secondary btn--sm d-only" href="/products/${esc(pr.slug)}">${icon('arrow-up-right', 'ic-14')}Product page</a>` : ''}
          <button class="btn btn--sm ${C.joined ? 'btn--primary' : 'btn--secondary'}" type="button" data-join="${esc(C.slug)}" aria-pressed="${!!C.joined}">${C.joined ? icon('check', 'ic-14') + 'Joined' : 'Join'}</button>
          <button class="btn btn--accent btn--sm" type="button" data-compose="${esc(C.slug)}">${icon('plus', 'ic-14')}New post</button></div></header>`;
    const side = () => `<aside class="drail">
        ${isProd ? `<section class="card drail-c"><p class="t-label">From requests to shipped</p>
          <div class="dstat"><span class="dp dp--green">Shipped</span><i></i><b>${n(st.shipped)}</b></div><div class="dstat"><span class="dp dp--blue">In progress</span><i></i><b>${n(st.in_progress)}</b></div><div class="dstat"><span class="dp dp--gray">Planned</span><i></i><b>${n(st.planned)}</b></div>
          <p class="t-caption c-3" style="font-weight:400;margin-top:10px">${C.reply_rate != null ? `Makers reply to ${C.reply_rate}% of posts${C.reply_hours != null ? `, usually within ${C.reply_hours < 1 ? 'an hour' : Math.round(C.reply_hours) + ' hour' + (Math.round(C.reply_hours) === 1 ? '' : 's')}` : ''}.` : 'Post a request or a bug, and the makers can mark it Planned, In progress or Shipped.'}</p></section>
          ${(C.makers || []).length ? `<section class="card drail-c"><p class="t-label">Makers here</p>${C.makers.map(m => `<a class="dmk" href="/makers/${esc(m.username)}">${avatar(m, 'sm')}<span><b>${esc(m.name)}</b><small>${esc(m.role)}</small></span></a>`).join('')}</section>` : ''}`
        : `<section class="card drail-c"><p class="t-label">About h/${esc(C.slug)}</p><p class="t-body-sm c-2" style="margin-top:6px">${esc(C.about || '')}</p><p class="t-caption c-3" style="font-weight:400;margin-top:10px"><span data-members="${esc(C.slug)}">${k(C.member_count)} member${C.member_count === 1 ? '' : 's'}</span> · ${n(C.post_count)} post${C.post_count === 1 ? '' : 's'}</p></section>`}
        ${rules()}</aside>`;
    function paint() {
      root.innerHTML = `<div class="dwrap dwrap--board"><div class="dmtop m-only-f"><a class="nav__icon" href="/discuss" aria-label="Back">${icon('arrow-left')}</a><span class="t-label">h/${esc(C.slug)}</span></div>${head()}
        <div class="dgrid dgrid--board"><div class="dmain"><div class="dchips dflairs">${flairs.map(([f, l]) => `<button class="chip" type="button" data-flair="${f}" aria-pressed="${F.flair === f}">${F.flair === f ? icon('check') : ''}${l}</button>`).join('')}
          ${isProd ? '' : `<span class="dsep"></span>${[['hot', 'Hot'], ['new', 'New'], ['top', 'Top']].map(([s, l]) => `<button class="chip" type="button" data-bsort="${s}" aria-pressed="${F.sort === s}">${l}</button>`).join('')}`}</div>
          <div class="dlist">${posts.length ? posts.map(p => card(p, { board: true, pins: true })).join('') : empty(isProd ? `Nothing here for ${pr.name} yet` : 'No posts here yet', isProd ? 'Ask a question, request a feature or report a bug. The makers reply here.' : 'Start the first discussion in h/' + C.slug + '.', `<button class="btn btn--accent btn--sm" type="button" data-compose="${esc(C.slug)}" style="margin-top:14px">${icon('plus', 'ic-14')}New post</button>`)}</div>
          ${posts.length && !done ? '<div style="text-align:center;margin-top:16px"><button class="btn btn--secondary" type="button" id="dmore">Show more</button></div>' : ''}</div>${side()}</div></div>`;
      H.contentShown();
    }
    async function load(more) {
      const rows = await API.d.feed({ comm: C.slug, flair: F.flair || null, sort: isProd ? 'hot' : F.sort, off: more ? posts.length : 0, lim: 20 }).catch(e => { H.fail(e); return []; });
      posts = more ? posts.concat(rows) : rows; done = rows.length < 20; paint();
    }
    await load(false);
    root.addEventListener('click', e => {
      const f = e.target.closest('[data-flair]'); if (f) { F.flair = f.dataset.flair; load(false); return; }
      const s = e.target.closest('[data-bsort]'); if (s) { F.sort = s.dataset.bsort; load(false); return; }
      if (e.target.closest('#dmore')) load(true);
    });
  }

  // ---------------------------------------------------------------- THREAD
  async function thread() {
    const T = await API.d.thread(comm, postSlug).catch(() => null);
    if (!T) return notFound('This discussion isn’t here', 'It may have been removed, or the link is wrong.');
    const P = T.post, C = T.community;
    document.title = `${P.title} : h/${C.slug} | Hentity`;
    let sort = 'best', shown = 30;
    const byParent = {};
    const index = () => { Object.keys(byParent).forEach(x => delete byParent[x]); T.comments.forEach(c => { (byParent[c.parent_id || 'root'] = byParent[c.parent_id || 'root'] || []).push(c); }); };
    const order = list => list.slice().sort((a, b) => sort === 'new' ? new Date(b.created_at) - new Date(a.created_at)
      : sort === 'makers' ? (b.is_maker - a.is_maker) || (b.score - a.score) : (b.score - a.score) || (new Date(a.created_at) - new Date(b.created_at)));
    const count = id => (byParent[id] || []).reduce((s, c) => s + 1 + count(c.id), 0);
    function comment(c) {
      const kids = order(byParent[c.id] || []);
      return `<div class="dc" id="c-${c.id}" data-c="${c.id}">
        <div class="dc-h">${c.deleted ? '<span class="avatar avatar--xs"></span><span class="c-3">deleted</span>' : `${avatar(c.author, 'xs')}<a class="dc-u" href="/makers/${esc(c.author.username)}">${esc(handle(c.author))}</a><span data-bm="${esc(c.author.id || '')}"></span>${tagPill(c.author.tag)}`}<span class="c-3">${ago(c.created_at)}${c.edited_at ? ' · edited' : ''}</span></div>
        <div class="dc-b">${c.deleted ? '<p class="c-3"><i>This reply was deleted.</i></p>' : rich(c.body)}</div>
        ${c.deleted ? '' : `<div class="dc-a">${votes('comment', c, true)}<button type="button" data-reply="${c.id}">${icon('reply', 'ic-14')}Reply</button><button type="button" data-share="/d/${C.slug}/${P.slug}#c-${c.id}" data-title="${esc(P.title)}">${icon('share', 'ic-14')}Share</button>
          ${c.mine ? `<button type="button" data-cedit="${c.id}">Edit</button><button type="button" data-cdel="${c.id}">Delete</button>` : `<button type="button" data-report="d_comment:${c.id}">Report</button>`}</div>`}
        <div class="dc-rbox" data-rbox="${c.id}"></div>
        ${kids.length ? `<div class="dc-kids">${kids.map(comment).join('')}</div>` : ''}</div>`;
    }
    const replyForm = (parent, val) => `<form class="dreply" data-parent="${parent || ''}"><textarea class="input" rows="${parent ? 3 : 3}" maxlength="10000" placeholder="${parent ? 'Write a reply' : 'Add a comment'}" required>${esc(val || '')}</textarea><div class="row gap-8" style="justify-content:flex-end;margin-top:8px">${parent ? '<button class="btn btn--ghost btn--sm" type="button" data-cancel>Cancel</button>' : ''}<button class="btn btn--primary btn--sm" type="submit">${parent ? 'Reply' : 'Comment'}</button></div></form>`;
    const modMenu = () => T.can_moderate ? `<div class="dmod"><span class="t-caption c-3" style="font-weight:400">Makers:</span>${C.kind === 'product' ? ['planned', 'in_progress', 'shipped', 'fixed'].map(s => `<button class="chip chip--sm" type="button" data-status="${s}" aria-pressed="${P.status === s}">${STATUS[s][0]}</button>`).join('') : ''}<button class="chip chip--sm" type="button" data-pin aria-pressed="${!!P.pinned}">${icon('pin', 'ic-12')}${P.pinned ? 'Pinned' : 'Pin'}</button></div>` : '';
    function paint() {
      index();
      const top = order(byParent.root || []), total = T.comments.length;
      const pr = P.product;
      root.innerHTML = `<div class="dwrap dwrap--thread">
        <div class="dmtop m-only-f"><a class="nav__icon" href="/d/${esc(C.slug)}" aria-label="Back">${icon('arrow-left')}</a><a class="row gap-6 t-label" href="/d/${esc(C.slug)}">${dot(C)}h/${esc(C.slug)}</a><button class="nav__icon" type="button" data-share="/d/${C.slug}/${P.slug}" data-title="${esc(P.title)}" aria-label="Share" style="margin-left:auto">${icon('share', 'ic-20')}</button></div>
        <div class="dgrid"><div class="dmain">
        <nav class="dcrumbs d-only" aria-label="Breadcrumb"><a href="/discuss">Discuss</a><span>/</span><a href="/d/${esc(C.slug)}">h/${esc(C.slug)}</a><span>/</span><b>${esc(P.title.length > 32 ? P.title.slice(0, 30) + '…' : P.title)}</b></nav>
        <article class="dpost card">
          ${votes('post', P)}
          <div class="dpost-b">
            <div class="dmeta"><a class="dmeta-c d-only" href="/d/${esc(C.slug)}">${dot(C)}h/${esc(C.slug)}</a><span class="c-3"><span class="d-only">· </span><a href="/makers/${esc(P.author.username)}">${esc(handle(P.author))}</a></span><span data-bm="${esc(P.author.id || '')}"></span>${tagPill(P.author.tag)}<span class="c-3">· ${ago(P.created_at)}${P.edited_at ? ' · edited' : ''}</span>${P.pinned ? `<span class="dp dp--gray dmeta-pin">${icon('pin', 'ic-12')}Pinned</span>` : ''}</div>
            <div class="dflair">${flairPill(P.flair)}${statusPill(P.status)}</div>
            <h1 class="dh1">${esc(P.title)}</h1>
            <div class="dbody">${rich(P.body)}</div>
            ${(P.images || []).length ? `<div class="dimgs">${P.images.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="" loading="lazy"></a>`).join('')}</div>` : ''}
            ${P.link_url ? `<a class="dlink" href="${esc(P.link_url)}" target="_blank" rel="noopener nofollow ugc">${icon('link', 'ic-14')}${esc(P.link_url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 70))}</a>` : ''}
            ${pr ? `<div class="dpcard">${plogo(pr, 44)}<div style="min-width:0;flex:1"><p class="t-label">${esc(pr.name)}</p><p class="t-caption c-3 truncate" style="font-weight:400">${esc([pr.tagline, (pr.categories || [])[0], pr.city].filter(Boolean).join(' · '))}</p></div><a class="btn btn--secondary btn--sm" href="/products/${esc(pr.slug)}">View on Hentity</a></div>` : ''}
            <div class="dact">${votes('post', P, true)}<a href="#comments">${icon('comment', 'ic-14')}${n(P.comment_count)}<span class="d-only">comment${P.comment_count === 1 ? '' : 's'}</span></a><button type="button" data-share="/d/${C.slug}/${P.slug}" data-title="${esc(P.title)}">${icon('share', 'ic-14')}Share</button><button type="button" data-save="${P.id}" aria-pressed="${!!P.saved}">${icon('bookmark', 'ic-14')}${P.saved ? 'Saved' : 'Save'}</button>
              ${P.mine ? `<button type="button" data-pedit>${icon('edit', 'ic-14')}Edit</button><button type="button" data-pdel>Delete</button>` : `<button type="button" data-report="d_post:${P.id}">${icon('alert-circle', 'ic-14')}Report</button>`}</div>
            ${modMenu()}
          </div></article>
        ${signedIn() ? `<div class="card dcompose" id="comments">${replyForm(null)}</div>` : `<div class="card djoinbar" id="comments"><div><p class="t-label">Join the conversation</p><p class="t-caption c-3" style="font-weight:400">Sign in to reply and vote.</p></div><div class="row gap-8"><a class="btn btn--secondary btn--sm" href="/signin?next=${encodeURIComponent(location.pathname)}">Sign in</a><a class="btn btn--accent btn--sm" href="/signup?next=${encodeURIComponent(location.pathname)}">Join Hentity</a></div></div>`}
        ${total ? `<div class="dcsort"><span class="c-3">Sort by</span>${[['best', 'Best'], ['new', 'New'], ['makers', 'Makers first']].map(([s, l]) => `<button class="chip chip--sm" type="button" data-csort="${s}" aria-pressed="${sort === s}">${sort === s ? icon('check') : ''}${l}</button>`).join('')}</div>
          <section class="card dcs">${top.slice(0, shown).map(comment).join('')}${top.length > shown ? `<button class="link link--accent dmorec" type="button" id="dmorec">${icon('plus', 'ic-14')}Show ${n(top.slice(shown).reduce((s, c) => s + 1 + count(c.id), 0))} more comments</button>` : ''}</section>`
          : `<p class="t-body-sm c-3 dnone">No replies yet. ${signedIn() ? 'Be the first to help.' : ''}</p>`}
        </div>
        <aside class="drail">
          <section class="card drail-c"><a class="row gap-10" href="/d/${esc(C.slug)}" style="align-items:center">${dot(Object.assign({}, C, { logo_url: pr && C.kind === 'product' ? pr.logo_url : null }))}<span><b>h/${esc(C.slug)}</b><small class="c-3" style="display:block"><span data-members="${esc(C.slug)}">${k(C.member_count)} member${C.member_count === 1 ? '' : 's'}</span></small></span></a>
            <p class="t-body-sm c-2" style="margin:10px 0 12px">${esc(C.about || '')}</p><button class="btn btn--sm btn--block ${C.joined ? 'btn--secondary' : 'btn--primary'}" type="button" data-join="${esc(C.slug)}" data-lbl="Join community" aria-pressed="${!!C.joined}">${C.joined ? icon('check', 'ic-14') + 'Joined' : 'Join community'}</button></section>
          ${(T.related || []).length ? `<section class="card drail-c"><p class="t-label">Related discussions</p>${T.related.map(r => `<a class="drel" href="/d/${esc(r.community)}/${esc(r.slug)}"><span>${esc(r.title)}</span><small>h/${esc(r.community)} · ${n(r.comment_count)} comment${r.comment_count === 1 ? '' : 's'}</small></a>`).join('')}</section>` : ''}
        </aside></div>
        ${signedIn() ? '<button class="dmbar m-only-f" type="button" data-focus-reply>Add a comment</button>' : `<a class="dmbar m-only-f" href="/signin?next=${encodeURIComponent(location.pathname)}">Sign in to add a comment</a>`}
      </div>`;
      H.contentShown();
      if (window.B) B.decorate(root);   // each person's first featured badge after their name
      if (location.hash.startsWith('#c-')) { const el = document.getElementById(location.hash.slice(1)); if (el) { el.classList.add('is-hl'); el.scrollIntoView({ block: 'center' }); } }
    }
    paint();
    root.addEventListener('click', async e => {
      const cs = e.target.closest('[data-csort]'); if (cs) { sort = cs.dataset.csort; paint(); return; }
      if (e.target.closest('#dmorec')) { shown += 50; paint(); return; }
      if (e.target.closest('[data-focus-reply]')) { const box = qs('.dcompose'); if (box) { box.classList.add('is-open'); const t = box.querySelector('textarea'); t.scrollIntoView({ block: 'center' }); t.focus(); } return; }
      const r = e.target.closest('[data-reply]'); if (r) { if (need('Sign in to reply')) return; const box = qs(`[data-rbox="${r.dataset.reply}"]`); if (box.innerHTML) { box.innerHTML = ''; return; } box.innerHTML = replyForm(r.dataset.reply); box.querySelector('textarea').focus(); return; }
      if (e.target.closest('[data-cancel]')) { e.target.closest('.dc-rbox').innerHTML = ''; return; }
      const ce = e.target.closest('[data-cedit]'); if (ce) { const c = T.comments.find(x => x.id === ce.dataset.cedit); const v = await H.ask('Edit your reply', { value: c.body, multiline: true, ok: 'Save', max: 10000 }); if (v == null) return; try { await API.d.replyEdit(c.id, v); c.body = v; c.edited_at = new Date().toISOString(); paint(); toast('Reply updated'); } catch (er) { H.fail(er); } return; }
      const cd = e.target.closest('[data-cdel]'); if (cd) { if (!(await H.confirm('Delete this reply?', { body: 'Replies under it stay, so the thread still makes sense.', ok: 'Delete', danger: true }))) return; try { await API.d.replyRemove(cd.dataset.cdel); const c = T.comments.find(x => x.id === cd.dataset.cdel); c.deleted = true; c.body = ''; paint(); toast('Reply deleted'); } catch (er) { H.fail(er); } return; }
      const rp = e.target.closest('[data-report]'); if (rp) { if (need('Sign in to report')) return; const [t, id] = rp.dataset.report.split(':'); const why = await H.ask('What’s wrong with this?', { placeholder: 'Spam, abuse, misleading…', ok: 'Report' }); if (!why) return; try { await API.report(t, id, why); toast('Thanks. A moderator will take a look.'); } catch (er) { H.fail(er); } return; }
      if (e.target.closest('[data-pedit]')) { compose({ edit: P, comm: C.slug }); return; }
      if (e.target.closest('[data-pdel]')) { if (!(await H.confirm('Delete this post?', { body: 'It disappears from Discuss for everyone.', ok: 'Delete', danger: true }))) return; try { await API.d.remove(P.id); toast('Post deleted'); location.href = '/d/' + C.slug; } catch (er) { H.fail(er); } return; }
      const sb = e.target.closest('[data-status]'); if (sb) { const s = P.status === sb.dataset.status ? null : sb.dataset.status; try { await API.d.set(P.id, { status: s }); P.status = s; paint(); toast(s ? 'Marked ' + STATUS[s][0] : 'Status cleared'); } catch (er) { H.fail(er); } return; }
      if (e.target.closest('[data-pin]')) { try { await API.d.set(P.id, { pinned: !P.pinned }); P.pinned = !P.pinned; paint(); toast(P.pinned ? 'Pinned' : 'Unpinned'); } catch (er) { H.fail(er); } return; }
    });
    root.addEventListener('submit', async e => {
      const f = e.target.closest('.dreply'); if (!f) return; e.preventDefault();
      const body = f.querySelector('textarea').value.trim(); if (body.length < 2) return;
      const b = f.querySelector('[type=submit]'); b.disabled = true;
      try { const c = await API.d.reply(P.id, f.dataset.parent || null, body); T.comments.push(c); P.comment_count++; if (sort === 'best' && !f.dataset.parent) sort = 'new'; paint(); const el = document.getElementById('c-' + c.id); if (el) { el.classList.add('is-hl'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }
      catch (er) { H.fail(er); b.disabled = false; }
    });
  }

  function notFound(t, s) { root.innerHTML = `<div class="dwrap" style="text-align:center;padding-top:96px"><h1 class="t-h2">${esc(t)}</h1><p class="c-2" style="margin:8px 0 20px">${esc(s)}</p><a class="btn btn--secondary btn--sm" href="/discuss">Go to Discuss</a></div>`; H.contentShown(); }

  // ---------------------------------------------------------------- COMPOSER
  async function compose(o = {}) {
    if (need('Sign in to start a discussion')) return;
    const editing = o.edit;
    const list = editing ? [] : await API.d.postable().catch(() => []);
    let C = editing ? { slug: o.comm } : (list.find(x => x.slug === (o.comm || '')) || list.find(x => x.slug === 'ask-founders') || list[0]);
    let flair = editing ? editing.flair : '', product = null, images = [], link = '';
    const flairsFor = c => c && c.kind === 'product' ? ['feature', 'bug', 'review', 'question'].concat(c.mine ? ['announcement'] : []) : ['question', 'feedback', 'review', 'show', 'discussion'];
    const sc = document.createElement('div'); sc.className = 'scrim dscrim'; sc.style.zIndex = 95;
    sc.innerHTML = `<form class="modal dcomp" role="dialog" aria-modal="true" aria-label="Start a discussion">
      <div class="dcomp-top"><button class="nav__icon" type="button" data-x aria-label="Close">${icon('x')}</button><p class="t-label">${editing ? 'Edit your post' : 'Start a discussion'}</p><button class="btn btn--accent btn--sm" type="submit" id="dpost">${editing ? 'Save' : 'Post'}</button></div>
      <div class="dcomp-b">
        ${editing ? '' : `<label class="dcomp-c"><span id="dcc"></span>${icon('chevron-down', 'ic-16')}<select id="dcs" aria-label="Community">${list.map(c => `<option value="${esc(c.slug)}"${C && c.slug === C.slug ? ' selected' : ''}>h/${esc(c.slug)}${c.kind === 'product' ? ' · ' + esc(c.title) : ''}</option>`).join('')}</select></label>
        <div class="dchips dcomp-f" id="dfl"></div>`}
        <textarea class="dcomp-t" id="dtt" rows="2" maxlength="160" placeholder="Title" required>${esc(editing ? editing.title : '')}</textarea>
        <p class="dcomp-hint">${icon('search', 'ic-12')}Clear titles that say what and where get found in search.</p>
        <textarea class="dcomp-x" id="dtx" rows="6" maxlength="20000" placeholder="Add details. What did you build, what happened, what do you want to know?">${esc(editing ? editing.body : '')}</textarea>
        ${editing ? '' : `<div class="dimgs dimgs--edit" id="dim"></div>
        <div class="dcomp-att"><label class="chip" style="cursor:pointer">${icon('image', 'ic-14')}Photos<input type="file" accept="image/*" multiple class="sr-only" id="dfi"></label><button class="chip" type="button" id="dla">${icon('link', 'ic-14')}Link</button><button class="chip" type="button" id="dpa">${icon('package', 'ic-14')}Product</button></div>
        <div id="dlk"></div><div id="dpk"></div>`}
      </div></form>`;
    document.body.append(sc); document.body.style.overflow = 'hidden';
    const f = sc.firstElementChild;
    const close = () => { sc.remove(); document.body.style.overflow = ''; };
    sc.addEventListener('click', e => { if (e.target === sc || e.target.closest('[data-x]')) close(); });
    document.addEventListener('keydown', function kd(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', kd); } });
    const paintC = () => {
      if (editing) return;
      f.querySelector('#dcc').innerHTML = C ? `${dot(Object.assign({}, C, { logo_url: C.product && C.product.logo_url }))}<span><b>h/${esc(C.slug)}</b><small>${C.kind === 'product' ? esc(C.title) + ' · ' : ''}${k(C.member_count)} member${C.member_count === 1 ? '' : 's'}</small></span>` : 'Pick a community';
      const fl = flairsFor(C); if (!fl.includes(flair)) flair = fl[0];
      f.querySelector('#dfl').innerHTML = fl.map(x => `<button class="chip" type="button" data-fl="${x}" aria-pressed="${flair === x}">${flair === x ? icon('check') : ''}${FLAIR[x][0]}</button>`).join('');
      paintP();
    };
    const paintP = () => {
      const el = f.querySelector('#dpk'); if (!el) return;
      const auto = C && C.kind === 'product' && C.product;
      const pp = product || (auto ? Object.assign({ mine: C.mine }, C.product) : null);
      el.innerHTML = pp ? `<div class="dcomp-p">${plogo(pp, 32)}<span><b>${esc(pp.name)}</b><small>${pp.mine ? 'You’re a maker, so your post gets a Maker tag' : 'Your post links to its Hentity page'}</small></span>${product ? `<button class="nav__icon" type="button" id="dpx" aria-label="Remove product">${icon('x', 'ic-14')}</button>` : ''}</div>` : '';
    };
    const paintI = () => { const el = f.querySelector('#dim'); if (el) el.innerHTML = images.map((u, i) => `<span><img src="${esc(u)}" alt=""><button type="button" data-rmi="${i}" aria-label="Remove photo">${icon('x', 'ic-12')}</button></span>`).join(''); };
    paintC();
    f.addEventListener('change', async e => {
      if (e.target.id === 'dcs') { C = list.find(x => x.slug === e.target.value); product = null; paintC(); }
      if (e.target.id === 'dfi') {
        const files = [...e.target.files].slice(0, 6 - images.length);
        for (const file of files) { if (file.size > 8 * 1024 * 1024) { toast('Photos can be up to 8 MB', 'error'); continue; } try { toast('Uploading…'); images.push(await API.upload(file, 'discuss')); paintI(); } catch (er) { H.fail(er); } }
        e.target.value = '';
      }
    });
    f.addEventListener('click', async e => {
      const fb = e.target.closest('[data-fl]'); if (fb) { flair = fb.dataset.fl; paintC(); return; }
      const ri = e.target.closest('[data-rmi]'); if (ri) { images.splice(+ri.dataset.rmi, 1); paintI(); return; }
      if (e.target.closest('#dla')) { f.querySelector('#dlk').innerHTML = `<input class="input" id="dli" type="url" placeholder="https://" value="${esc(link)}" style="margin-top:10px">`; f.querySelector('#dli').focus(); return; }
      if (e.target.closest('#dpx')) { product = null; paintP(); return; }
      if (e.target.closest('#dpa')) {
        const el = f.querySelector('#dpk');
        el.innerHTML = `<div class="dcomp-ps"><input class="input" id="dps" placeholder="Search products on Hentity" autocomplete="off"><div id="dpr"></div></div>`;
        const inp = el.querySelector('#dps'); inp.focus(); let t;
        inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(async () => { const v = inp.value.trim(); if (v.length < 2) return; const rows = await API.d.products(v).catch(() => []); el.querySelector('#dpr').innerHTML = rows.map(r => `<button class="dcomp-po" type="button" data-pick='${esc(JSON.stringify({ slug: r.slug, name: r.name, logo_url: r.logo_url, color: r.color, mine: r.owner_id === API.uid }))}'>${plogo(r, 28)}${esc(r.name)}</button>`).join('') || '<p class="t-caption c-3" style="padding:8px">No products match.</p>'; }, 200); });
        return;
      }
      const pk = e.target.closest('[data-pick]'); if (pk) { product = JSON.parse(pk.dataset.pick); paintP(); return; }
    });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const title = f.querySelector('#dtt').value.trim(), body = f.querySelector('#dtx').value.trim();
      link = (f.querySelector('#dli') || {}).value || link;
      if (title.length < 8) return toast('Give your post a clear title (at least 8 characters)');
      if (link && !/^https?:\/\//i.test(link)) return toast('Links start with https://');
      const b = f.querySelector('#dpost'); b.disabled = true;
      try {
        if (editing) { await API.d.edit(editing.id, title, body); toast('Post updated'); close(); location.reload(); return; }
        const r = await API.d.create({ comm: C.slug, flair, title, body, product: product && product.slug, link, images });
        close(); location.href = `/d/${r.community}/${r.slug}`;
      } catch (er) { H.fail(er); b.disabled = false; }
    });
    setTimeout(() => f.querySelector('#dtt').focus(), 50);
  }

  // ---------------------------------------------------------------- go
  (async () => {
    await API.ready;
    if (view === 'thread') await thread(); else if (view === 'board') await board(); else await feed();
    if (H.params().get('new') === '1') { const u = new URL(location.href); u.searchParams.delete('new'); history.replaceState(null, '', u); compose({ comm }); }
  })();
  window.DSC = { compose };
})();
