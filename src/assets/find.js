/* Find (Figma: Find) — shared bits for /find, /find/roles/:id, /find/post, /find/open, /find/m/:id, /find/privacy */
(function () {
  const { icon, esc, plogo, flag } = H;
  const KIND = { cofounder: ['Co-founder', 'k-co'], fulltime: ['Full-time', 'k-job'], parttime: ['Part-time', 'k-job'], contract: ['Contract', 'k-con'], internship: ['Internship', 'k-job'] };
  const AREA = { technical: 'Technical', business: 'Business', design: 'Design', growth: 'Growth', operations: 'Operations', other: 'Other' };
  const WORK = { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote OK' };
  const COMMIT = { fulltime: 'Full-time', parttime_first: 'Part-time first', flexible: 'Flexible' };
  const AVAIL = { now: 'Now', '3months': 'In 3 months', side: 'Side project' };
  const OPEN = { cofounder: 'co-founding', fulltime: 'full-time', parttime: 'part-time', contract: 'contract', internship: 'internship' };
  const STAGES = ['Idea', 'Pre-seed', 'Building', 'Has users', 'Revenue', 'Seed'];
  const CATS = ['Fintech', 'Commerce', 'Agriculture', 'Health', 'Logistics', 'Education', 'AI', 'Energy & Climate', 'Proptech', 'SaaS', 'Dev Tools', 'Infrastructure', 'Productivity', 'Apps'];
  const pct = n => (n === null || n === undefined || n === '') ? '' : (+n % 1 ? (+n).toFixed(1) : String(+n));
  function pay(r) {
    if (r.kind === 'cofounder' || r.pay === 'equity') return r.equity_min != null && r.equity_max != null ? `${pct(r.equity_min)}–${pct(r.equity_max)}% equity` : r.equity_min != null ? `${pct(r.equity_min)}% equity` : 'Equity';
    return [r.salary, r.equity_max ? `${pct(r.equity_max)}%` : ''].filter(Boolean).join(' + ') || (r.pay === 'stipend' ? 'Stipend' : 'Salary');
  }
  const pill = (t, cls) => `<span class="fpill ${cls || ''}">${t}</span>`;
  const catPill = c => c ? `<span class="fpill"><i class="dot" style="background:${H.catColor(c)}"></i>${esc(H.catShort ? H.catShort(c) : c)}</span>` : '';
  const initials = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const mini = (name, avatar, color) => avatar ? `<span class="fav" style="background:#fff url('${esc(avatar)}') center/cover"></span>` : `<span class="fav">${esc(initials(name))}</span>`;
  function startupMark(r, size) {
    const s = r.startup || {};
    if (r.stealth) return `<span class="flock" style="width:${size}px;height:${size}px">${icon('lock', size > 36 ? 'ic-20' : 'ic-16')}</span>`;
    return plogo({ name: s.name || '?', color: s.color || '#111', logo_url: s.logo_url }, size);
  }
  // Saved roles and people (Figma 223:231 Saved): a bookmark on every card, filled orange when saved
  const SAVED = { role: new Set(), person: new Set() };
  async function loadSaved() {
    if (!API.uid) return;
    const [r, p] = await Promise.all([API.bookmarks('role').catch(() => []), API.savedPeopleKeys().catch(() => [])]);
    r.forEach(x => SAVED.role.add(x.target_id)); (p || []).forEach(k => SAVED.person.add(k));
  }
  const saveBtn = (kind, id, cls) => { const on = SAVED[kind].has(id); return `<button class="nav__icon fsave ${cls || ''}" type="button" data-fsave="${kind}" data-id="${esc(id)}" aria-pressed="${on}" aria-label="${on ? 'Saved' : 'Save'}" title="${on ? 'Saved · tap to remove' : 'Save'}">${icon('bookmark', 'ic-18')}</button>`; };
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-fsave]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (!API.uid) { location.href = '/signin?next=' + encodeURIComponent(location.pathname); return; }
    const kind = b.dataset.fsave, id = b.dataset.id, on = b.getAttribute('aria-pressed') !== 'true';
    b.disabled = true;
    try {
      if (kind === 'person') await API.savePerson(id, on); else await API.bookmark('role', id, on);
      SAVED[kind][on ? 'add' : 'delete'](id);
      document.querySelectorAll(`[data-fsave="${kind}"][data-id="${CSS.escape(id)}"]`).forEach(x => { x.setAttribute('aria-pressed', on); x.setAttribute('aria-label', on ? 'Saved' : 'Save'); x.title = on ? 'Saved · tap to remove' : 'Save'; const t = x.querySelector('.fsave__t'); if (t) t.textContent = on ? 'Saved' : 'Save'; });
      H.toast(on ? 'Saved. Find it any time in Saved' : 'Removed from saved');
    } catch (err) { H.fail(err); } finally { b.disabled = false; }
  }, true);
  // Role card (Figma 172:6)
  function roleCard(r) {
    const k = KIND[r.kind] || KIND.cofounder, s = r.startup || {}, p = r.poster || {};
    const cta = r.mine ? `<a class="btn btn--secondary btn--sm" href="/find/post?edit=${r.id}">Edit</a>`
      : r.my_interest ? `<span class="fpill k-ok">${icon('check', 'ic-12')}${r.my_interest.status === 'accepted' ? 'Matched' : r.my_interest.mine ? 'Interest sent' : 'Invited you'}</span>`
      : `<a class="btn ${r.stealth ? 'btn--primary' : 'btn--secondary'} btn--sm" href="/find/roles/${r.id}">${r.kind === 'cofounder' ? 'I’m interested' : 'Apply'}</a>`;
    return `<article class="card fcard" data-href="/find/roles/${r.id}">
      <div class="row between gap-12"><span class="row gap-10" style="min-width:0">${startupMark(r, 32)}<span class="t-body-sm c-2 truncate">${esc(s.name)}</span>${s.verified && !r.stealth ? H.verified('ic-14') : ''}</span><span class="row gap-4"><span class="t-caption c-3" style="font-weight:400">${esc(H.ago(r.created_at))}</span>${r.mine ? '' : saveBtn('role', r.id)}</span></div>
      <h3 class="fcard__t">${esc(r.title)}</h3>
      <div class="fpills">${pill(k[0], k[1])}${catPill(r.category)}${pill(esc(pay(r)), 'k-pay')}${r.kind === 'cofounder' ? pill(COMMIT[r.commitment] || '') : r.duration ? pill(esc(r.duration)) : pill(k[0])}${r.stage ? pill(esc(r.stage)) : ''}</div>
      ${r.city || r.working ? `<p class="row gap-6 t-caption c-2" style="font-weight:400;margin-top:12px">${icon('pin', 'ic-14')}${esc([r.city, WORK[r.working]].filter(Boolean).join(' · '))}</p>` : ''}
      ${(r.skills || []).length ? `<div class="fskills">${r.skills.slice(0, 4).map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
      ${r.stealth ? `<p class="fnote">${icon('eye', 'ic-14')}Startup and founder revealed when you both say yes</p>` : ''}
      <div class="fcard__foot"><span class="row gap-10" style="min-width:0">${r.stealth ? `<span class="fav">${icon('user', 'ic-14')}</span>` : mini(p.name, p.avatar_url)}<span style="min-width:0"><span class="t-body-sm truncate" style="display:block;font-weight:500">${esc(p.name || '')}</span><span class="t-caption c-3" style="font-weight:400">${r.interest_count || 0} ${r.kind === 'cofounder' ? 'interested' : 'applied'}</span></span></span>${cta}</div>
    </article>`;
  }
  // Person card (Figma 172:1619)
  function personCard(u, opts) {
    opts = opts || {};
    const open = (u.open_to || []).map(k => OPEN[k]).filter(Boolean);
    const head = u.stealth ? `<span class="flock" style="width:40px;height:40px">${icon('lock', 'ic-16')}</span><span style="min-width:0"><span class="t-label truncate" style="display:block">${esc(u.what || 'Open to work')}</span><span class="t-caption c-3" style="font-weight:400">${esc([u.seniority, u.experience ? u.experience + (/\d$/.test(u.experience) ? ' yrs' : '') : ''].filter(Boolean).join(' · ') || 'Stealth profile')}</span></span>`
      : `${mini(u.name, u.avatar_url)}<span style="min-width:0"><span class="t-label truncate" style="display:block">${esc(u.name)}</span><span class="t-caption c-3" style="font-weight:400">${esc([u.what, u.experience].filter(Boolean).join(' · '))}</span></span>`;
    return `<article class="card fcard fperson">
      <div class="row gap-12" style="align-items:center">${head}${opts.noInvite || !u.key ? '' : saveBtn('person', u.key, 'fsave--end')}</div>
      ${u.stealth ? `<span class="fpill" style="margin-top:12px;align-self:flex-start">${icon('eye', 'ic-12')}Stealth · name hidden</span>` : ''}
      ${u.city || (u.looking_for || []).length ? `<p class="row gap-6 t-caption c-2" style="font-weight:400;margin-top:12px">${icon('pin', 'ic-14')}${esc([u.city, (u.looking_for || []).map(a => AREA[a]).filter(Boolean)[0]].filter(Boolean).join(' · '))}</p>` : ''}
      ${(u.strengths || []).length ? `<div class="fskills">${u.strengths.slice(0, 4).map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
      <p class="t-body-sm c-2" style="margin-top:12px">${u.wants ? 'Wants: ' + esc(u.wants) : open.length ? 'Open to: ' + esc(open.join(' or ')) + ((u.spaces || []).length ? ' · ' + esc(u.spaces.slice(0, 2).join(', ').toLowerCase()) : '') : ''}</p>
      ${opts.noInvite ? '' : `<button class="btn btn--secondary btn--sm btn--block" style="margin-top:14px" type="button" data-invite="${esc(u.key)}">Invite to a role</button>`}
    </article>`;
  }
  // What a stranger sees of my profile (preview cards on /find/open and /find/privacy)
  function previewMe(f, me, as) {
    const s = (f.show || {})[as === 'match' ? 'matches' : 'strangers'] || {};
    const showName = f.mode === 'visible' || as === 'match' ? (as === 'match' ? s.name !== false : true) : !!s.name;
    const u = { stealth: !showName, name: me && me.name, avatar_url: me && me.avatar_url, what: s.role === false && !showName ? '' : f.what, experience: f.experience, city: s.city === false && as !== 'match' ? '' : f.city,
      strengths: s.skills === false && as !== 'match' ? [] : f.strengths, spaces: f.spaces, open_to: f.open_to, looking_for: f.looking_for, wants: f.wants };
    return personCard(u, { noInvite: true });
  }
  function chips(name, opts, cur, multi) {
    const on = v => multi ? (cur || []).includes(v) : cur === v;
    return `<div class="chips" ${multi ? '' : 'data-single'} data-g="${name}">${opts.map(([v, l]) => `<button class="chip" type="button" data-chip data-v="${esc(v)}" aria-pressed="${on(v)}">${icon('check')}${esc(l)}</button>`).join('')}</div>`;
  }
  const readChips = (root, name) => [...root.querySelectorAll(`[data-g="${name}"] [aria-pressed="true"]`)].map(b => b.dataset.v);
  function radioCards(name, opts, cur) {
    return `<div class="stack gap-10" data-radio="${name}">${opts.map(([v, ic, t, d]) => `<label class="fradio${v === cur ? ' is-on' : ''}"><input type="radio" name="${name}" value="${v}" ${v === cur ? 'checked' : ''}><span class="fradio__dot"></span><span><span class="row gap-6 t-body-sm" style="font-weight:500">${icon(ic, 'ic-14')}${esc(t)}</span><span class="t-caption c-2" style="font-weight:400;display:block;margin-top:2px">${esc(d)}</span></span></label>`).join('')}</div>`;
  }
  function bindRadio(root, name, onChange) {
    root.querySelectorAll(`[data-radio="${name}"] input`).forEach(i => i.addEventListener('change', () => { root.querySelectorAll(`[data-radio="${name}"] .fradio`).forEach(l => l.classList.toggle('is-on', l.querySelector('input').checked)); onChange && onChange(i.value); }));
  }
  const toggle = (name, t, d, on) => `<label class="ftog"><span><span class="t-body-sm" style="font-weight:500;display:block">${esc(t)}</span>${d ? `<span class="t-caption c-3" style="font-weight:400">${esc(d)}</span>` : ''}</span><span class="toggle"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span class="toggle__track"></span></span></label>`;
  // Editable tag list: "Nexa Bank ×  Payluma ×  + Add company"
  function tagList(root, sel, items, addLabel, ph) {
    const el = root.querySelector(sel); let list = (items || []).slice();
    const draw = () => { el.innerHTML = `<div class="ftags">${list.map((t, i) => `<span class="ftag">${esc(t)}<button type="button" data-rm="${i}" aria-label="Remove ${esc(t)}">${icon('x', 'ic-12')}</button></span>`).join('')}<button type="button" class="ftag ftag--add" data-add>${icon('plus', 'ic-12')}${esc(addLabel)}</button></div>`; };
    el.addEventListener('click', e => {
      const rm = e.target.closest('[data-rm]'); if (rm) { list.splice(+rm.dataset.rm, 1); draw(); el.dispatchEvent(new Event('change')); return; }
      if (e.target.closest('[data-add]')) { const v = prompt(ph || addLabel); if (v && v.trim()) { v.split(',').map(x => x.trim()).filter(Boolean).forEach(x => { if (!list.includes(x)) list.push(x.slice(0, 60)); }); draw(); el.dispatchEvent(new Event('change')); } }
    });
    draw();
    return { get: () => list.slice(), set: v => { list = v.slice(); draw(); } };
  }
  // Mobile: Messages | Find switcher under the Chats tab (Figma 172:1444)
  const mobileSwitch = active => `<div class="fswitch m-flex"><a href="/chats"${active === 'chats' ? ' aria-current="page"' : ''}>Messages</a><a href="/find"${active === 'find' ? ' aria-current="page"' : ''}>Find</a></div>`;

  // ---- CV picker (Figma 26.15 / 26.16): a file card with Replace + remove, or a drop zone
  const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const CV_OK = /\.(pdf|docx?)$/i;
  function cvPicker(box, opts) {
    // opts: { cv, profileCv, sub, onChange }
    let cv = opts.cv || null, busy = false;
    const input = `<input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" class="sr-only" data-cv-in>`;
    const card = c => `<div class="fcv"><span class="fcv__ic">${H.icon('file-text', 'ic-18')}</span><div class="grow" style="min-width:0"><p class="t-body-sm truncate" style="font-weight:500">${H.esc(c.name)}</p><p class="t-caption c-3" style="font-weight:400">${kb(c.size || 0)}${opts.profileCv && c.path === opts.profileCv.path && opts.sub ? ' · ' + opts.sub : ''}</p></div><label class="btn btn--ghost btn--sm" style="cursor:pointer">Replace${input}</label><button class="nav__icon" type="button" data-cv-rm aria-label="Remove CV">${H.icon('trash', 'ic-16')}</button></div>`;
    function draw() {
      box.innerHTML = busy ? `<div class="fcv"><span class="fcv__ic">${H.icon('upload', 'ic-18')}</span><p class="t-body-sm c-2">Uploading…</p></div>`
        : cv ? card(cv) + (opts.profileCv && cv.path === opts.profileCv.path && opts.allowOther ? `<label class="fcv-other">${H.icon('upload', 'ic-14')}Upload a different CV for this role${input}</label>` : '')
        : `<label class="fcv-drop">${input}<span class="fcv-drop__ic">${H.icon('upload', 'ic-18')}</span><span class="c-accent" style="font-weight:500">Upload your CV</span><span class="t-caption c-3" style="font-weight:400">PDF or Word, up to 5 MB</span></label>`
          + (opts.profileCv ? `<p class="fcv-or"><span>or use the one on your profile</span></p>${card(opts.profileCv).replace('data-cv-rm', 'data-cv-use').replace(H.icon('trash', 'ic-16'), H.icon('check', 'ic-16')).replace('aria-label="Remove CV"', 'aria-label="Use this CV"')}` : '');
    }
    box.addEventListener('change', async e => {
      const inp = e.target.closest('[data-cv-in]'); if (!inp) return; const file = inp.files[0]; inp.value = ''; if (!file) return;
      if (!CV_OK.test(file.name)) return H.toast('Use a PDF or Word file', 'error');
      if (file.size > 5 * 1024 * 1024) return H.toast('CVs can be up to 5 MB', 'error');
      busy = true; draw();
      try { cv = await API.uploadCv(file); opts.onChange && opts.onChange(cv); } catch (err) { H.fail(err); }
      busy = false; draw();
    });
    box.addEventListener('click', e => {
      if (e.target.closest('[data-cv-rm]')) { cv = null; opts.onChange && opts.onChange(null); draw(); }
      if (e.target.closest('[data-cv-use]')) { cv = opts.profileCv; opts.onChange && opts.onChange(cv); draw(); }
    });
    draw();
    return { get: () => cv };
  }
  const liOk = v => !v || /^(https?:\/\/)?([a-z]{2,3}\.)?linkedin\.com\/(in|pub)\/[^\s]{2,}/i.test(v.trim());
  const liField = (id, val) => `<div class="fli"><span class="fli__in">in</span><input class="input" id="${id}" value="${H.esc(val || '')}" placeholder="linkedin.com/in/your-name" inputmode="url" autocomplete="off" spellcheck="false"><span class="fli__ok badge badge--success"${liOk(val) && val ? '' : ' hidden'}>${H.icon('check', 'ic-12')}Added</span></div>`;
  function bindLi(root, id) { const i = root.querySelector('#' + id); const ok = i.parentElement.querySelector('.fli__ok'); i.addEventListener('input', () => { const v = i.value.trim(); ok.hidden = !(v && liOk(v)); i.closest('.fli').classList.toggle('is-error', !!v && !liOk(v)); }); }
  // Open a stored CV in a new tab (signed link)
  async function openCv(path) { const w = window.open('', '_blank'); try { const u = await API.cvUrl(path); if (w) w.location = u; else location.href = u; } catch (e) { w && w.close(); H.fail(e); } }
  const cvChip = c => c ? `<button class="fpill" type="button" data-open-cv="${H.esc(c.path)}">${H.icon('file-text', 'ic-12')}${H.esc(c.name || 'CV')}</button>` : '';
  const liChip = l => l ? `<a class="fpill" href="${H.esc(/^https?:/.test(l) ? l : 'https://' + l)}" target="_blank" rel="noopener nofollow"><b style="color:#0A66C2">in</b>LinkedIn</a>` : '';
  document.addEventListener('click', e => { const b = e.target.closest('[data-open-cv]'); if (b) { e.preventDefault(); openCv(b.dataset.openCv); } });
  window.F = { SAVED, loadSaved, saveBtn, cvPicker, liOk, liField, bindLi, openCv, cvChip, liChip, kb, KIND, AREA, WORK, COMMIT, AVAIL, OPEN, STAGES, CATS, pay, pill, catPill, mini, initials, startupMark, roleCard, personCard, previewMe, chips, readChips, radioCards, bindRadio, toggle, tagList, mobileSwitch };
})();
