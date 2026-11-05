// /api/badge?slug=ledgerline[&theme=dark] — embeddable "Launched on Hentity" SVG badge with live upvotes and rank.
const SB = 'https://sislzikhjapilksictxd.supabase.co';
const KEY = 'sb_publishable_49iWYS0Wr9kVY_PfDQphww_jj9dRaBz';
const x = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

module.exports = async (req, res) => {
  const slug = String(req.query.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const dark = req.query.theme === 'dark';
  let p = null, rank = null;
  try {
    const r = await fetch(`${SB}/rest/v1/product_feed?slug=eq.${slug}&status=in.(scheduled,live)&select=id,name,upvote_count,week_id,effective_status`, { headers: { apikey: KEY } });
    [p] = await r.json();
    if (p && p.week_id) {
      const w = await fetch(`${SB}/rest/v1/product_feed?week_id=eq.${p.week_id}&status=in.(scheduled,live)&select=id&order=upvote_count.desc&limit=50`, { headers: { apikey: KEY } }).then(r => r.json());
      const i = w.findIndex(q => q.id === p.id); if (i > -1 && i < 10) rank = i + 1;
    }
  } catch (e) {}
  const bg = dark ? '#0a0a0a' : '#ffffff', fg = dark ? '#ffffff' : '#0a0a0a', sub = dark ? '#a3a3a3' : '#737373', bd = dark ? '#262626' : '#e5e5e5';
  const label = rank ? `#${rank} PRODUCT OF THE WEEK` : 'LAUNCHED ON';
  const votes = p ? p.upvote_count : 0;
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
  res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="250" height="54" viewBox="0 0 250 54" role="img" aria-label="${x(p ? p.name : 'Hentity')}: ${label.toLowerCase()} Hentity, ${votes} upvotes">
<rect x=".5" y=".5" width="249" height="53" rx="10" fill="${bg}" stroke="${bd}"/>
<rect x="12" y="11" width="32" height="32" rx="8" fill="#ff5b14"/><path d="M21 19v16M35 19v16M21 27h14" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
<text x="54" y="23" font-family="Geist,Inter,Arial,sans-serif" font-size="9" letter-spacing=".6" fill="${sub}">${label}</text>
<text x="54" y="40" font-family="Geist,Inter,Arial,sans-serif" font-size="17" font-weight="600" fill="${fg}">Hentity</text>
<line x1="186" y1="12" x2="186" y2="42" stroke="${bd}"/>
<path d="M218 17l6 7h-4v6h-4v-6h-4z" fill="#ff5b14"/>
<text x="218" y="44" text-anchor="middle" font-family="Geist Mono,Menlo,monospace" font-size="12" font-weight="500" fill="${fg}">${votes}</text>
</svg>`);
};
