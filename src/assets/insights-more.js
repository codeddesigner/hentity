// Insights: Founders tab + Explore, the data engine (Figma "Founders data" 197:2484 / 198:2702).
// Only totals ever come back from the database. Any group under 5 shows as "<5" when the founding team is involved.
(function () {
  const { esc, icon, toast } = H;
  const TEAM = [['women', 'Women-founded', '#A78BFA'], ['mixed', 'Mixed team', '#34D399'], ['men', 'Men-founded', '#60A5FA'], ['unstated', 'Not stated', '#D9D9D9']];
  const TCOL = Object.fromEntries(TEAM.map(t => [t[0], t[2]])), TLBL = Object.fromEntries(TEAM.map(t => [t[0], t[1]]));
  const STAGES = ['Idea', 'Pre-seed', 'Seed', 'Series A', 'Series B+', 'Bootstrapped', 'Profitable'];
  const YR = new Date().getFullYear();
  const n = v => (v || 0).toLocaleString('en-US');
  const pc = (a, b) => b ? Math.round(a / b * 100) : 0;
  const pc1 = (a, b) => b ? Math.round(a / b * 1000) / 10 : 0;
  const money = v => v >= 1e9 ? '$' + (v / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(v >= 1e8 ? 0 : 1).replace(/\.0$/, '') + 'M' : v >= 1e3 ? '$' + Math.round(v / 1e3) + 'K' : '$' + Math.round(v || 0);
  const legend = (keys) => `<div class="fx-leg">${keys.map(k => `<span><i style="background:${TCOL[k]}"></i>${TLBL[k]}</span>`).join('')}</div>`;
  const csvDownload = (name, rows) => { const csv = rows.map(r => r.map(v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(',')).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = name; a.click(); };
  const sel = (id, opts, val, label) => `<label class="fx-sel"><span class="sr-only">${label}</span><select id="${id}" aria-label="${label}">${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(val ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>${icon('chevron-down', 'ic-14')}</label>`;

  // ------------------------------------------------------------ share as image (canvas, 1200×675)
  async function barsImage({ title, sub, rows, keys, colors, total }) {
    const W = 1200, Hh = 675, c = document.createElement('canvas'); c.width = W; c.height = Hh; const g = c.getContext('2d');
    try { await document.fonts.ready; } catch (e) {}
    const F = getComputedStyle(document.body).fontFamily || 'sans-serif';
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, Hh);
    g.fillStyle = '#FF5A1F'; g.font = `500 18px ${F}`; g.fillText('HENTITY INSIGHTS', 64, 76);
    g.fillStyle = '#0a0a0a'; g.font = `600 40px ${F}`; g.fillText(title.slice(0, 52), 64, 128);
    g.fillStyle = '#737373'; g.font = `400 20px ${F}`; g.fillText(sub.slice(0, 90), 64, 162);
    let lx = 64; keys.forEach((k, i) => { g.fillStyle = colors[i]; g.fillRect(lx, 192, 14, 14); g.fillStyle = '#525252'; g.font = `400 17px ${F}`; g.fillText(k, lx + 22, 205); lx += g.measureText(k).width + 50; });
    const R = rows.slice(0, 8), top = 236, rh = Math.min(48, (Hh - top - 70) / Math.max(1, R.length)), lw = 210, bw = W - 64 - lw - 120;
    const max = Math.max(1, ...R.map(r => total ? 1 : r.vals.reduce((a, b) => a + (b || 0), 0)));
    R.forEach((r, i) => {
      const y = top + i * rh; g.fillStyle = '#0a0a0a'; g.font = `400 19px ${F}`; g.fillText(String(r.label).slice(0, 18), 64, y + rh / 2 + 6);
      const sum = r.vals.reduce((a, b) => a + (b || 0), 0) || 1; let x = 64 + lw;
      r.vals.forEach((v, j) => { const w = (total ? (v || 0) / sum : (v || 0) / max) * bw; g.fillStyle = colors[j]; g.fillRect(x, y + 8, Math.max(0, w - 2), rh - 16); x += w; });
      g.fillStyle = '#0a0a0a'; g.font = `500 18px ${F}`; g.fillText(r.right || '', x + 12, y + rh / 2 + 6);
    });
    g.fillStyle = '#a3a3a3'; g.font = `400 16px ${F}`; g.fillText(`hentity.com/insights · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · CC BY 4.0`, 64, Hh - 36);
    return new Promise(r => c.toBlob(r, 'image/png'));
  }
  async function shareImage(opts, name) {
    const blob = await barsImage(opts); const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], text: opts.title + ' · hentity.com/insights' }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); toast('Image downloaded');
  }

  // ------------------------------------------------------------ FOUNDERS
  const FS = { city: '', cat: '', stage: '', from: '', to: '', team: '' };
  async function founders(root, ctx) {
    const f = Object.assign({ cc: ctx.cc }, FS);
    root.innerHTML = `<div class="skel" style="height:520px;border-radius:16px"></div>`;
    let D; try { D = await API.insightsFounders(f); } catch (e) { H.fail(e); root.innerHTML = '<p class="c-2">Couldn’t load founder data.</p>'; return; }
    const cities = (ctx.D && ctx.D.city_list || []).filter(c => !ctx.cc || c.cc === ctx.cc).map(c => [c.city, c.city]);
    const years = Array.from({ length: 12 }, (_, i) => YR - i);
    const filters = `<div class="fx-filters">
      ${sel('ff-city', [['', 'All cities'], ...cities], FS.city, 'City')}
      ${sel('ff-cat', [['', 'All categories'], ...ctx.CATS.map(c => [c, c])], FS.cat, 'Category')}
      ${sel('ff-stage', [['', 'All stages'], ...STAGES.map(s => [s, s])], FS.stage, 'Stage')}
      ${sel('ff-from', [['', 'Founded: any year'], ...years.map(y => [y, 'Founded ' + y + ' or later'])], FS.from, 'Founded from')}
      ${sel('ff-team', [['', 'Founding team: All'], ...TEAM.slice(0, 3).map(t => [t[0], t[1]])], FS.team, 'Founding team')}
      <span class="grow"></span><button class="ins-act" type="button" id="ff-csv">${icon('download', 'ic-16')}<span class="d-only">Download CSV</span></button><button class="ins-act" type="button" id="ff-img">${icon('image', 'ic-16')}<span class="d-only">Share as image</span></button></div>`;
    const st = D.stated || 0, ww = D.with_woman || 0;
    const prevShare = D.stated_2022 >= 5 ? pc(D.with_woman_2022, D.stated_2022) : null, nowShare = pc(ww, st);
    const kp = (ic, l, v, sub, cls) => `<div><p class="l">${icon(ic, 'ic-16')}${l}</p><b>${v}</b><span class="delta ${cls || 'flat'}">${sub}</span></div>`;
    const enough = st >= 5;
    const kpis = `<section class="ins-sec"><div class="kpis4 fx-kpis">
      ${kp('users', 'Founders tracked', n(D.founders), `Across ${n(D.startups)} startups · ${st ? pc(D.self || 0, st) + '% self-reported' : 'none answered yet'}`)}
      ${kp('users', 'At least one woman founder', enough ? nowShare + '%' : '—', enough ? (prevShare != null ? `${icon(nowShare >= prevShare ? 'upvote' : 'chevron-down', 'ic-12')}${nowShare >= prevShare ? '+' : ''}${nowShare - prevShare} pts since 2022` : 'Share of startups that told us') : 'Needs 5+ answers', enough && prevShare != null ? (nowShare >= prevShare ? 'up' : 'down') : '')}
      ${kp('users', 'Women-founded', enough ? pc(D.women, st) + '%' : '—', enough ? 'All founders are women' : 'Needs 5+ answers')}
      ${kp('users', 'Funding to women-founded', D.raised_total ? pc1(D.raised_women, D.raised_total) + '%' : '—', D.raised_total ? `Of ${money(D.raised_total)} raised` : 'No disclosed rounds yet')}
    </div></section>`;
    if (!enough) {
      root.innerHTML = filters + kpis + `<section class="card fx-card fx-empty">${icon('users', 'ic-24')}<div><p class="t-h4">Founder data is just starting</p>
        <p class="t-body-sm c-2" style="margin-top:6px;max-width:560px">Founders tell us their founding team when they list, claim or edit a startup. Charts appear once at least 5 startups in this view have answered, so no one can be singled out. ${n(st)} of ${n(D.startups)} have answered so far.</p>
        <a class="btn btn--primary btn--sm" href="/my-products" style="margin-top:14px">${icon('plus')}Add your founding team</a></div></section>` + note();
      bindFounders(root, ctx, D); return;
    }
    const C = D.cities || [];
    const cityRows = C.map(c => { const s = c.n || 1, wm = c.w + c.m, known = c.n - c.u; return `<div class="fx-crow"><span class="truncate">${esc(c.city)}</span>
        <div class="fx-stack">${[['women', c.w], ['mixed', c.m], ['men', c.men], ['unstated', c.u]].map(([k, v]) => v ? `<i style="width:${v / s * 100}%;background:${TCOL[k]}" title="${TLBL[k]}: ${v < 5 ? '<5' : v}">${v / s >= 0.06 ? pc(v, s) + '%' : ''}</i>` : '').join('')}</div>
        <span class="fx-mono">${known >= 5 ? pc(wm, known) + '% with a woman' : '<5 answered'}</span><span class="fx-sm d-only">${n(c.n)} startups</span></div>`; }).join('');
    const T = (D.trend || []).filter(t => t.n >= 5);
    const money3 = ['men', 'mixed', 'women'].map(k => (D.money || []).find(m => m.team === k) || { team: k, sum: 0, n: 0, median: 0 });
    const mtot = money3.reduce((a, m) => a + (+m.sum || 0), 0) || 1;
    const cats = D.cats || [], half = Math.ceil(cats.length / 2);
    const catCol = arr => arr.map(c => `<div class="fx-cat"><span class="fx-tag"><i style="background:${H.catColor(c.name)}"></i>${esc(H.catShort(c.name))}</span><div class="fx-track"><i style="width:${c.w / c.n * 100}%;background:${TCOL.women}"></i><i style="width:${c.m / c.n * 100}%;background:${TCOL.mixed}"></i></div><span class="fx-mono">${pc(c.w, c.n)}% · ${pc(c.m, c.n)}%</span></div>`).join('');
    root.innerHTML = filters + kpis + `
      <section class="card fx-card"><div class="fx-hd"><div><p class="fx-h">Founding teams by city</p><p class="fx-s">Share of startups in each city, sorted by teams with at least one woman</p></div>${legend(['women', 'mixed', 'men', 'unstated'])}</div>
        ${C.length ? `<div class="fx-cities">${cityRows}</div>` : '<p class="fx-s" style="margin-top:14px">No city has 5 or more startups in this view yet.</p>'}</section>
      <div class="fx-two">
        <section class="card fx-card"><p class="fx-h">New startups with a woman founder</p><p class="fx-s">Share of startups founded each year</p>${T.length >= 2 ? lineChart(T) : '<p class="fx-s" style="margin-top:14px">Shows once two or more founding years have 5+ answers.</p>'}</section>
        <section class="card fx-card"><p class="fx-h">Where the money went</p><p class="fx-s">Disclosed funding, by founding team</p>
          ${D.raised_total ? money3.map(m => `<div class="fx-money"><div class="row between"><span>${TLBL[m.team]}</span><b class="fx-mono">${money(+m.sum)} · ${pc1(+m.sum, mtot)}%</b></div><div class="fx-track"><i style="width:${(+m.sum) / mtot * 100}%;background:${TCOL[m.team]}"></i></div><span class="fx-sm">${m.n >= 5 ? 'median ' + money(+m.median) : m.n ? '<5 rounds' : 'No rounds yet'}</span></div>`).join('') : '<p class="fx-s" style="margin-top:14px">No disclosed rounds from teams that told us yet.</p>'}</section>
      </div>
      <section class="card fx-card"><div class="fx-hd"><div><p class="fx-h">Women-founded and mixed teams by category</p><p class="fx-s">Share of startups in each category</p></div>${legend(['women', 'mixed'])}</div>
        ${cats.length ? `<div class="fx-cats"><div>${catCol(cats.slice(0, half))}</div><div>${catCol(cats.slice(half))}</div></div>` : '<p class="fx-s" style="margin-top:14px">No category has 5 or more answers yet.</p>'}</section>` + note();
    bindFounders(root, ctx, D);
  }
  const note = () => `<p class="ins-note">${icon('info', 'ic-14')}<span>Founders tell us their founding team when they claim or list a startup (“Women-founded”, “Mixed”, “Men-founded”, “Prefer not to say”). For startups that haven’t answered yet, Hentity uses widely reported founder information; a team’s own answer always replaces it. Only totals are shown, never people. Groups smaller than 5 are hidden. Women-founded: every founder is a woman. Mixed: at least one woman and one man.</span></p>`;
  function lineChart(T) {
    const W = 600, Hh = 230, pl = 34, pr = 24, pt = 16, pb = 28, max = Math.max(0.4, Math.ceil(Math.max(...T.map(t => t.ww / t.n)) * 10) / 10);
    const xs = i => pl + i * (W - pl - pr) / Math.max(1, T.length - 1), ys = v => pt + (1 - Math.min(v, max) / max) * (Hh - pt - pb);
    const pts = T.map((t, i) => [xs(i), ys(t.ww / t.n)]), last = T[T.length - 1];
    return `<svg class="fx-line" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Share of new startups with a woman founder by year">
      ${Array.from({ length: Math.round(max * 10) + 1 }, (_, i) => i / 10).map(v => `<line x1="${pl}" x2="${W - pr}" y1="${ys(v)}" y2="${ys(v)}" stroke="var(--color-border-default)"/><text x="0" y="${ys(v) + 4}" font-size="11" fill="var(--color-text-tertiary)">${Math.round(v * 100)}%</text>`).join('')}
      <polyline fill="none" stroke="#7C5CFC" stroke-width="2" points="${pts.map(p => p.join(',')).join(' ')}"/>
      ${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="#fff" stroke="#7C5CFC" stroke-width="1.5"/>`).join('')}
      <text x="${pts[pts.length - 1][0]}" y="${pts[pts.length - 1][1] - 10}" text-anchor="end" font-size="12" fill="#7C5CFC">${pc(last.ww, last.n)}%</text>
      ${T.map((t, i) => `<text x="${xs(i)}" y="${Hh - 6}" text-anchor="middle" font-size="11" fill="var(--color-text-tertiary)">${t.y}</text>`).join('')}</svg>`;
  }
  function bindFounders(root, ctx, D) {
    [['ff-city', 'city'], ['ff-cat', 'cat'], ['ff-stage', 'stage'], ['ff-from', 'from'], ['ff-team', 'team']].forEach(([id, k]) => { const e = root.querySelector('#' + id); e && (e.onchange = () => { FS[k] = e.value; founders(root, ctx); }); });
    const C = D.cities || [];
    root.querySelector('#ff-csv').onclick = () => csvDownload(`hentity-founders-${ctx.cc || 'africa'}.csv`, [['section', 'name', 'women_founded', 'mixed', 'men_founded', 'not_stated', 'total'],
      ['all', 'startups', D.women, D.with_woman - D.women, D.stated - D.with_woman, D.startups - D.stated, D.startups],
      ...C.map(c => ['city', c.city, c.w < 5 ? '<5' : c.w, c.m < 5 ? '<5' : c.m, c.men < 5 ? '<5' : c.men, c.u < 5 ? '<5' : c.u, c.n]),
      ...(D.cats || []).map(c => ['category', c.name, c.w < 5 ? '<5' : c.w, c.m < 5 ? '<5' : c.m, '', '', c.n])]);
    root.querySelector('#ff-img').onclick = () => C.length ? shareImage({ title: 'Founding teams by city', sub: `${ctx.cc ? ctx.CN[ctx.cc] : 'Africa'} · share of startups with at least one woman founder`, keys: TEAM.map(t => t[1]), colors: TEAM.map(t => t[2]), total: true,
      rows: C.map(c => ({ label: c.city, vals: [c.w, c.m, c.men, c.u], right: (c.n - c.u) >= 5 ? pc(c.w + c.m, c.n - c.u) + '%' : '' })) }, 'hentity-founding-teams.png') : toast('Not enough data to share yet');
  }

  // ------------------------------------------------------------ EXPLORE
  const DS = [['startups', 'Startups'], ['founders', 'Founders'], ['funding', 'Funding rounds'], ['launches', 'Launches'], ['visitors', 'Visitors'], ['reviews', 'Reviews']];
  const MEASURES = { startups: [['count', 'Number of startups']], founders: [['count', 'Number of founders']], funding: [['amount', 'Amount raised'], ['count', 'Number of rounds']], launches: [['count', 'Number of launches']], visitors: [['count', 'Page views']], reviews: [['count', 'Number of reviews']] };
  const DIMS = [['country', 'Country'], ['city', 'City'], ['category', 'Category'], ['stage', 'Stage'], ['founded_year', 'Founded year'], ['founding_team', 'Founding team'], ['claimed', 'Claimed or not'], ['status', 'Status'], ['month', 'Month']];
  const DL = Object.fromEntries(DIMS);
  const FKEYS = { cc: 'Country', city: 'City', cat: 'Category', stage: 'Stage', team: 'Founding team', claimed: 'Claimed or not', status: 'Status', from: 'Founded from', to: 'Founded to' };
  const PRESETS = [['Women-founded share by country', { ds: 'startups', m: 'count', by: 'country', split: 'founding_team', f: {} }],
    ['Funding by city and year', { ds: 'funding', m: 'amount', by: 'city', split: 'month', f: {} }],
    ['Launches per month by category', { ds: 'launches', m: 'count', by: 'month', split: 'category', f: {} }],
    ['Shut-downs by stage', { ds: 'startups', m: 'count', by: 'stage', split: 'status', f: {} }]];
  const PAL = ['#60A5FA', '#34D399', '#A78BFA', '#F59E0B', '#F472B6', '#22D3EE', '#FB7185', '#A3E635', '#94A3B8', '#C084FC', '#FBBF24', '#2DD4BF'];
  let Q = { ds: 'startups', m: 'count', by: 'city', split: 'founding_team', f: {} }, VIEW = 'bars', R = null, SAVED = [];
  const label = (dim, v) => v == null ? '—' : dim === 'founding_team' ? (TLBL[v] || v) : dim === 'country' ? (window.__CN && __CN[v] || v) : dim === 'month' && /^\d{4}-\d\d$/.test(v) ? new Date(v + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : v;
  const fmtV = v => Q.ds === 'funding' && Q.m === 'amount' ? money(v) : n(v);
  function title() {
    const what = { startups: 'startups', founders: 'founders', funding: Q.m === 'amount' ? 'Funding' : 'Funding rounds', launches: 'Launches', visitors: 'Page views', reviews: 'Reviews' }[Q.ds];
    const cat = Q.f.cat ? Q.f.cat + ' ' : '';
    const head = Q.ds === 'startups' || Q.ds === 'founders' ? (cat ? cat.trim() + ' ' + what : what[0].toUpperCase() + what.slice(1)) : (cat ? cat + what.toLowerCase() : what);
    return `${head} by ${DL[Q.by].toLowerCase()}${Q.split ? ' and ' + DL[Q.split].toLowerCase() : ''}`;
  }
  function apiUrl() {
    const u = new URLSearchParams({ metric: Q.ds, by: Q.by }); if (Q.split) u.set('split', Q.split); if (Q.m !== 'count') u.set('measure', Q.m);
    Object.entries(Q.f).forEach(([k, v]) => { if (v) u.set(k === 'cat' ? 'category' : k === 'cc' ? 'country' : k, v); });
    return '/v1/insights?' + u.toString();
  }
  async function explore(root, ctx) {
    window.__CN = ctx.CN;
    const qp = new URLSearchParams(location.search).get('q'); if (qp && !explore._init) { try { Q = Object.assign(Q, JSON.parse(atob(qp))); } catch (e) {} }
    explore._init = true;
    root.innerHTML = `<div class="fx-explore">
      <div class="fx-main">
        <section class="card fx-card fx-builder" id="fx-b"></section>
        <section class="card fx-card" id="fx-r"><div class="skel" style="height:360px;border-radius:12px"></div></section>
      </div>
      <aside class="fx-side d-only">
        <section class="card fx-card" id="fx-saved"></section>
        <section class="card fx-card"><p class="t-label">What you can slice by</p><div class="fx-chips" style="margin-top:10px">${DIMS.map(([k, l]) => `<button class="fx-chip" type="button" data-slice="${k}">${l}</button>`).join('')}</div></section>
        <section class="card fx-card"><p class="t-label row gap-8">${icon('key', 'ic-14')}Use this in your own tools</p><pre class="fx-api" id="fx-api"></pre>
          <p class="fx-s" style="margin-top:10px">Free for researchers and journalists. JSON, same privacy rules as this page.</p><button class="btn btn--secondary btn--sm" type="button" id="fx-copyapi" style="width:100%;margin-top:10px">${icon('copy', 'ic-14')}Copy request</button></section>
      </aside></div>`;
    builder(root, ctx); run(root, ctx); savedList(root, ctx);
    root.querySelector('.fx-side').addEventListener('click', e => {
      const s = e.target.closest('[data-slice]'); if (s) { Q.by = s.dataset.slice; if (Q.split === Q.by) Q.split = ''; builder(root, ctx); run(root, ctx); }
      if (e.target.closest('#fx-copyapi')) { navigator.clipboard.writeText(location.origin + apiUrl()).then(() => toast('Request copied')); }
      const v = e.target.closest('[data-view]'); if (v) { Q = JSON.parse(JSON.stringify(SAVED.find(x => x.id === v.dataset.view).query)); builder(root, ctx); run(root, ctx); }
      const d = e.target.closest('[data-delview]'); if (d) { e.stopPropagation(); API.deleteInsightView(d.dataset.delview).then(() => savedList(root, ctx)); }
    });
  }
  function builder(root, ctx) {
    const b = root.querySelector('#fx-b'); if (!b) return;
    const ms = MEASURES[Q.ds]; if (!ms.some(m => m[0] === Q.m)) Q.m = ms[0][0];
    const dsel = (id, val, none) => `<label class="fx-pick"><select id="${id}">${(none ? [['', 'nothing']] : []).concat(DIMS.filter(d => id !== 'fx-split' || d[0] !== Q.by)).map(([k, l]) => `<option value="${k}"${k === (val || '') ? ' selected' : ''}>${l}</option>`).join('')}</select>${icon('chevron-down', 'ic-14')}</label>`;
    const fchips = Object.entries(Q.f).filter(([, v]) => v).map(([k, v]) => `<span class="fx-fchip">${esc(k === 'cc' ? (ctx.CN[v] || v) : k === 'team' ? TLBL[v] : k === 'from' ? 'Founded ' + v + '+' : k === 'to' ? 'Founded to ' + v : (k === 'cat' ? v : v))}${k === 'cat' ? '' : ''}<button type="button" data-unf="${k}" aria-label="Remove filter">${icon('x', 'ic-12')}</button></span>`).join('');
    b.innerHTML = `<div class="fx-ds"><span class="fx-s" style="margin:0">Data</span>${DS.map(([k, l]) => `<button class="fx-dchip" type="button" data-ds="${k}" aria-pressed="${k === Q.ds}">${k === Q.ds ? icon('check', 'ic-12') : ''}${l}</button>`).join('')}</div>
      <div class="fx-sent">
        <div class="fx-row"><span class="fx-w">Show</span><label class="fx-pick"><select id="fx-m">${ms.map(([k, l]) => `<option value="${k}"${k === Q.m ? ' selected' : ''}>${l}</option>`).join('')}</select>${icon('chevron-down', 'ic-14')}</label></div>
        <div class="fx-row"><span class="fx-w">by</span>${dsel('fx-by', Q.by)}</div>
        <div class="fx-row"><span class="fx-w">split by</span>${dsel('fx-split', Q.split, true)}</div>
        <div class="fx-row fx-where"><span class="fx-w">where</span>${fchips || '<span class="fx-s" style="margin:0">everything</span>'}<button class="fx-add" type="button" id="fx-add">${icon('plus', 'ic-12')}Add filter</button></div>
      </div>
      <form class="fx-ask" id="fx-ask"><span>${icon('sparkles', 'ic-14')}</span><input id="fx-q" placeholder="Or ask in words: “Which cities have the most women-founded agritech startups?”" aria-label="Ask in words"><button class="btn btn--primary btn--sm" type="submit">Run</button></form>
      <div class="fx-pop"><span class="fx-s" style="margin:0">Popular:</span>${PRESETS.map(([l], i) => `<button class="fx-chip" type="button" data-pre="${i}">${l}</button>`).join('')}</div>`;
    b.querySelector('#fx-m').onchange = e => { Q.m = e.target.value; run(root, ctx); };
    b.querySelector('#fx-by').onchange = e => { Q.by = e.target.value; if (Q.split === Q.by) Q.split = ''; builder(root, ctx); run(root, ctx); };
    b.querySelector('#fx-split').onchange = e => { Q.split = e.target.value; run(root, ctx); };
    b.onclick = e => {
      const d = e.target.closest('[data-ds]'); if (d) { Q.ds = d.dataset.ds; builder(root, ctx); run(root, ctx); return; }
      const u = e.target.closest('[data-unf]'); if (u) { delete Q.f[u.dataset.unf]; builder(root, ctx); run(root, ctx); return; }
      const p = e.target.closest('[data-pre]'); if (p) { Q = JSON.parse(JSON.stringify(PRESETS[+p.dataset.pre][1])); builder(root, ctx); run(root, ctx); return; }
      if (e.target.closest('#fx-add')) addFilter(root, ctx);
    };
    b.querySelector('#fx-ask').onsubmit = e => { e.preventDefault(); const t = b.querySelector('#fx-q').value.trim(); if (!t) return; const q = parse(t, ctx); if (!q) { toast('Try naming what to count and how to split it, like “startups by city”', 'error'); return; } Q = q; builder(root, ctx); run(root, ctx); };
  }
  function addFilter(root, ctx) {
    const years = Array.from({ length: 14 }, (_, i) => YR - i);
    const OPTS = { cc: Object.entries(ctx.CN), city: (ctx.D && ctx.D.city_list || []).map(c => [c.city, c.city]), cat: ctx.CATS.map(c => [c, c]), stage: STAGES.concat('Unknown').map(s => [s, s]), team: TEAM.map(t => [t[0], t[1]]), claimed: [['Claimed', 'Claimed'], ['Unclaimed', 'Unclaimed']], status: [['Active', 'Active'], ['Inactive', 'Inactive']], from: years.map(y => [y, y]), to: years.map(y => [y, y]) };
    const sc = document.createElement('div'); sc.className = 'scrim'; sc.style.zIndex = 95;
    sc.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Add filter" style="max-width:420px"><div class="row between" style="margin-bottom:14px"><p class="t-h4">Add filter</p><button class="nav__icon" type="button" data-x aria-label="Close">${icon('x')}</button></div>
      <label class="field"><span class="field__label">Filter by</span><select class="input" id="af-k">${Object.entries(FKEYS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label class="field" style="margin-top:12px"><span class="field__label">Value</span><select class="input" id="af-v"></select></label>
      <div class="row gap-8" style="justify-content:flex-end;margin-top:18px"><button class="btn btn--ghost btn--sm" type="button" data-x>Cancel</button><button class="btn btn--primary btn--sm" type="button" id="af-ok">Add filter</button></div></div>`;
    document.body.append(sc);
    const k = sc.querySelector('#af-k'), v = sc.querySelector('#af-v'), fill = () => { v.innerHTML = (OPTS[k.value] || []).map(([a, b]) => `<option value="${esc(a)}">${esc(b)}</option>`).join(''); };
    k.onchange = fill; fill();
    sc.addEventListener('click', e => { if (e.target === sc || e.target.closest('[data-x]')) sc.remove(); });
    sc.querySelector('#af-ok').onclick = () => { if (v.value) Q.f[k.value] = v.value; sc.remove(); builder(root, ctx); run(root, ctx); };
  }
  // Plain words → a query. Deliberately simple and predictable.
  function parse(t, ctx) {
    const s = t.toLowerCase(), q = { ds: 'startups', m: 'count', by: '', split: '', f: {} };
    if (/fund|raise|invest|money/.test(s)) { q.ds = 'funding'; q.m = /how many rounds|number of rounds|rounds/.test(s) ? 'count' : 'amount'; }
    else if (/launch/.test(s)) q.ds = 'launches'; else if (/visit|views|traffic/.test(s)) q.ds = 'visitors'; else if (/review|comment/.test(s)) q.ds = 'reviews';
    else if (/how many founders|number of founders/.test(s)) q.ds = 'founders';
    const dimWord = [['city', /\bcit(y|ies)\b/], ['country', /\bcountr(y|ies)\b/], ['category', /\b(categor(y|ies)|sectors?|industr(y|ies))\b/], ['stage', /\bstages?\b/], ['month', /\b(month|monthly|per month)\b/], ['founded_year', /\b(year|founded)\b/], ['status', /shut|inactive|active|dead/], ['claimed', /claimed/]];
    const found = dimWord.filter(([, re]) => re.test(s)).map(d => d[0]);
    q.by = found[0] || 'country'; q.split = found.find(d => d !== q.by) || '';
    if (/wom[ae]n|female|gender|founding team/.test(s)) { if (q.by === 'founding_team') {} else q.split = 'founding_team'; }
    const catMap = { fintech: 'Fintech', agritech: 'Agriculture', agri: 'Agriculture', farm: 'Agriculture', health: 'Health', edtech: 'Education', education: 'Education', logistics: 'Logistics', commerce: 'Commerce', 'e-commerce': 'Commerce', ai: 'AI', saas: 'SaaS', energy: 'Energy & Climate', climate: 'Energy & Climate', proptech: 'Proptech', 'real estate': 'Proptech', property: 'Proptech', housing: 'Proptech', mobility: 'Mobility' };
    for (const [w, c] of Object.entries(catMap)) if (new RegExp('\\b' + w.replace('-', '\\-') + '\\b').test(s)) { q.f.cat = c; break; }
    for (const [code, name] of Object.entries(ctx.CN)) if (s.includes(name.toLowerCase())) { q.f.cc = code; if (q.by === 'country') q.by = 'city'; break; }
    const yrs = s.match(/\b(19|20)\d\d\b/g); if (yrs) { q.f.from = Math.min(...yrs.map(Number)); if (yrs.length > 1) q.f.to = Math.max(...yrs.map(Number)); }
    if (/women.founded|wom[ae]n-led/.test(s) && !/share|split|by/.test(s)) q.f.team = 'women';
    if (q.split === q.by) q.split = '';
    return q;
  }
  async function run(root, ctx) {
    const r = root.querySelector('#fx-r'); if (!r) return;
    r.style.opacity = .55;
    try { R = await API.insightsExplore(Q.ds, Q.by, Q.split || null, Q.f, Q.m); } catch (e) { H.fail(e); r.style.opacity = 1; return; }
    r.style.opacity = 1;
    const api = root.querySelector('#fx-api'); api && (api.textContent = 'GET ' + apiUrl().replace('?', '\n  ?').replace(/&/g, '\n  &'));
    const u = new URLSearchParams(location.search); u.set('tab', 'explore'); u.set('q', btoa(JSON.stringify(Q))); history.replaceState(null, '', location.pathname + '?' + u);
    result(root, ctx);
  }
  function pivot() {
    const keys = Object.keys(R.totals || {}).sort((a, b) => Q.by === 'month' || Q.by === 'founded_year' ? a.localeCompare(b) : R.totals[b] - R.totals[a]);
    const splits = Q.split ? [...new Set((R.rows || []).map(x => x.s))].sort((a, b) => Q.split === 'founding_team' ? TEAM.findIndex(t => t[0] === a) - TEAM.findIndex(t => t[0] === b) : 0) : [null];
    const cell = {}; (R.rows || []).forEach(x => { cell[x.k + '|' + x.s] = x.v; });
    const color = (s, i) => Q.split === 'founding_team' ? TCOL[s] : PAL[i % PAL.length];
    return { keys, splits, cell, color };
  }
  function result(root, ctx) {
    const r = root.querySelector('#fx-r'); const { keys, splits, cell, color } = pivot();
    const sup = v => v === null ? '<5' : fmtV(v);
    const tot = k => R.totals[k] || 0, max = Math.max(1, ...keys.map(tot));
    const views = [['bars', 'Bars', 'bar-chart'], ['share', 'Share %', 'list'], ['table', 'Table', 'type'], ['map', 'Map', 'globe']];
    const sub = `${Object.values(Q.f).filter(Boolean).length ? Object.entries(Q.f).filter(([, v]) => v).map(([k, v]) => k === 'cc' ? ctx.CN[v] : k === 'team' ? TLBL[v] : k === 'from' ? 'Founded ' + v + (Q.f.to ? '–' + Q.f.to : '+') : k === 'to' ? '' : v).filter(Boolean).join(' · ') + ' · ' : ''}${fmtV(R.grand)} ${Q.ds === 'funding' && Q.m === 'amount' ? 'raised' : MEASURES[Q.ds].find(m => m[0] === Q.m)[1].replace(/^Number of /, '').toLowerCase()} · updated hourly`;
    let body = '';
    if (!keys.length) body = `<div class="fx-emptyres">${icon('search', 'ic-20')}<p>Nothing matches yet. Try removing a filter or picking another dataset.</p></div>`;
    if (keys.length && (VIEW === 'table' || VIEW === 'bars')) {
      body = `<div class="fx-tablewrap"><table class="fx-table"><thead><tr><th>${DL[Q.by]}</th>${Q.split ? splits.map(s => `<th class="num">${esc(label(Q.split, s))}</th>`).join('') : ''}<th class="num">Total</th>${Q.split === 'founding_team' ? '<th class="num">With a woman</th>' : ''}</tr></thead><tbody>
        ${keys.map(k => { const ww = (cell[k + '|women'] || 0) + (cell[k + '|mixed'] || 0), known = tot(k) - (cell[k + '|unstated'] || 0); return `<tr><td>${esc(label(Q.by, k))}</td>${Q.split ? splits.map(s => `<td class="num">${(k + '|' + s) in cell ? sup(cell[k + '|' + s]) : '—'}</td>`).join('') : ''}<td class="num">${fmtV(tot(k))}</td>${Q.split === 'founding_team' ? `<td class="num">${known >= 5 ? pc(ww, known) + '%' : '<5'}</td>` : ''}</tr>`; }).join('')}
        <tr class="fx-tot"><td>All</td>${Q.split ? splits.map(s => { const t = keys.reduce((a, k) => a + (cell[k + '|' + s] || 0), 0); return `<td class="num">${fmtV(t)}</td>`; }).join('') : ''}<td class="num">${fmtV(keys.reduce((a, k) => a + tot(k), 0))}</td>${Q.split === 'founding_team' ? '<td></td>' : ''}</tr></tbody></table></div>`;
    }
    const tableHtml = body; body = '';
    if (!keys.length) body = `<div class="fx-emptyres">${icon('search', 'ic-20')}<p>Nothing matches yet. Try removing a filter or picking another dataset.</p></div>`;
    else if (VIEW === 'table') body = tableHtml;
    else if (VIEW === 'map') {
      if (Q.by !== 'country') body = `<div class="fx-emptyres">${icon('globe', 'ic-20')}<p>The map works when you group by country. <button class="link link--accent" type="button" id="fx-tocc">Group by country</button></p></div>`;
      else body = `<div class="fx-map">${keys.map(k => `<div class="fx-tile" style="--a:${0.12 + tot(k) / max * 0.88}"><span class="row gap-6">${H.flag(k)}${esc(ctx.CN[k] || k)}</span><b>${fmtV(tot(k))}</b></div>`).join('')}</div>`;
    } else {
      const share = VIEW === 'share';
      body = `<div class="fx-bars">${keys.slice(0, 20).map(k => { const t = tot(k) || 1; return `<div class="fx-brow"><span class="truncate" title="${esc(label(Q.by, k))}">${esc(label(Q.by, k))}</span><div class="fx-bt"><div class="fx-bb" style="width:${share ? 100 : Math.max(2, tot(k) / max * 100)}%">${splits.map((s, i) => { const v = cell[k + '|' + s]; const w = v === null ? 4 / t : (v || 0) / t; return v === undefined ? '' : `<i style="flex:${w};background:${color(s, i)}" title="${esc(label(Q.split, s) || '')}: ${sup(v)}">${share && w >= .08 ? Math.round(w * 100) + '%' : ''}</i>`; }).join('')}</div>${share ? '' : `<b>${fmtV(tot(k))}</b>`}</div></div>`; }).join('')}</div>` + (VIEW === 'bars' ? `<div class="d-only">${tableHtml}</div>` : '');
    }
    r.innerHTML = `<div class="fx-hd"><div style="min-width:0"><p class="fx-title">${esc(title())}</p><p class="fx-s">${esc(sub)}</p></div>
        <div class="fx-views" role="tablist">${views.map(([k, l, ic]) => `<button type="button" role="tab" data-v="${k}" aria-selected="${k === VIEW}">${icon(ic, 'ic-14')}<span class="d-only">${l}</span></button>`).join('')}</div></div>
      ${Q.split && VIEW !== 'table' && VIEW !== 'map' ? `<div class="fx-leg">${splits.map((s, i) => `<span><i style="background:${color(s, i)}"></i>${esc(label(Q.split, s))}</span>`).join('')}</div>` : ''}
      ${body}
      ${VIEW !== 'table' && keys.length && VIEW !== 'map' ? '' : ''}
      ${R.suppressed ? `<p class="ins-note">${icon('lock', 'ic-14')}<span>Groups under 5 show as “&lt;5” to protect founders. Totals still include them. “With a woman” = women-founded + mixed.</span></p>` : ''}
      <div class="fx-acts"><button class="btn btn--secondary btn--sm" type="button" id="fx-csv">${icon('download', 'ic-14')}Download CSV</button><button class="btn btn--secondary btn--sm" type="button" id="fx-img">${icon('image', 'ic-14')}Share as image</button><button class="btn btn--secondary btn--sm d-only" type="button" id="fx-emb">${icon('link', 'ic-14')}Embed</button><span class="grow"></span><button class="btn btn--primary btn--sm" type="button" id="fx-save">${icon('bookmark', 'ic-14')}Save view</button></div>`;
    r.querySelector('.fx-views').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { VIEW = b.dataset.v; result(root, ctx); } };
    const tc = r.querySelector('#fx-tocc'); tc && (tc.onclick = () => { Q.by = 'country'; if (Q.split === 'country') Q.split = ''; builder(root, ctx); run(root, ctx); });
    r.querySelector('#fx-csv').onclick = () => csvDownload(`hentity-${Q.ds}-by-${Q.by}${Q.split ? '-' + Q.split : ''}.csv`, [[DL[Q.by], ...(Q.split ? splits.map(s => label(Q.split, s)) : []), 'Total'], ...keys.map(k => [label(Q.by, k), ...(Q.split ? splits.map(s => (k + '|' + s) in cell ? (cell[k + '|' + s] === null ? '<5' : cell[k + '|' + s]) : 0) : []), tot(k)])]);
    r.querySelector('#fx-img').onclick = () => keys.length ? shareImage({ title: title(), sub, keys: Q.split ? splits.map(s => label(Q.split, s)) : [MEASURES[Q.ds].find(m => m[0] === Q.m)[1]], colors: Q.split ? splits.map((s, i) => color(s, i)) : ['#FF5A1F'], total: VIEW === 'share', rows: keys.slice(0, 8).map(k => ({ label: label(Q.by, k), vals: splits.map(s => cell[k + '|' + s] || 0), right: VIEW === 'share' ? '' : fmtV(tot(k)) })) }, `hentity-${Q.ds}-${Q.by}.png`) : toast('Nothing to share yet');
    r.querySelector('#fx-emb').onclick = () => { const code = `<iframe src="${location.origin}/insights?tab=explore&embed=1&q=${encodeURIComponent(btoa(JSON.stringify(Q)))}" width="100%" height="720" style="border:0" title="${esc(title())} | Hentity"></iframe>`; navigator.clipboard.writeText(code).then(() => toast('Embed code copied')); };
    r.querySelector('#fx-save').onclick = async () => {
      if (!API.uid) { location.href = '/signin?next=' + encodeURIComponent(location.pathname + location.search); return; }
      const name = prompt('Name this view', title()); if (!name) return;
      try { await API.saveInsightView(name.trim().slice(0, 120), Q); toast('View saved'); savedList(root, ctx); } catch (e) { H.fail(e); }
    };
  }
  async function savedList(root, ctx) {
    const el = root.querySelector('#fx-saved'); if (!el) return;
    if (!API.uid) { el.innerHTML = `<p class="t-label">Your saved views</p><p class="fx-s" style="margin-top:8px"><a class="link link--accent" href="/signin?next=/insights%3Ftab%3Dexplore">Sign in</a> to save views and come back to them. They update hourly.</p>`; return; }
    try { SAVED = await API.insightViews(); } catch (e) { SAVED = []; }
    el.innerHTML = `<p class="t-label">Your saved views</p>${SAVED.length ? SAVED.map(v => `<div class="fx-sv" data-view="${v.id}" role="button" tabindex="0">${icon('bookmark', 'ic-14')}<div class="grow" style="min-width:0"><p class="t-body-sm truncate">${esc(v.name)}</p><p class="fx-sm">Updated hourly · saved ${H.ago(v.created_at)}</p></div><button class="nav__icon" type="button" data-delview="${v.id}" aria-label="Delete view">${icon('x', 'ic-12')}</button></div>`).join('') : '<p class="fx-s" style="margin-top:8px">Nothing saved yet. Build a view and press Save view.</p>'}`;
  }

  window.InsightsMore = { founders, explore };
})();
