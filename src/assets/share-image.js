// Share as image (Figma: Discovery · Share as image). Draws Insights cards on a <canvas> so the PNG always
// carries the live numbers, the date and the CC BY 4.0 credit. Sizes: square 1080², story 1080×1920, wide 1200×675.
(function () {
  const SIZES = { square: [1080, 1080], story: [1080, 1920], wide: [1200, 675] };
  const KINDS = { industries: 'Industries', cities: 'Top cities', numbers: 'Headline numbers', full: 'Full snapshot' };
  const THEME = {
    light: { bg: '#ffffff', fg: '#0a0a0a', mute: '#9b9b9b', sub: '#6b6b6b', line: '#e8e8e8', chip: '#fafafa', track: '#f0f0f0', other: '#d4d4d4' },
    dark: { bg: '#0a0a0a', fg: '#ffffff', mute: '#8c8c8c', sub: '#a3a3a3', line: '#2a2a2a', chip: '#141414', track: '#262626', other: '#525252' }
  };
  const ACCENT = '#FF5B14', LIME = '#E2F200', SKY = '#AEE6FB';
  const SANS = '"Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
  const MONO = '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
  const fmt = v => (v || 0).toLocaleString('en-US');
  const compact = v => v >= 1e6 ? (Math.round(v / 1e5) / 10) + 'm' : v >= 1e4 ? Math.round(v / 1e3) + 'k' : fmt(v);

  // ---------------------------------------------------------------- assets
  const logoCache = {};
  function logoImg(fg, knock) {
    const k = fg + knock; if (logoCache[k]) return logoCache[k];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 132 24" width="528" height="96"><g fill="${fg}"><path d="M28.0859 20.9102V4H31.1094V11.0312H39.3359V4H42.3477V20.9102H39.3359V13.5742H31.1094V20.9102H28.0859Z"/><path d="M46.5312 20.9102V4H57.4766V6.54297H49.5547V11.125H57.043V13.5273H49.5547V18.3672H57.4766V20.9102H46.5312Z"/><path d="M61.2266 20.9102V4H63.8516L72.9219 16.7148L70.8359 15.6484H72.3477V4H75.2539V20.9102H72.6406L63.5703 8.18359L65.6562 9.25H64.1445V20.9102H61.2266Z"/><path d="M83.6445 20.9102V6.54297H78.4414V4H91.8711V6.54297H86.668V20.9102H83.6445Z"/><path d="M95.0469 20.9102V4H98.0703V20.9102H95.0469Z"/><path d="M106.449 20.9102V6.54297H101.246V4H114.676V6.54297H109.473V20.9102H106.449Z"/><path d="M122.527 20.9102V14.2422L116.598 4H119.902L123.934 11.2539H124.133L128.164 4H131.469L125.539 14.2422V20.9102H122.527Z"/><rect width="24" height="24" rx="12"/></g><clipPath id="c"><rect x="5.14286" y="5.14286" width="13.7143" height="13.8129"/></clipPath><g clip-path="url(#c)"><rect x="5.14286" y="5.14286" width="13.7143" height="13.8129" fill="${knock}"/><g fill="${fg}"><circle cx="6.1295" cy="6.1295" r="4.6372"/><circle cx="18.1665" cy="18.0678" r="4.6372"/><rect x="13.2333" y="3.95891" width="6.41315" height="6.80781"/><rect x="4.15622" y="13.4306" width="6.41315" height="6.80781"/></g></g></svg>`;
    return (logoCache[k] = new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }));
  }
  let fontsReady;
  const fonts = () => fontsReady || (fontsReady = Promise.all(['400 20px Geist', '500 20px Geist', '600 20px Geist', '400 20px "Geist Mono"', '500 20px "Geist Mono"'].map(f => document.fonts && document.fonts.load(f).catch(() => {}))).catch(() => {}));

  // ---------------------------------------------------------------- drawing helpers
  function font(ctx, size, weight, mono) { ctx.font = `${weight || 400} ${size}px ${mono ? MONO : SANS}`; }
  function text(ctx, s, x, y, o) {
    font(ctx, o.size, o.weight, o.mono); ctx.fillStyle = o.color; ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic';
    if (o.ls) ctx.letterSpacing = o.ls + 'px'; else ctx.letterSpacing = '0px';
    ctx.fillText(o.max ? ellipsis(ctx, s, o.max) : s, x, y); ctx.letterSpacing = '0px';
  }
  function ellipsis(ctx, s, max) { if (ctx.measureText(s).width <= max) return s; while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1); return s + '…'; }
  function wrap(ctx, s, max) { const out = []; let line = ''; s.split(' ').forEach(w => { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > max && line) { out.push(line); line = w; } else line = t; }); if (line) out.push(line); return out; }
  function rrect(ctx, x, y, w, h, r, fill, stroke) { ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); } }

  function squarify(items, W, H) {
    const out = [], area = W * H, total = items.reduce((a, i) => a + i.w, 0) || 1;
    let rest = items.map(i => Object.assign({}, i, { a: i.w / total * area })), x = 0, y = 0, w = W, h = H;
    const worst = (row, side) => { const s = row.reduce((a, r) => a + r.a, 0), mx = Math.max(...row.map(r => r.a)), mn = Math.min(...row.map(r => r.a)); return Math.max(side * side * mx / (s * s), (s * s) / (side * side * mn)); };
    while (rest.length) {
      const side = Math.min(w, h); let row = [rest[0]], i = 1;
      while (i < rest.length && worst(row.concat(rest[i]), side) <= worst(row, side)) { row.push(rest[i]); i++; }
      rest = rest.slice(i); const s = row.reduce((a, r) => a + r.a, 0);
      if (w >= h) { const cw = s / h; let cy = y; row.forEach(r => { const ch = r.a / cw; out.push(Object.assign(r, { x, y: cy, w: cw, h: ch })); cy += ch; }); x += cw; w -= cw; }
      else { const ch = s / w; let cx = x; row.forEach(r => { const cw = r.a / ch; out.push(Object.assign(r, { x: cx, y, w: cw, h: ch })); cx += cw; }); y += ch; h -= ch; }
    }
    return out;
  }

  // ---------------------------------------------------------------- blocks: each has h (or flex) and draw(ctx,x,y,w,h)
  // s = scale (1 at 1080 wide), T = theme, M = model
  const B = {
    title: (s, T, str, size) => ({ measure(ctx, w) { font(ctx, size * s, 600); this.lines = wrap(ctx, str, w); return this.lines.length * size * 1.18 * s; },
      draw(ctx, x, y) { this.lines.forEach((l, i) => text(ctx, l, x, y + (i + 0.86) * size * 1.18 * s, { size: size * s, weight: 600, color: T.fg, ls: -size * s * 0.02 })); } }),
    eyebrow: (s, str) => ({ h: 30 * s, draw(ctx, x, y) { text(ctx, str, x, y + 22 * s, { size: 22 * s, mono: true, color: ACCENT, ls: 1.5 * s }); } }),
    treemap: (s, T, M, opt) => ({ flex: 1, draw(ctx, x, y, w, h) {
      const G = 7 * s, items = M.inds.map(i => ({ ...i, w: i.n || M.minPos * 0.35 }));
      squarify(items, w + G, h + G).forEach(c => {
        const cw = c.w - G, ch = c.h - G, cx = x + c.x, cy = y + c.y; if (cw < 2 || ch < 2) return;
        rrect(ctx, cx, cy, cw, ch, 5 * s, c.color);
        const pad = 17 * s, lab = 21 * s, big = ch > 70 * s;
        if (cw > 60 * s && ch > 38 * s) text(ctx, c.name.toLowerCase() + (c.name === M.fast ? ` ↑${M.fastPct}%` : ''), cx + pad, cy + pad + lab * 0.8, { size: lab, mono: true, color: c.ink, max: cw - pad * 2 });
        if (cw > 44 * s && ch > 76 * s) text(ctx, fmt(c.n), cx + cw - pad, cy + ch - (big ? 20 : 12) * s, { size: (big ? 23 : 21) * s, weight: 500, color: c.ink, align: 'right', mono: true });
      });
    } }),
    legend: (s, T, M) => ({ measure(ctx, w) { this.rows = []; let row = [], rw = 0; font(ctx, 20 * s, 500);
        M.key.forEach(k => { const cw = ctx.measureText(k.name).width + 52 * s; if (rw + cw > w && row.length) { this.rows.push(row); row = []; rw = 0; } row.push([k, cw]); rw += cw + 11 * s; }); if (row.length) this.rows.push(row);
        return this.rows.length * 50 * s - 10 * s; },
      draw(ctx, x, y) { this.rows.forEach((r, i) => { let cx = x; r.forEach(([k, cw]) => { const cy = y + i * 50 * s; rrect(ctx, cx, cy, cw, 40 * s, 9 * s, T.chip, T.line); ctx.beginPath(); ctx.arc(cx + 21 * s, cy + 20 * s, 7 * s, 0, 7); ctx.fillStyle = k.color; ctx.fill(); text(ctx, k.name, cx + 36 * s, cy + 27 * s, { size: 20 * s, weight: 500, color: T.fg }); cx += cw + 11 * s; }); }); } }),
    pct: (s, T, M, size) => ({ h: size * 1.02 * s, draw(ctx, x, y, w) {
      text(ctx, M.share + '%', x - 4 * s, y + size * 0.86 * s, { size: size * s, weight: 500, color: T.fg, ls: -size * s * 0.04 });
      font(ctx, size * s, 500); ctx.letterSpacing = -size * s * 0.04 + 'px'; const pw = ctx.measureText(M.share + '%').width; ctx.letterSpacing = '0px';
      text(ctx, M.top3.map(c => c.city).join(', '), x + pw + 16 * s, y + size * 0.86 * s, { size: 22 * s, color: T.sub, max: w - pw - 16 * s });
    } }),
    cityBars: (s, T, M) => { const rows = M.top3.map((c, i) => [c.city, c.n, i ? SKY : LIME]).concat(M.otherCities ? [[`Other ${M.otherCount} cities`, M.otherCities, T.other]] : []);
      return { h: (40 + rows.length * 76) * s, draw(ctx, x, y, w) {
        text(ctx, 'STARTUPS BY CITY', x, y + 22 * s, { size: 20 * s, mono: true, color: T.mute, ls: 2 * s });
        const max = Math.max(1, ...rows.map(r => r[1]));
        rows.forEach(([name, n, col], i) => { const ry = y + 44 * s + i * 76 * s;
          text(ctx, name, x, ry + 26 * s, { size: 22 * s, weight: 500, color: T.fg, max: w - 120 * s }); text(ctx, fmt(n), x + w, ry + 26 * s, { size: 23 * s, mono: true, color: T.fg, align: 'right' });
          rrect(ctx, x, ry + 40 * s, w, 18 * s, 6 * s, T.track); rrect(ctx, x, ry + 40 * s, Math.max(12 * s, w * n / max), 18 * s, 6 * s, col); });
      } }; },
    cityRows: (s, T, M, count, label) => { const rows = M.cities.slice(0, count);
      return { h: (48 + rows.length * 58) * s, draw(ctx, x, y, w) {
        text(ctx, label || 'TOP CITIES', x, y + 22 * s, { size: 22 * s, mono: true, color: T.mute, ls: 2 * s });
        const max = Math.max(1, ...rows.map(r => r.n)), nameW = Math.min(300 * s, w * 0.34), numW = 90 * s;
        rows.forEach((c, i) => { const ry = y + 56 * s + i * 58 * s;
          text(ctx, c.city, x, ry + 26 * s, { size: 26 * s, weight: 500, color: T.fg, max: nameW - 16 * s });
          const bx = x + nameW, bw = w - nameW - numW; rrect(ctx, bx, ry + 8 * s, bw, 14 * s, 7 * s, T.track); rrect(ctx, bx, ry + 8 * s, Math.max(14 * s, bw * c.n / max), 14 * s, 7 * s, i ? SKY : LIME);
          text(ctx, fmt(c.n), x + w, ry + 26 * s, { size: 26 * s, mono: true, color: T.fg, align: 'right' }); });
      } }; },
    bigNumber: (s, T, M, size) => ({ h: (size * 0.98 + 58) * s, draw(ctx, x, y) {
      text(ctx, fmt(M.live), x - 6 * s, y + size * 0.8 * s, { size: size * s, weight: 500, color: T.fg, ls: -size * s * 0.045 });
      text(ctx, `startups live on Hentity${M.where ? ' in ' + M.where : ''}`, x, y + (size * 0.98 + 40) * s, { size: 38 * s, color: T.sub });
    } }),
    stats: (s, T, stats, size, divider) => ({ h: (size + 56 + (divider ? 40 : 0)) * s, draw(ctx, x, y, w) {
      const cw = w / stats.length;
      stats.forEach(([v, l], i) => { text(ctx, v, x + i * cw, y + size * 0.82 * s, { size: size * s, weight: 600, color: T.fg, ls: -size * s * 0.03 }); text(ctx, l, x + i * cw, y + (size + 36) * s, { size: 28 * s, color: T.sub, max: cw - 16 * s }); });
      if (divider) { ctx.fillStyle = T.line; ctx.fillRect(x, y + (size + 72) * s, w, 2 * s); }
    } }),
    gap: (s, g) => ({ h: g * s, draw() {} })
  };

  // ---------------------------------------------------------------- model from the Insights payload
  function model(D, o) {
    const cats = o.cats || [];
    const by = new Map((D.industries || []).map(i => [i.name, i]));
    const L = cats.map(c => Object.assign({ name: c, n: 0, cur: 0, prev: 0 }, by.get(c) || {})).concat((D.industries || []).filter(i => !cats.includes(i.name)));
    L.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
    L.forEach(i => { i.color = H.catColor(i.name); i.ink = H.catInk(i.name); });
    const growth = L.filter(i => i.cur >= 2).map(i => [i, i.prev ? (i.cur - i.prev) / i.prev : i.cur]).sort((a, b) => b[1] - a[1])[0];
    const fast = growth && growth[1] > 0 ? growth : null;
    const key = L.filter(i => H.CAT_COLOR[i.name] && i.n).map(i => ({ name: H.catShort(i.name), color: i.color }));
    if (L.some(i => !H.CAT_COLOR[i.name])) key.push({ name: 'Other', color: H.CAT_OTHER });
    const C = D.city_list || [], tot = C.reduce((a, c) => a + c.n, 0), top3 = C.slice(0, 3), t3 = top3.reduce((a, c) => a + c.n, 0);
    const lead = L[0] && L[0].n ? L[0].name : null;
    return {
      inds: L, key, minPos: Math.max(1, Math.min(...L.filter(i => i.n).map(i => i.n), 1)),
      fast: fast && fast[0].name, fastPct: fast ? (fast[0].prev ? Math.round(fast[1] * 100) : fast[0].cur) : 0,
      lead, leadPct: lead && D.total ? Math.round(L[0].n / D.total * 100) : 0,
      cities: C, top3, share: tot ? Math.round(t3 / tot * 100) : 0, otherCities: tot - t3, otherCount: Math.max(0, (D.cities || C.length) - 3),
      live: D.live, cityCount: D.cities, launched: D.launched, views: D.views,
      where: o.where || '', periodLabel: o.periodLabel || 'in 30 days', month: new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).toUpperCase(),
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    };
  }

  function titleFor(kind, M) {
    const scope = M.where ? `startups in ${M.where}` : 'African startups';
    if (kind === 'industries') return M.lead ? `${M.lead === 'Energy & Climate' ? 'Climate' : M.lead} leads ${scope} on Hentity` : `${scope[0].toUpperCase() + scope.slice(1)} on Hentity by industry`;
    if (kind === 'cities') { const p = M.share; const lead = p >= 45 && p < 50 ? 'Nearly half of' : p >= 50 && p < 55 ? 'Half of' : p >= 55 ? `${p}% of` : `${p}% of`; return M.top3.length >= 3 ? `${lead} startups on Hentity are in ${M.top3.length} cities` : `Where startups on Hentity are built`; }
    return M.where ? `The state of startups in ${M.where}` : 'The state of African startups';
  }

  // ---------------------------------------------------------------- compose
  async function render(canvas, D, o) {
    const [W, Hh] = SIZES[o.size], T = THEME[o.theme], s = o.size === 'story' ? 1.5 : o.size === 'wide' ? 0.84 : 1, M = model(D, o), kind = o.kind;
    canvas.width = W; canvas.height = Hh;
    await fonts(); const logo = await logoImg(T.fg, T.bg);
    const ctx = canvas.getContext('2d'); ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, Hh);
    const P = (o.size === 'story' ? 52 : o.size === 'wide' ? 64 : 54) * s, eyebrow = kind === 'numbers' ? (M.where ? `THE STATE OF STARTUPS IN ${M.where.toUpperCase()}` : 'THE STATE OF AFRICAN STARTUPS') : `INSIGHTS · ${M.where ? M.where.toUpperCase() + ' · ' : ''}${M.month}`;
    const logoH = 44 * s, logoW = logoH * 5.5;
    const statsAll = [[fmt(M.cityCount), 'cities'], [fmt(M.launched), 'launched ' + M.periodLabel], [compact(M.views), 'visitors']];
    const statsFull = [[fmt(M.live), 'startups live'], [fmt(M.cityCount), 'cities'], [fmt(M.launched), 'launched'], [compact(M.views), 'visitors']];

    // footer
    const foot = (x, y, w, stacked) => {
      if (stacked) { text(ctx, 'hentity.com/insights', x, y - 34 * s, { size: 24 * s, weight: 500, color: T.fg }); text(ctx, `Data: Hentity · CC BY 4.0 · ${M.date}`, x, y, { size: 22 * s, color: T.mute }); }
      else { text(ctx, 'hentity.com/insights', x, y, { size: 24 * s, weight: 500, color: T.fg }); text(ctx, `Data: Hentity · CC BY 4.0 · ${M.date}`, x + w, y, { size: 22 * s, color: T.mute, align: 'right' }); }
    };
    // stack a column of blocks between y0 and y1; the flex block takes what is left
    const column = (blocks, x, y0, w, y1, gap) => {
      const hs = blocks.map(b => b.flex ? 0 : (b.h != null ? b.h : b.measure(ctx, w)));
      const fixed = hs.reduce((a, h) => a + h, 0) + gap * (blocks.length - 1), flexH = Math.max(80 * s, y1 - y0 - fixed);
      let y = y0; blocks.forEach((b, i) => { const h = b.flex ? flexH : hs[i]; b.draw(ctx, x, y, w, h); y += h + gap; });
    };

    if (o.size === 'wide') {
      const L = P, R = W - P, colW = (W - P * 2 - 60 * s) / 2, rx = L + colW + 60 * s, top = P, bottom = Hh - P;
      if (logo) ctx.drawImage(logo, L, top, logoW, logoH);
      const left = [], right = [];
      if (kind === 'industries') { left.push(B.title(s, T, titleFor(kind, M), 40), B.legend(s, T, M)); right.push(B.treemap(s, T, M)); }
      else if (kind === 'cities') { left.push(B.title(s, T, titleFor(kind, M), 38), B.pct(s, T, M, 130)); right.push(B.cityBars(s, T, M)); }
      else if (kind === 'numbers') { left.push(B.eyebrow(s, eyebrow), B.bigNumber(s, T, M, 130), B.stats(s, T, [statsAll[0], statsAll[2]], 46, false)); right.push(B.cityRows(s, T, M, 5)); }
      else { left.push(B.title(s, T, titleFor(kind, M), 40), B.stats(s, T, [statsFull[0], statsFull[1], statsFull[3]], 48, false)); right.push(B.treemap(s, T, M), B.legend(s, T, M)); }
      column(left, L, top + logoH + 40 * s, colW, bottom - 100 * s, 30 * s);
      if (right.some(b => b.flex)) column(right, rx, top, R - rx, bottom, 16 * s);
      else { const h = right.reduce((a, b) => a + (b.h != null ? b.h : b.measure(ctx, R - rx)), 0); column(right, rx, Math.max(top, (Hh - h) / 2 - 20 * s), R - rx, bottom, 20 * s); }
      foot(L, bottom, colW, true);
    } else {
      const story = o.size === 'story', x = P, w = W - P * 2;
      let y = P + (story ? 30 * s : 0);
      if (logo) ctx.drawImage(logo, x, y, logoW, logoH);
      if (story) { y += logoH + 34 * s; text(ctx, eyebrow, x, y + 20 * s, { size: 20 * s, mono: true, color: ACCENT, ls: 1.5 * s }); y += 56 * s; }
      else { text(ctx, eyebrow, x + w, y + logoH * 0.72, { size: 22 * s, mono: true, color: ACCENT, align: 'right', ls: 1.5 * s }); y += logoH + 40 * s; }
      const bottom = Hh - P - (story ? 110 * s : 70 * s), blocks = [];
      const t = size => B.title(s, T, titleFor(kind, M), size);
      if (kind === 'industries') blocks.push(t(48), B.treemap(s, T, M), B.legend(s, T, M));
      else if (kind === 'cities') blocks.push(t(52), B.gap(s, story ? 30 : 10), B.pct(s, T, M, 170), B.gap(s, story ? 40 : 20), B.cityBars(s, T, M));
      else if (kind === 'numbers') { if (!story) y -= 10 * s; blocks.push(B.bigNumber(s, T, M, story ? 150 : 180), B.gap(s, 20), B.stats(s, T, statsAll, story ? 50 : 56, true), B.cityRows(s, T, M, 5)); }
      else blocks.push(t(44), B.stats(s, T, story ? statsAll : statsFull, 46, true), B.treemap(s, T, M), B.legend(s, T, M));
      column(blocks, x, y, w, bottom, (story ? 34 : 26) * s);
      foot(x, Hh - P - (story ? 30 * s : 0), w, story);
    }
    return canvas;
  }

  const toBlob = c => new Promise(r => c.toBlob(r, 'image/png'));
  window.ShareImage = { SIZES, KINDS, render, toBlob, model };
})();
