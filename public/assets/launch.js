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
  // ---------- Launch days (6 per day, 06:00 WAT) ----------
  const DAY_CAP = 6;
  const lagosToday = () => new Date(Date.now() + 3600e3).toISOString().slice(0, 10);   // WAT is UTC+1 all year
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const launchAt = iso => new Date(iso + 'T05:00:00Z');
  const dayLabel = (iso, opts) => iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', Object.assign({ weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }, opts || {})) : '';
  const shortDay = iso => iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
  const nextMonday = iso => { const d = new Date(iso + 'T12:00:00Z'); const dow = (d.getUTCDay() + 6) % 7; return addDays(iso, 7 - dow); };
  // Month calendar of launch days. opts: { selected, own (this product's current day, always pickable), onPick(day, slot) }
  function calendar(root, opts) {
    opts = opts || {};
    const today = lagosToday(), first = addDays(today, 1), last = addDays(today, 35);
    let month = (opts.selected || first).slice(0, 7), slots = new Map();
    async function load() {
      const m0 = month + '-01', d = new Date(m0 + 'T12:00:00Z'); const lead = (d.getUTCDay() + 6) % 7; const start = addDays(m0, -lead), end = addDays(start, 41);
      const rows = await API.daySlots(start, end).catch(() => []);
      slots = new Map((rows || []).map(r => [r.day, r]));
      draw(start);
    }
    function state(day) {
      const sl = slots.get(day) || { taken: 0, capacity: DAY_CAP, launches: [] };
      const mine = day === opts.own, left = sl.capacity - sl.taken + (mine ? 1 : 0);
      if (day < first) return { k: 'past', t: day <= today ? (day === today ? 'Today' : 'Past') : '', sl };
      if (day > last) return { k: 'far', t: 'Not open yet', sl };
      if (left <= 0) return { k: 'full', t: `${sl.taken} launching · Full`, sl };
      return { k: 'open', t: `${left} left`, sl, left };
    }
    function draw(start) {
      const mDate = new Date(month + '-01T12:00:00Z');
      const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
      const lastRow = cells.slice(35).every(c => c.slice(0, 7) !== month) ? 35 : 42;
      root.innerHTML = `<div class="cal">
        <div class="row between" style="margin-bottom:12px"><p class="t-label">${mDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</p><div class="row gap-6"><button type="button" class="btn btn--secondary btn--icon btn--sm" data-mv="-1" aria-label="Previous month" ${month <= today.slice(0, 7) ? 'disabled' : ''}>${icon('arrow-left', 'ic-14')}</button><button type="button" class="btn btn--secondary btn--icon btn--sm" data-mv="1" aria-label="Next month" ${month >= last.slice(0, 7) ? 'disabled' : ''}>${icon('arrow-right', 'ic-14')}</button></div></div>
        <div class="cal__grid" role="grid">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<span class="cal__dow">${d}</span>`).join('')}
        ${cells.slice(0, lastRow).map(day => { const st = state(day), on = day === opts.selected, out = day.slice(0, 7) !== month; return `<button type="button" class="cal__d is-${st.k}${on ? ' is-on' : ''}${out ? ' is-out' : ''}" data-day="${day}" ${st.k === 'open' || on ? '' : 'disabled'} aria-pressed="${on}" aria-label="${dayLabel(day)}: ${st.t}"><b>${+day.slice(8)}</b><span>${on ? (st.sl.taken + (day === opts.own ? 0 : 1)) + ' launching' : st.k === 'full' ? `<i class="cal__n">${st.sl.taken} launching · </i>Full` : esc(st.t)}</span></button>`; }).join('')}</div>
        <p class="row gap-16 wrap t-caption c-3" style="font-weight:400;margin-top:12px"><span class="row gap-6"><i class="cal__key" style="background:var(--color-success)"></i>Spots left (${DAY_CAP} a day)</span><span class="row gap-6"><i class="cal__key" style="background:var(--color-accent-default)"></i>Your pick</span><span class="row gap-6"><i class="cal__key" style="background:var(--color-border-strong)"></i>Full, past or not open yet</span></p>
        <div id="cal-info"></div></div>`;
      info();
    }
    function info() {
      const box = root.querySelector('#cal-info'); if (!box) return;
      if (!opts.selected) { box.innerHTML = ''; return; }
      const st = state(opts.selected), sl = st.sl, others = sl.launches || [];
      const n = sl.taken + (opts.selected === opts.own ? 0 : 1), left = Math.max(0, sl.capacity - n);
      box.innerHTML = `<div class="cal__info">${icon('calendar')}<div><p class="t-label">${esc(dayLabel(opts.selected))}</p><p class="t-caption c-2" style="font-weight:400;margin-top:2px">Live at 06:00 WAT · ${n} startup${n === 1 ? '' : 's'} launching that day · ${left} spot${left === 1 ? '' : 's'} left · on the board until Monday ${esc(shortDay(nextMonday(opts.selected)).replace(/^\w+ /, ''))}</p>${others.length ? `<p class="row gap-6 t-caption c-2" style="font-weight:400;margin-top:8px">${others.slice(0, 4).map(o => H.plogo(o, 20)).join('')}<span>${esc(others.map(o => o.name).slice(0, 3).join(', '))}${others.length > 3 ? ' and ' + (others.length - 3) + ' more' : ''}</span></p>` : ''}</div></div>`;
    }
    root.onclick = e => {
      const mv = e.target.closest('[data-mv]'); if (mv) { const d = new Date(month + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + (+mv.dataset.mv)); month = d.toISOString().slice(0, 7); load(); return; }
      const b = e.target.closest('[data-day]'); if (!b || b.disabled) return;
      opts.selected = b.dataset.day; load().then(() => opts.onPick && opts.onPick(opts.selected, slots.get(opts.selected)));
    };
    load();
    return {
      reload: load, get selected() { return opts.selected; },
      set(day) { opts.selected = day; month = (day || first).slice(0, 7); return load(); },
      // first open day on or after `from`
      async nextOpen(from) { const rows = await API.daySlots(from, addDays(from, 34)).catch(() => []); const r = (rows || []).find(x => x.day >= first && x.day <= last && x.taken < x.capacity && x.day !== from); return r ? r.day : null; }
    };
  }

  window.L = { card, timeline, fmtDate, range, mine, none, calendar, dayLabel, shortDay, launchAt, lagosToday, addDays, nextMonday, DAY_CAP };
})();
