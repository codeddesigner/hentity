// Server-rendered SEO for dynamic pages. Vercel rewrites /products/:slug, /makers/:handle and /news/:slug here.
// It loads the static template from this deployment, fills in title, description, canonical, Open Graph,
// Twitter and JSON-LD from Supabase, and adds a crawlable <noscript> summary. The page then hydrates as usual.
const SB = 'https://sislzikhjapilksictxd.supabase.co';
const KEY = 'sb_publishable_49iWYS0Wr9kVY_PfDQphww_jj9dRaBz';
const SITE = 'https://hentity.com';
const COUNTRY = { NG: 'Nigeria', KE: 'Kenya', GH: 'Ghana', ZA: 'South Africa', RW: 'Rwanda', EG: 'Egypt', MA: 'Morocco', SN: 'Senegal', ET: 'Ethiopia', UG: 'Uganda', TZ: 'Tanzania', CI: 'Côte d’Ivoire', CM: 'Cameroon', TN: 'Tunisia' };

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };
async function rest(path) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: KEY, Accept: 'application/json' } });
  if (!r.ok) throw new Error('supabase ' + r.status);
  return r.json();
}

async function build(type, slug) {
  if (type === 'product') {
    const [p] = await rest(`product_feed?slug=eq.${encodeURIComponent(slug)}&status=in.(scheduled,live)&select=id,slug,name,tagline,description,website,logo_url,categories,country,city,upvote_count,comment_count,effective_status,week_id,created_at,owner:profiles!products_owner_id_fkey(name,username)`);
    if (!p) return null;
    const where = [p.city, COUNTRY[p.country] || p.country].filter(Boolean).join(', ');
    const title = `${p.name} — ${p.tagline} | Hentity`;
    const desc = clip(`${p.tagline}. ${p.description || ''} Built in ${where}.`, 160);
    return {
      title, desc, path: `/products/${p.slug}`, image: p.logo_url, type: 'product',
      ld: [{ '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: p.name, description: p.tagline, url: `${SITE}/products/${p.slug}`, applicationCategory: (p.categories || [])[0] || 'BusinessApplication', operatingSystem: 'Web', ...(p.logo_url ? { image: p.logo_url } : {}), ...(p.website ? { sameAs: [p.website] } : {}), offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, ...(p.owner ? { author: { '@type': 'Person', name: p.owner.name, url: `${SITE}/makers/${p.owner.username}` } } : {}), interactionStatistic: [{ '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: p.upvote_count }, { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: p.comment_count }] },
        crumbs([['Products', '/directory'], [p.name, `/products/${p.slug}`]])],
      body: `<h1>${esc(p.name)}</h1><p>${esc(p.tagline)}</p><p>${esc(p.description)}</p><p>${esc(where)} · ${p.upvote_count} upvotes · ${p.comment_count} comments</p>${p.website ? `<p><a href="${esc(p.website)}" rel="nofollow">${esc(p.website)}</a></p>` : ''}`
    };
  }
  if (type === 'maker') {
    const [u] = await rest(`profiles?username=eq.${encodeURIComponent(slug)}&banned=eq.false&select=id,username,name,headline,bio,country,city,avatar_url,website,x,linkedin,settings`);
    if (!u) return null;
    const indexable = !u.settings || u.settings.indexable !== false;
    const prods = await rest(`products?owner_id=eq.${u.id}&status=in.(scheduled,live)&select=name,slug,tagline&limit=10`).catch(() => []);
    const where = [u.city, COUNTRY[u.country] || u.country].filter(Boolean).join(', ');
    return {
      title: `${u.name} (@${u.username})${u.headline ? ' — ' + u.headline : ''} | Hentity`,
      desc: clip(u.bio || `${u.name} is a maker on Hentity${where ? ' based in ' + where : ''}.${prods.length ? ' Products: ' + prods.map(p => p.name).join(', ') + '.' : ''}`, 160),
      path: `/makers/${u.username}`, image: u.avatar_url, type: 'profile', noindex: !indexable,
      ld: [{ '@context': 'https://schema.org', '@type': 'ProfilePage', mainEntity: { '@type': 'Person', name: u.name, alternateName: '@' + u.username, description: u.headline || undefined, ...(u.avatar_url ? { image: u.avatar_url } : {}), ...(where ? { homeLocation: { '@type': 'Place', name: where } } : {}), sameAs: [u.website, u.x && 'https://x.com/' + u.x, u.linkedin && (u.linkedin.startsWith('http') ? u.linkedin : 'https://' + u.linkedin)].filter(Boolean) } }],
      body: `<h1>${esc(u.name)}</h1><p>${esc(u.headline)}</p><p>${esc(u.bio)}</p>${prods.length ? '<ul>' + prods.map(p => `<li><a href="/products/${p.slug}">${esc(p.name)}</a> — ${esc(p.tagline)}</li>`).join('') + '</ul>' : ''}`
    };
  }
  if (type === 'article') {
    const [a] = await rest(`articles?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=slug,title,dek,bullets,topic,source,source_url,image_url,published_at`);
    if (!a) return null;
    return {
      title: `${a.title} | Hentity News`, desc: clip(a.dek, 160), path: `/news/${a.slug}`, image: a.image_url, type: 'article', published: a.published_at,
      ld: [{ '@context': 'https://schema.org', '@type': 'NewsArticle', headline: clip(a.title, 110), description: a.dek, datePublished: a.published_at, dateModified: a.published_at, articleSection: a.topic, mainEntityOfPage: `${SITE}/news/${a.slug}`, ...(a.image_url ? { image: [a.image_url] } : { image: [SITE + '/og.png'] }), author: { '@type': 'Organization', name: a.source || 'Hentity' }, publisher: { '@type': 'Organization', name: 'Hentity', logo: { '@type': 'ImageObject', url: SITE + '/icon-512.png' } }, ...(a.source_url ? { isBasedOn: a.source_url } : {}) },
        crumbs([['News', '/news'], [a.title, `/news/${a.slug}`]])],
      body: `<h1>${esc(a.title)}</h1><p>${esc(a.dek)}</p><ul>${(a.bullets || []).map(b => `<li>${esc(b)}</li>`).join('')}</ul>`
    };
  }
  return null;
}
function crumbs(items) { return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [['Hentity', '/'], ...items].map(([n, p], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: SITE + p })) }; }

