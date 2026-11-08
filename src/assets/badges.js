/* Founder badges (Figma 348:1520): definitions, the badge tile, the detail sheet, the "new badge" moment and the Discuss mark.
   Used by /badges, maker profiles and Discuss; app.js loads it when a new badge is waiting. */
(function () {
  if (window.B) return;
  const { esc, icon } = H;
  // Tones are the avatar palette ([background, ink]), matching the Figma badge fills
  const T = { cyan: ['#e3f6f8', '#0e7490'], yellow: ['#fff3d1', '#8a5a00'], orange: ['#ffe8dc', '#b4430e'], purple: ['#f0edff', '#5b3fd1'], olive: ['#eef2e3', '#4d6b12'], pink: ['#ffe6f0', '#b0306a'], blue: ['#e3f0ff', '#1e5fa8'], green: ['#e3f9ee', '#127a45'] };
  const AREAS = [['launch', 'Launch'], ['build', 'Build and test'], ['community', 'Community'], ['team', 'Team and funding'], ['hentity', 'Hentity']];
  const D = {
    first_launch: { name: 'First launch', area: 'launch', ic: 'rocket', tone: 'orange', line: 'Your first product went live on Hentity', how: 'Launch a product. When it goes live on Hentity, the badge is added automatically.' },
    top_day: { name: 'Top of the day', area: 'launch', ic: 'tri', tone: 'orange', line: 'A product of yours finished #1 on its launch day', how: 'Finish #1 on your launch day. Only upvotes from other members, made that day, count. A tie for first doesn’t.' },
    shipper: { name: 'Shipper', area: 'launch', ic: 'package', tone: 'orange', levels: [3, 10, 25], unit: 'update', line: 'Post product updates: 3 for I, 10 for II, 25 for III', how: 'Mark roadmap items as shipped on your product page. Level I at 3 updates, II at 10, III at 25.' },
    idea_tested: { name: 'Idea tested', area: 'build', ic: 'flask', tone: 'blue', line: 'Run your first idea through Validate', how: 'Check an idea with Validate. The badge is added as soon as your first report is ready.', cta: ['Validate an idea', '/validate'] },
    beta_host: { name: 'Beta host', area: 'build', ic: 'users', tone: 'cyan', target: 10, line: 'Run a beta test that 10 testers finish', how: 'Run a beta test from Studio. When 10 testers have sent their notes, the badge is added automatically.', cta: ['Open Studio', '/studio'] },
    good_listener: { name: 'Good listener', area: 'build', ic: 'reply', tone: 'cyan', target: 20, line: 'Reply to 20 reviews or beta notes', how: 'Reply to reviews of your products and to notes from beta testers. 20 replies earns it.', cta: ['Reply to reviews', '/my-products'] },
    first_thread: { name: 'First thread', area: 'community', ic: 'comment', tone: 'purple', line: 'Start a discussion in Discuss', how: 'Start a discussion in any Discuss community.', cta: ['Start a discussion', '/discuss'] },
    helpful: { name: 'Helpful', area: 'community', ic: 'smile', tone: 'pink', levels: [25, 100, 500], unit: 'upvote', line: 'Answers upvoted by verified members: 25, 100, 500', how: 'Answer questions in Discuss. Upvotes count only from verified members, never your own. Level I at 25, II at 100, III at 500.', cta: ['Answer in Discuss', '/discuss'] },
    reviewer: { name: 'Reviewer', area: 'community', ic: 'star', tone: 'purple', target: 5, line: 'Review 5 other founders’ products', how: 'Write reviews of other founders’ products. Five reviews earns it.', cta: ['Find products to review', '/'] },
    team_builder: { name: 'Team builder', area: 'team', ic: 'user', tone: 'green', line: 'Hire through Find, confirmed by both sides', how: 'Match with someone in Find, open up to each other, then make it official with a trial.', cta: ['Open Find', '/find'] },
    room_ready: { name: 'Room ready', area: 'team', ic: 'list', tone: 'olive', line: 'Upload every Required document for your round', how: 'Add every document marked Required for your stage in the data room.', cta: ['Open data room', '/data-room'] },
    first_investor: { name: 'First investor', area: 'team', ic: 'key', tone: 'olive', line: 'An investor you approved opens your data room', how: 'Share your data room with a “Verified email” or “Only people I add” link. When an investor confirms their email and opens it, the badge is added.', cta: ['Open data room', '/data-room'] },
    early_builder: { name: 'Early builder', area: 'hentity', ic: 'sparkles', tone: 'yellow', line: 'Joined Hentity in its first year', how: 'Everyone who joined in Hentity’s first year has it. Thanks for being early.' },
    resource_giver: { name: 'Resource giver', area: 'hentity', ic: 'link', tone: 'yellow', line: 'Suggest a resource that makes it into the library', how: 'Suggest a tool, template or guide for the Resources library. When the team adds it, the badge is yours.', cta: ['Open Resources', '/resources'] }
  };
  const KEYS = Object.keys(D);
  const ROMAN = ['', 'I', 'II', 'III'];
  const day = t => t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const month = t => t ? new Date(t).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '';
  const n = x => Number(x || 0).toLocaleString('en-GB');
  const TRI = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4.2 17 15.8H3z" fill="currentColor"/></svg>';
  const STAGE = { ff: 'friends & family', seed: 'Seed', growth: 'Growth' };

  // The badge itself: size in px; locked = dashed ring + lock pip; level shows a I/II/III pip
  function tile(k, o = {}) {
    const d = D[k] || {}, s = o.size || 64, [bg, fg] = T[d.tone] || T.orange;
    const pip = o.locked ? `<span class="fb__pip">${icon('lock')}</span>` : (d.levels && o.level ? `<span class="fb__pip fb__pip--t">${ROMAN[o.level]}</span>` : '');
    return `<span class="fb${o.locked ? ' fb--locked' : ''}" style="--s:${s}px;--fb-bg:${bg};--fb-fg:${fg}" role="img" aria-label="${esc(d.name || k)}${o.locked ? ' (not earned yet)' : ''}"><span class="fb__ring"></span>${d.ic === 'tri' ? TRI : icon(d.ic)}${s >= 40 ? pip : ''}</span>`;
  }
  const title = (k, lvl) => D[k].name + (D[k].levels && lvl ? ` · Level ${ROMAN[lvl]}` : '');

  // One line on what it was earned for, with the real numbers
  function why(k, e, who) {
    const r = e.ref ? esc(e.ref) : '', at = e.earned_at || e.at;
    return {
      first_launch: r ? `${r} went live on ${day(at)}.` : `First product went live on ${day(at)}.`,
      top_day: r ? `${r} finished #1 on its launch day, ${day(at)}.` : `Finished #1 on a launch day, ${day(at)}.`,
      shipper: `${n(e.stat)} product update${e.stat === 1 ? '' : 's'} shipped.`,
      idea_tested: `Ran ${who ? 'an' : 'your first'} idea through Validate on ${day(at)}.`,
      beta_host: `${n(e.stat)} testers finished ${r ? 'the ' + r + ' beta' : 'a beta'}.`,
      good_listener: `Replied to ${n(e.stat)} reviews and beta notes.`,
      first_thread: `Started a discussion on ${day(at)}.`,
      helpful: `${n(e.stat)} upvotes on answers from verified members.`,
      reviewer: `Reviewed ${n(e.stat)} other founders’ products.`,
      team_builder: 'Made a hire official through Find.',
      room_ready: 'Every required document for the round is in the data room.',
      first_investor: `An investor opened the data room on ${day(at)}.`,
      early_builder: `Joined Hentity in ${month(at)}, its first year.`,
      resource_giver: 'Suggested a resource that made it into the library.'
    }[k] || '';
  }
  // Short line for profile cards
  function short(k, e) {
    const r = e.ref ? esc(e.ref) : '';
    return {
      first_launch: r ? `${r} went live ${month(e.earned_at)}` : 'First product live', top_day: r ? `${r} was #1 on ${day(e.earned_at)}` : 'Finished #1 on launch day',
      shipper: `${n(e.stat)} product updates posted`, idea_tested: 'Tested an idea with Validate', beta_host: `${n(e.stat)} testers finished a beta`,
      good_listener: `Replied to ${n(e.stat)} reviews and notes`, first_thread: 'Started a discussion', helpful: `${n(e.stat)} upvotes from verified members`,
      reviewer: `Reviewed ${n(e.stat)} products`, team_builder: 'Hired through Find', room_ready: 'Data room ready for investors',
      first_investor: 'An investor opened the data room', early_builder: `On Hentity since ${month(e.earned_at)}`, resource_giver: 'Added to the Resources library'
    }[k] || D[k].line;
  }

  // ---- sheets (modal on desktop, bottom sheet on phones)
  function sheet(html, cls) {
    const el = document.createElement('div'); el.className = 'scrim fb-scrim';
    el.innerHTML = `<div class="modal fb-modal ${cls || ''}" role="dialog" aria-modal="true"><span class="fb-grab" aria-hidden="true"></span><button class="nav__icon fb-x" type="button" data-x aria-label="Close">${icon('x')}</button>${html}</div>`;
    document.body.append(el);
    const prev = document.activeElement;
    const close = () => { el.remove(); document.removeEventListener('keydown', k); if (prev && prev.focus) prev.focus(); el.dispatchEvent(new Event('closed')); };
    const k = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', k);
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-x]')) close(); });
    setTimeout(() => (el.querySelector('[data-focus]') || el.querySelector('.fb-x')).focus(), 30);
    el.close = close; return el;
  }
  const profileUrl = (u, k) => `${location.origin}/makers/${encodeURIComponent(u)}${k ? '?badge=' + k : ''}`;
  const linkedIn = u => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}`;
  async function copy(u) { try { await navigator.clipboard.writeText(u); H.toast('Link copied'); } catch (e) { H.ask('Copy this link', { value: u, ok: 'Done', optional: true }); } }

  // Detail: what it was earned for, how many hold it, how it's earned, feature toggle, share
  function detail(k, e, o = {}) {
    const d = D[k], earned = !!e && !o.locked, holders = (o.holders || {})[k] || 0;
    const stat = earned ? ({ shipper: [n(e.stat), 'updates shipped'], helpful: [n(e.stat), 'upvotes'], beta_host: [n(e.stat), 'testers finished'], good_listener: [n(e.stat), 'replies'], reviewer: [n(e.stat), 'reviews'] }[k]
      || (d.levels ? [ROMAN[e.level], 'level'] : [e.ref ? esc(e.ref) : '✓', e.ref ? 'for' : 'done'])) : null;
    const prog = !earned && o.eval ? o.eval : null;
    const el = sheet(`<div class="fb-d">${tile(k, { size: 88, level: e && e.level, locked: !earned })}
      <h2>${esc(title(k, e && e.level))}</h2>
      <p class="fb-d__sub">${earned ? (o.mine ? 'Earned ' + day(e.earned_at) + '. ' : '') + why(k, e, !o.mine) : esc(d.line) + '.'}</p>
      ${earned ? `<div class="fb-stats"><div><b>${stat[0]}</b><small>${stat[1]}</small></div><div><b>${n(holders)}</b><small>${holders === 1 ? 'founder has it' : 'founders have it'}</small></div><div><b>${month(e.earned_at)}</b><small>earned</small></div></div>`
        : prog ? `<div class="fb-stats fb-stats--one"><div><b>${progText(k, prog)}</b><small>${holders ? n(holders) + ' founder' + (holders === 1 ? ' has' : 's have') + ' it' : 'Be the first to earn it'}</small></div></div>` : ''}
      <div class="fb-how"><b>How it’s earned</b><p>${esc(d.how)}</p></div>
      ${o.mine && earned ? `<label class="fb-tg"><span>Feature on my profile</span><span class="toggle"><input type="checkbox" data-feature${(o.featured || []).includes(k) ? ' checked' : ''}><span class="toggle__track"></span></span></label>
        <div class="fb-acts"><button class="btn btn--secondary" type="button" data-copy>${icon('link', 'ic-16')}Copy link</button><a class="btn btn--primary" data-focus target="_blank" rel="noopener" href="${linkedIn(profileUrl(o.username, k))}">${icon('share', 'ic-16')}Share on LinkedIn</a></div>`
        : o.mine && d.cta ? `<a class="btn btn--primary btn--block" data-focus href="${d.cta[1]}">${esc(d.cta[0])} →</a>` : o.username && !o.mine ? `<a class="btn btn--secondary btn--block" href="/makers/${esc(o.username)}#badges">See all of @${esc(o.username)}’s badges</a>` : ''}</div>`);
    const f = el.querySelector('[data-feature]');
    f && (f.onchange = () => o.onFeature && o.onFeature(k, f.checked));
    const c = el.querySelector('[data-copy]'); c && (c.onclick = () => copy(profileUrl(o.username, k)));
    return el;
  }
  function progText(k, v) {
    const d = D[k];
    if (d.levels) { const nx = d.levels.find(x => x > (v.n || 0)) || d.levels[d.levels.length - 1]; return `${n(v.n)} of ${n(nx)}`; }
    if (k === 'room_ready') return v.stage ? `${n(v.n)} of ${n(v.target)}` : 'No room yet';
    return v.target > 1 ? `${n(v.n)} of ${n(v.target)}` : 'Not started';
  }

  // Shown once, the next time the founder opens Hentity after earning it
  function celebrate(nb, opts = {}) {
    const k = nb.badge, d = D[k]; if (!d) return;
    const el = sheet(`<div class="fb-d fb-new"><p class="fb-new__eye">${nb.level > 1 ? 'NEW LEVEL' : 'NEW BADGE'}</p>${tile(k, { size: 88, level: nb.level })}
      <h2>You’re ${/^[aeiou]/i.test(d.name) ? 'an' : 'a'} ${esc(title(k, nb.level))}</h2><p class="fb-d__sub">${why(k, nb)} ${k === 'early_builder' ? '' : 'Thanks for building in the open.'}</p>
      <label class="fb-tg"><span>Feature on my profile</span><span class="toggle"><input type="checkbox" data-feature${nb.featured ? ' checked' : ''}><span class="toggle__track"></span></span></label>
      <div class="fb-acts fb-acts--col"><a class="btn btn--primary btn--block" data-focus target="_blank" rel="noopener" href="${linkedIn(profileUrl(opts.username, k))}">${icon('share', 'ic-16')}Share on LinkedIn</a><a class="btn btn--secondary btn--block" href="/badges">See all badges</a></div></div>`, 'fb-modal--new');
    el.querySelector('[data-feature]').onchange = async ev => {
      try { const me = await API.badgeMe(); let f = (me.featured || []).filter(x => x !== k); if (ev.target.checked) f = [k, ...f].slice(0, 3); await API.badgeSet({ featured: f }); H.toast(ev.target.checked ? 'Featured on your profile' : 'Removed from your profile'); } catch (er) { H.fail(er); }
    };
    API.badgeSeen(k).catch(() => {});
    return el;
  }

  // Discuss: a small mark after a name; hover (or tap) shows what it was earned for
  const markHtml = (uid, m) => m && D[m.top] ? `<button class="fb-mark" type="button" data-bmark="${uid}" aria-label="${esc(title(m.top, m.level))} badge" style="--fb-bg:${T[D[m.top].tone][0]};--fb-fg:${T[D[m.top].tone][1]}">${D[m.top].ic === 'tri' ? TRI : icon(D[m.top].ic)}</button>` : '';
  let marks = {}, pop;
  async function loadMarks(ids) { const need = [...new Set(ids)].filter(id => id && !(id in marks)); if (need.length) { const r = await API.badgeMarks(need).catch(() => ({})); need.forEach(id => { marks[id] = r[id] || null; }); } return marks; }
  async function decorate(root) {
    const slots = [...root.querySelectorAll('[data-bm]')]; if (!slots.length) return;
    await loadMarks(slots.map(s => s.dataset.bm));
    slots.forEach(s => { s.innerHTML = markHtml(s.dataset.bm, marks[s.dataset.bm]); });
  }
  function popover(btn) {
    pop && pop.remove(); const m = marks[btn.dataset.bmark]; if (!m) return;
    const k = m.top, others = (m.others || []).filter(x => D[x]);
    pop = document.createElement('div'); pop.className = 'fb-pop'; pop.setAttribute('role', 'dialog');
    pop.innerHTML = `<div class="row gap-12" style="align-items:center">${tile(k, { size: 56, level: m.level })}<div style="min-width:0"><p class="t-label">${esc(title(k, m.level))}</p><p class="t-caption c-2" style="font-weight:400;margin-top:2px">${why(k, { stat: m.stat, ref: m.ref, earned_at: m.at }, true)}</p></div></div>
      <div class="fb-pop__f"><span class="row gap-4">${others.map(o => tile(o, { size: 20 })).join('')}${m.total > 1 ? `<span class="t-caption c-3" style="font-weight:400;margin-left:4px">+ ${m.total - 1} more badge${m.total === 2 ? '' : 's'}</span>` : ''}</span><a class="t-label" href="/makers/${esc(m.username)}#badges">Profile ${icon('arrow-right', 'ic-14')}</a></div>`;
    document.body.append(pop);
    const r = btn.getBoundingClientRect(), w = Math.min(300, innerWidth - 24);
    pop.style.width = w + 'px'; pop.style.left = Math.max(12, Math.min(r.left - 16, innerWidth - w - 12)) + 'px'; pop.style.top = (r.bottom + scrollY + 8) + 'px';
  }
  let hideT;
  document.addEventListener('click', e => { const b = e.target.closest('[data-bmark]'); if (b) { e.preventDefault(); popover(b); return; } if (pop && !e.target.closest('.fb-pop')) { pop.remove(); pop = null; } });
  document.addEventListener('mouseover', e => { const b = e.target.closest('[data-bmark]'); if (b && matchMedia('(hover:hover)').matches) { clearTimeout(hideT); popover(b); } else if (pop && e.target.closest('.fb-pop')) clearTimeout(hideT); });
  document.addEventListener('mouseout', e => { if (pop && (e.target.closest('[data-bmark]') || e.target.closest('.fb-pop')) && matchMedia('(hover:hover)').matches) { clearTimeout(hideT); hideT = setTimeout(() => { pop && pop.remove(); pop = null; }, 250); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && pop) { pop.remove(); pop = null; } });

  const css = document.createElement('style');
  css.textContent = `
