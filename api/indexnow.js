// Daily (vercel.json cron): tells Bing, Yandex, Seznam, Naver and Yep about products and articles that changed
// in the last two days via IndexNow. Google reads the sitemap instead (linked from robots.txt).
const S = require('./_seo');
const SB = 'https://sislzikhjapilksictxd.supabase.co';
const KEY = 'sb_publishable_49iWYS0Wr9kVY_PfDQphww_jj9dRaBz';
const INDEXNOW_KEY = '8c879808348cd66cafb8599b1708af9c';   // also served at https://hentity.com/8c879808348cd66cafb8599b1708af9c.txt
const get = p => fetch(`${SB}/rest/v1/${p}`, { headers: { apikey: KEY } }).then(r => r.ok ? r.json() : []).catch(() => []);

module.exports = async (req, res) => {
  const since = new Date(Date.now() - 2 * 864e5).toISOString();
  const [products, articles] = await Promise.all([
    get(`product_feed?status=in.(scheduled,live,unclaimed)&updated_at=gte.${since}&select=slug,categories,country&limit=1000`),
    get(`articles?status=eq.published&published_at=gte.${since}&select=slug&limit=500`)
  ]);
  const urls = new Set();
  products.forEach(p => { urls.add(`${S.SITE}/products/${p.slug}`); (p.categories || []).forEach(c => urls.add(S.SITE + S.catUrl(c))); if (S.countryUrl(p.country)) urls.add(S.SITE + S.countryUrl(p.country)); });
  articles.forEach(a => urls.add(`${S.SITE}/news/${a.slug}`));
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
