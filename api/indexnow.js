// Daily (vercel.json cron): tells Bing, Yandex, Seznam, Naver and Yep about products and articles that changed
// in the last two days via IndexNow. Google reads the sitemap instead (linked from robots.txt).
const S = require('./_seo');
const SB = 'https://sislzikhjapilksictxd.supabase.co';
const KEY = 'sb_publishable_49iWYS0Wr9kVY_PfDQphww_jj9dRaBz';
const INDEXNOW_KEY = '8c879808348cd66cafb8599b1708af9c';   // also served at https://hentity.com/8c879808348cd66cafb8599b1708af9c.txt
const get = p => fetch(`${SB}/rest/v1/${p}`, { headers: { apikey: KEY } }).then(r => r.ok ? r.json() : []).catch(() => []);

module.exports = async (req, res) => {
  const since = new Date(Date.now() - 2 * 864e5).toISOString();
  // ?all=funding submits every funding listing once (e.g. after the pages first went public)
  const fSince = req.query && req.query.all === 'funding' ? '1970-01-01' : since;
  const [products, articles, funding, threads] = await Promise.all([
    get(`product_feed?status=in.(scheduled,live,unclaimed)&updated_at=gte.${since}&select=slug,categories,country&limit=1000`),
    get(`articles?status=eq.published&published_at=gte.${since}&select=slug&limit=500`),
    get(`funding_opps?active=eq.true&updated_at=gte.${fSince}&select=id,name&limit=2000`),
    get('rpc/d_sitemap')
  ]);
  const fslug = n => S.slugify(n).slice(0, 70).replace(/-$/, '');
  const urls = new Set();
  products.forEach(p => { urls.add(`${S.SITE}/products/${p.slug}`); (p.categories || []).forEach(c => urls.add(S.SITE + S.catUrl(c))); if (S.countryUrl(p.country)) urls.add(S.SITE + S.countryUrl(p.country)); (p.categories || []).forEach(c => { const u = S.CAT_BY_SLUG[S.slugify(c)] && S.comboUrl(c, p.country); if (u) urls.add(S.SITE + u); }); });
  articles.forEach(a => urls.add(`${S.SITE}/news/${a.slug}`));
  funding.forEach(o => urls.add(`${S.SITE}/funding/${fslug(o.name) ? fslug(o.name) + '-' : ''}${o.id}`));
  if (funding.length) urls.add(S.SITE + '/funding');
  (Array.isArray(threads) ? threads : []).filter(t => t.mod && t.mod >= since).forEach(t => urls.add(`${S.SITE}/d/${t.c}/${t.s}`));
  if (urls.size) { urls.add(S.SITE + '/'); urls.add(S.SITE + '/directory'); }
  let status = 'nothing new';
  if (urls.size) {
    const r = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: 'hentity.com', key: INDEXNOW_KEY, keyLocation: `${S.SITE}/${INDEXNOW_KEY}.txt`, urlList: [...urls].slice(0, 10000) }) }).catch(e => ({ status: 'error ' + e.message }));
    status = r.status;
  }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ submitted: urls.size, status }));
};
