// /sitemap.xml — static pages plus every live/scheduled product, published article and indexable maker.
const SB = 'https://sislzikhjapilksictxd.supabase.co';
const KEY = 'sb_publishable_49iWYS0Wr9kVY_PfDQphww_jj9dRaBz';
const SITE = 'https://hentity.vercel.app';
const STATIC = require('./_static-paths.json');
const get = p => fetch(`${SB}/rest/v1/${p}`, { headers: { apikey: KEY } }).then(r => r.ok ? r.json() : []).catch(() => []);
const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

module.exports = async (req, res) => {
  const [products, articles, makers] = await Promise.all([
    get('product_feed?status=in.(scheduled,live)&select=slug,updated_at,effective_status&order=updated_at.desc&limit=5000'),
    get('articles?status=eq.published&select=slug,published_at&order=published_at.desc&limit=5000'),
    get('profiles?banned=eq.false&settings->>indexable=neq.false&select=username,created_at&limit=5000')
  ]);
  const prio = { '/': '1.0', '/directory': '0.8', '/news': '0.8', '/launch': '0.7', '/chats': '0.6' };
  const urls = [
    ...STATIC.map(p => ({ loc: SITE + p, pr: prio[p] || '0.5', cf: p === '/' || p === '/news' ? 'hourly' : 'weekly' })),
    ...products.map(p => ({ loc: `${SITE}/products/${p.slug}`, mod: p.updated_at, pr: p.effective_status === 'live' ? '0.9' : '0.6', cf: 'daily' })),
    ...articles.map(a => ({ loc: `${SITE}/news/${a.slug}`, mod: a.published_at, pr: '0.7', cf: 'weekly' })),
    ...makers.map(m => ({ loc: `${SITE}/makers/${m.username}`, mod: m.created_at, pr: '0.4', cf: 'weekly' }))
  ];
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${x(u.loc)}</loc>${u.mod ? `<lastmod>${new Date(u.mod).toISOString().slice(0, 10)}</lastmod>` : ''}<changefreq>${u.cf}</changefreq><priority>${u.pr}</priority></url>`).join('\n')}\n</urlset>`);
};
