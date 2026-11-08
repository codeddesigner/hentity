// /sitemap.xml — static pages, category and country landing pages, every live/scheduled product (with its images),
// published articles, and makers who have a public product or profile.
const S = require('./_seo');
const SB = 'https://sislzikhjapilksictxd.supabase.co';
const KEY = 'sb_publishable_49iWYS0Wr9kVY_PfDQphww_jj9dRaBz';
const SITE = S.SITE;
const STATIC = require('./_static-paths.json');
const get = p => fetch(`${SB}/rest/v1/${p}`, { headers: { apikey: KEY } }).then(r => r.ok ? r.json() : []).catch(() => []);
const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

module.exports = async (req, res) => {
  const [products, articles, makers, threads, funding] = await Promise.all([
    get('product_feed?status=in.(scheduled,live,unclaimed)&select=slug,name,updated_at,effective_status,categories,country,owner_id,logo_url,media&order=updated_at.desc&limit=5000'),
    get('articles?status=eq.published&select=slug,published_at&order=published_at.desc&limit=5000'),
    get('profiles?banned=eq.false&settings->>indexable=neq.false&select=id,username,created_at,bio,headline&limit=5000'),
    get('rpc/d_sitemap'),
    get('funding_opps?active=eq.true&select=id,name,updated_at&order=updated_at.desc&limit=5000')
  ]);
  const fslug = n => S.slugify(n).slice(0, 70).replace(/-$/, '');
  const owners = new Set(products.map(p => p.owner_id));
  const cats = new Set(), countries = new Set();
  products.forEach(p => { (p.categories || []).forEach(c => S.CAT_BY_SLUG[S.slugify(c)] && cats.add(c)); if (S.countryUrl(p.country)) countries.add(p.country); });
  const newest = products[0] && products[0].updated_at;
  const prio = { '/funding': '0.8', '/discuss': '0.7', '/': '1.0', '/directory': '0.9', '/news': '0.8', '/launch': '0.7', '/chats': '0.5' };
  const urls = [
    ...STATIC.map(p => ({ loc: SITE + p, pr: prio[p] || '0.5', cf: p === '/' || p === '/news' ? 'hourly' : 'weekly', mod: p === '/' || p === '/directory' ? newest : p === '/funding' && funding[0] ? funding[0].updated_at : null })),
    ...[...cats].map(c => ({ loc: SITE + S.catUrl(c), pr: '0.8', cf: 'daily', mod: newest })),
    ...[...countries].map(c => ({ loc: SITE + S.countryUrl(c), pr: '0.8', cf: 'daily', mod: newest })),
    // Sector in a country (/categories/fintech/nigeria), once it has enough companies to be useful
    ...Object.entries(S.comboCounts(products)).filter(([k, v]) => v >= S.COMBO_MIN).map(([k]) => { const [c, cc] = k.split('|'); return { loc: SITE + S.comboUrl(c, cc), pr: '0.8', cf: 'daily', mod: newest }; }),
    ...products.map(p => ({ loc: `${SITE}/products/${p.slug}`, mod: p.updated_at, pr: p.effective_status === 'live' ? '0.9' : '0.7', cf: 'daily',
      img: [...(p.media || []).filter(m => m && m.url).map(m => m.url), p.logo_url].filter(Boolean).slice(0, 5), name: p.name })),
    // Discuss: public threads that have replies or votes (spam and empty threads stay out), and their communities
    ...[...new Set((threads || []).map(t => t.c))].map(c => ({ loc: `${SITE}/d/${c}`, pr: '0.5', cf: 'daily', mod: (threads.find(t => t.c === c) || {}).mod })),
    ...(threads || []).map(t => ({ loc: `${SITE}/d/${t.c}/${t.s}`, mod: t.mod, pr: '0.6', cf: 'weekly' })),
    // Funding: every active grant and investor (public basics; matching is for members)
    ...funding.map(o => ({ loc: `${SITE}/funding/${fslug(o.name) ? fslug(o.name) + '-' : ''}${o.id}`, mod: o.updated_at, pr: '0.6', cf: 'weekly' })),
    ...articles.map(a => ({ loc: `${SITE}/news/${a.slug}`, mod: a.published_at, pr: '0.6', cf: 'monthly' })),
    ...makers.filter(m => owners.has(m.id) || m.bio || m.headline).map(m => ({ loc: `${SITE}/makers/${m.username}`, mod: m.created_at, pr: '0.4', cf: 'weekly' }))
  ];
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.map(u => `<url><loc>${x(u.loc)}</loc>${u.mod ? `<lastmod>${new Date(u.mod).toISOString().slice(0, 10)}</lastmod>` : ''}<changefreq>${u.cf}</changefreq><priority>${u.pr}</priority>${(u.img || []).map(i => `<image:image><image:loc>${x(i)}</image:loc><image:title>${x(u.name)}</image:title></image:image>`).join('')}</url>`).join('\n')}\n</urlset>`);
};
