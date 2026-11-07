// Embeddable SVG badges: https://hentity.com/badges/<slug>/<kind>.svg?theme=dark|light|auto&size=small|medium|large
// kinds: potw (Product of the Week), potm (Top 3 of the Month), featured, upvotes. Served live, so a new medal or
// count shows up on the maker's site on its own. Each view is counted for the maker's Studio.
// The older /api/badge?slug=… form still works (Product of the Week when earned, otherwise live upvotes).
const SB = 'https://sislzikhjapilksictxd.supabase.co';
const KEY = 'sb_publishable_49iWYS0Wr9kVY_PfDQphww_jj9dRaBz';
const x = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const rpc = (fn, body) => fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const MEDAL = { 1: '#E9B10C', 2: '#A8A8A8', 3: '#C47A3E' };
const SIZES = { small: 0.8, medium: 1, large: 1.2 };
const fmt = n => n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n || 0);

function resolve(kind, info) {
  if (!info) return { kind: 'featured', label: 'LAUNCHING ON' };
  const wk = info.week_rank && info.week_rank <= 3, mo = info.month_rank && info.month_rank <= 3;
  if (kind === 'potw' && wk && info.week_over) return { kind, label: `#${info.week_rank} PRODUCT OF THE WEEK`, medal: info.week_rank, alt: `#${info.week_rank} Product of the Week (${info.week_label}) on Hentity` };
  if (kind === 'potw' && wk && info.live) return { kind, label: `#${info.week_rank} THIS WEEK ON`, medal: info.week_rank, alt: `#${info.week_rank} this week on Hentity` };
  if (kind === 'potm' && mo && info.month_over) return { kind, label: `#${info.month_rank} PRODUCT OF THE MONTH`, medal: info.month_rank, alt: `#${info.month_rank} Product of the Month (${info.month}) on Hentity` };
  if (kind === 'upvotes') return { kind, label: 'UPVOTE ON', count: info.upvotes, alt: `Upvote on Hentity · ${info.upvotes} upvotes` };
  return { kind: 'featured', label: info.live ? 'FEATURED ON' : 'LAUNCHING ON', alt: info.live ? 'Featured on Hentity' : 'Launching on Hentity' };
}

function svg(b, theme, scale, name) {
  const wide = b.medal || b.count != null;
  const W = wide ? 250 : 206, H = 54;
  const css = `.bg{fill:#fff;stroke:#e5e5e5}.fg{fill:#0a0a0a}.sub{fill:#737373}.ci{fill:#0a0a0a}.mk{fill:#fff}.ln{stroke:#e5e5e5}.dark .bg{fill:#0a0a0a;stroke:#0a0a0a}.dark .fg{fill:#fff}.dark .sub{fill:#a3a3a3}.dark .ci{fill:#fff}.dark .mk{fill:#0a0a0a}.dark .ln{stroke:#333}`
    + (theme === 'auto' ? `@media (prefers-color-scheme: dark){.bg{fill:#0a0a0a;stroke:#0a0a0a}.fg{fill:#fff}.sub{fill:#a3a3a3}.ci{fill:#fff}.mk{fill:#0a0a0a}.ln{stroke:#333}}` : '');
  const right = b.medal ? `<circle cx="${W - 30}" cy="27" r="15" fill="${MEDAL[b.medal]}"/><text x="${W - 30}" y="32.5" text-anchor="middle" font-family="Geist,Inter,Arial,sans-serif" font-size="15" font-weight="600" fill="#fff">${b.medal}</text>`
    : b.count != null ? `<line class="ln" x1="${W - 64}" y1="12" x2="${W - 64}" y2="42"/><path class="fg" d="M${W - 32} 13l7.5 12h-15z"/><text class="fg" x="${W - 32}" y="43" text-anchor="middle" font-family="Geist,Inter,Arial,sans-serif" font-size="12" font-weight="500">${x(fmt(b.count))}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W * scale)}" height="${Math.round(H * scale)}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${x(name ? name + ' · ' : '')}${x(b.alt || 'Hentity')}">
<title>${x(name ? name + ' · ' : '')}${x(b.alt || 'Hentity')}</title><style>${css}</style>
<g class="${theme === 'dark' ? 'dark' : ''}">
<rect class="bg" x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="10"/>
<circle class="ci" cx="28" cy="27" r="16"/>
<path class="mk" transform="translate(28 27) scale(.08) translate(-208 -208)" d="M184 90H232V184H326V232A94 94 0 0 0 232 326H184V232H90V184A94 94 0 0 0 184 90Z"/>
<text class="sub" x="54" y="22" font-family="Geist,Inter,Arial,sans-serif" font-size="8.5" letter-spacing=".5">${x(b.label)}</text>
<text class="fg" x="54" y="40" font-family="Geist,Inter,Arial,sans-serif" font-size="17" font-weight="600">Hentity</text>
${right}</g></svg>`;
}

module.exports = async (req, res) => {
  const slug = String(req.query.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const file = String(req.query.file || '').replace(/\.svg$/, '');
  const kind = ['potw', 'potm', 'featured', 'upvotes'].includes(file) ? file : (req.query.kind || 'legacy');
  const theme = ['dark', 'light', 'auto'].includes(req.query.theme) ? req.query.theme : 'light';
  const scale = SIZES[req.query.size] || 1;
  let info = null;
  try { const r = await rpc('badge_info', { s: slug }); info = r.ok ? await r.json() : null; } catch (e) {}
  let b = kind === 'legacy' ? resolve('potw', info) : resolve(kind, info);
  if (kind === 'legacy' && b.kind === 'featured' && info) b = resolve('upvotes', info);
  if (info && req.query.preview !== '1') rpc('badge_hit', { s: slug, ev: 'view' }).catch(() => {});
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  // Short caches so counts stay live; badge views are counted per request
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(svg(b, theme, scale, info && info.name));
};
module.exports.render = svg;
module.exports.resolve = resolve;