// Templates ship with the function (vercel.json includeFiles) and stay in memory between requests.
const fs = require('fs'), path = require('path');
const TPL = {};
function template(p) { return TPL[p] || (TPL[p] = fs.readFileSync(path.join(process.cwd(), 'public', p.replace(/^\//, '') + '.html'), 'utf8')); }

const PRELOAD = require('./_preload');
// Embed the page's public data before the page's own scripts run (api.js reads window.__PRELOAD__ on load).
function withPreload(page, data) {
  if (!data || !Object.keys(data).length) return page;
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  // right after <meta charset>, which browsers expect within the first 1 KB
  return page.replace(/(<meta charset="utf-8">)/i, `$1\n<script>window.__PRELOAD__=${json}</script>`);
}

let warm = false;  // false only on the first request after a cold start
module.exports = async (req, res) => {
  const t0 = Date.now(), cold = !warm; warm = true;
  // Server-Timing is visible in the browser's performance data (and in the perf beacons)
  const end = res.end.bind(res);
  res.end = body => { try { res.setHeader('Server-Timing', `ssr;dur=${Date.now() - t0}${cold ? ', cold;dur=0' : ''}`); } catch (e) {} return end(body); };
  const { type, slug } = req.query;
  const tpl = { product: '/product', maker: '/maker', article: '/article', home: '/home', news: '/news-index' }[type];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  let page;
  try { page = template(tpl || '/404'); }
  catch (e) {
    // Fallback: fetch the static template from this deployment
    try { const r = await fetch(`${proto}://${host}${tpl || '/404'}`, { headers: { 'x-ssr': '1' } }); page = await r.text(); }
    catch (e2) { res.statusCode = 502; return res.end('Template unavailable'); }
  }
  const key = slug ? String(slug).toLowerCase() : '';
  // Short edge cache: repeat visits are served instantly, and nothing is more than ~a minute old
  const CACHE = 'public, s-maxage=30, stale-while-revalidate=60';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (type === 'home' || type === 'news') {
    const data = await PRELOAD[type]().catch(() => null);
    res.setHeader('Cache-Control', CACHE);
    return res.end(withPreload(page, data));
  }
  let meta = null, data = null;
  [meta, data] = await Promise.all([
    key && tpl ? build(type, key).catch(() => null) : null,
    key && PRELOAD[type] ? PRELOAD[type](key).catch(() => null) : null
  ]);
  if (!meta) {
    // Unknown or unpublished: let the client render its own "not found" state, but keep it out of the index.
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.end(page.replace(/<meta name="robots"[^>]*>/g, '').replace('</head>', '<meta name="robots" content="noindex">\n</head>'));
  }
  const url = SITE + meta.path, img = meta.image || SITE + '/og.png?v=' + require('./_cols.json').OG_V;
  const tags = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.desc)}">`,
    meta.noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">`,
    `<meta property="og:site_name" content="Hentity">`,
    `<meta property="og:type" content="${meta.type === 'article' ? 'article' : meta.type === 'profile' ? 'profile' : 'website'}">`,
    `<meta property="og:title" content="${esc(meta.title.replace(/ \| Hentity.*$/, ''))}">`,
    `<meta property="og:description" content="${esc(meta.desc)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${esc(img)}">`,
    meta.published ? `<meta property="article:published_time" content="${meta.published}">` : '',
    `<meta name="twitter:card" content="${meta.image ? 'summary' : 'summary_large_image'}">`,
    `<meta name="twitter:title" content="${esc(meta.title.replace(/ \| Hentity.*$/, ''))}">`,
    `<meta name="twitter:description" content="${esc(meta.desc)}">`,
    `<meta name="twitter:image" content="${esc(img)}">`,
    ...meta.ld.map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`)
  ].filter(Boolean).join('\n');
  page = page
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta (name|property)="(description|robots|og:[a-z:_]+|twitter:[a-z]+)"[^>]*>/g, '')
    .replace(/<link rel="canonical"[^>]*>/g, '')
    .replace('</head>', tags + '\n</head>')
    .replace(/<body([^>]*)>/, `<body$1>\n<noscript><div style="max-width:720px;margin:40px auto;padding:0 16px">${meta.body}</div></noscript>`);
  res.setHeader('Cache-Control', CACHE);
  res.end(withPreload(page, data));
};