.fb{--s:64px;position:relative;flex:none;width:var(--s);height:var(--s);border-radius:calc(var(--s)*.3125);background:var(--fb-bg);color:var(--fb-fg);display:inline-grid;place-items:center}
.fb__ring{position:absolute;inset:6.25%;border-radius:calc(var(--s)*.25);border:1px solid color-mix(in srgb,var(--fb-fg) 22%,transparent)}
.fb>.ic{width:calc(var(--s)*.4375);height:calc(var(--s)*.4375)}
.fb--locked{background:var(--color-bg-muted,#f2f2f2);color:#a3a3a3}.fb--locked .fb__ring{border:1px dashed #c4c4c4}
.fb__pip{position:absolute;left:calc(var(--s)*.75);top:calc(var(--s)*.75);width:22px;height:22px;border-radius:11px;background:#fff;border:1px solid #ebebeb;display:grid;place-items:center;color:#3d3d3d;font:500 10px/1 var(--font-mono)}
.fb__pip .ic{width:11px;height:11px;color:#525252}
.fb-mark{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:6px;background:var(--fb-bg);color:var(--fb-fg);border:0;padding:0;margin-left:6px;vertical-align:middle;cursor:pointer}.fb-mark .ic{width:12px;height:12px}
.fb-pop{position:absolute;z-index:90;background:var(--color-bg-canvas);border:1px solid var(--color-border-default);border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.14);padding:16px;animation:fade .12s}
.fb-pop__f{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px}.fb-pop__f a{display:inline-flex;align-items:center;gap:4px}
.fb-pop .fb{--s:20px;border-radius:6px}.fb-pop .fb .fb__ring{display:none}
.fb-modal{max-width:376px;position:relative;padding:28px 24px 24px}.fb-x{position:absolute;right:12px;top:12px}.fb-grab{display:none}
.fb-d{display:flex;flex-direction:column;align-items:center;text-align:center}
.fb-d h2{font-size:20px;line-height:28px;font-weight:600;letter-spacing:-.01em;margin-top:14px}
.fb-d__sub{font-size:13px;line-height:18px;color:var(--color-text-secondary);margin-top:6px}
.fb-stats{display:grid;grid-template-columns:repeat(3,1fr);width:100%;border:1px solid var(--color-border-default);border-radius:12px;padding:10px 4px;margin-top:16px}
.fb-stats--one{grid-template-columns:1fr}.fb-stats b{display:block;font:500 13px/18px var(--font-mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 6px}.fb-stats small{font-size:11px;line-height:14px;color:var(--color-text-tertiary)}
.fb-how{width:100%;text-align:left;background:var(--color-bg-subtle);border-radius:12px;padding:12px 14px;margin-top:12px}.fb-how b{font-size:13px;font-weight:500}.fb-how p{font-size:12px;line-height:16px;color:var(--color-text-secondary);margin-top:4px}
.fb-tg{display:flex;align-items:center;justify-content:space-between;width:100%;margin-top:14px;font-size:13px;font-weight:500;gap:12px;cursor:pointer}
.fb-acts{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;margin-top:14px}.fb-acts--col{grid-template-columns:1fr}
.fb-d>.btn{margin-top:14px}
.fb-new__eye{font:500 12px/16px var(--font-mono);letter-spacing:.08em;color:var(--color-accent-default,#ff5b14);margin-bottom:14px}
.fb-new .fb-tg{background:var(--color-bg-subtle);border-radius:12px;padding:10px 12px}
@media (max-width:768px){.fb-scrim{place-items:end stretch;padding:0}.fb-modal{max-width:none;border-radius:20px 20px 0 0;padding:10px 20px calc(20px + env(safe-area-inset-bottom));animation:sheetUp .32s cubic-bezier(.2,.8,.2,1)!important}
  .fb-grab{display:block;width:40px;height:4px;border-radius:99px;background:var(--color-border-strong,#d4d4d4);margin:0 auto 16px}.fb-x{display:none}}`;
  document.head.append(css);

  window.B = { D, KEYS, AREAS, T, ROMAN, tile, title, why, short, detail, celebrate, progText, decorate, loadMarks, markHtml, day, month, STAGE };
})();
