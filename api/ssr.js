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

const S = require('./_seo');
const PCOLS = 'id,slug,name,tagline,description,website,logo_url,media,categories,country,city,countries,pay_methods,platforms,languages,stage,upvote_count,comment_count,follower_count,effective_status,week_id,launch_date,created_at,updated_at,verified';
const LIST = 'slug,name,tagline,city,country,categories,logo_url,upvote_count';

// Unclaimed profiles: the public facts Hentity collected, each with its source (hidden facts never reach the view)
function unclaimedBlock(p) {
  if (p.effective_status !== 'unclaimed') return '';
  const f = (p.claim && p.claim.facts) || [], n = (p.claim && p.claim.news) || [];
  return `<p>This profile was created by Hentity from public sources and hasn't been claimed by the ${esc(p.name)} team yet. <a href="/claim/${esc(p.slug)}">Work there? Claim it.</a></p>`
    + (f.length ? `<h2>What we know about ${esc(p.name)}</h2><dl>${f.map(x => `<dt>${esc(x.label || x.key)}</dt><dd>${esc(x.value)}${x.source ? ` (source: ${x.url ? `<a href="${esc(x.url)}" rel="nofollow noopener">${esc(x.source)}</a>` : esc(x.source)})` : ''}</dd>`).join('')}</dl>` : '')
    + (n.length ? `<h2>${esc(p.name)} in the news</h2><ul>${n.map(x => `<li><a href="${esc(x.url)}" rel="nofollow noopener">${esc(x.title)}</a> (${esc(x.source || '')})</li>`).join('')}</ul>` : '');
}

async function build(type, slug) {
  if (type === 'product') {
    const [p] = await rest(`product_feed?slug=eq.${encodeURIComponent(slug)}&status=in.(scheduled,live,unclaimed)&select=${PCOLS},claim,company_id,owner:profiles!products_owner_id_fkey(name,username)`);
    if (!p) return null;
    if (p.company_id) p.company = (await rest(`companies?id=eq.${p.company_id}&select=name,city,country,verified,founded`).catch(() => []))[0] || null;
    const where = [p.city, COUNTRY[p.country] || p.country].filter(Boolean).join(', ');
    const cats = p.categories || [];
    const cat = cats[0];
    const alts = cats.length ? await rest(`product_feed?status=in.(scheduled,live)&categories=ov.${encodeURIComponent('{' + cats.map(c => '"' + c.replace(/"/g, '') + '"').join(',') + '}')}&id=neq.${p.id}&select=${LIST}&order=upvote_count.desc&limit=6`).catch(() => []) : [];
    const tag = S.trimP(p.tagline);
    const title = `${p.name}: ${tag} | Hentity`;
    const desc = clip(`${tag}. ${p.description || ''} Built in ${where}.`.replace(/\.\s*\./g, '.'), 160);
    const shot = (p.media || []).find(m => m && m.url);
    const launched = p.launch_date || (p.created_at || '').slice(0, 10);
    const app = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: p.name, description: tag, url: `${SITE}/products/${p.slug}`,
      applicationCategory: S.appCategory(cats), ...(cat ? { applicationSubCategory: cat } : {}), operatingSystem: p.platforms || 'Web',
      ...(p.logo_url || shot ? { image: [shot && shot.url, p.logo_url].filter(Boolean) } : {}), ...(shot ? { screenshot: shot.url } : {}),
      ...(p.website ? { sameAs: [p.website], installUrl: p.website } : {}), ...(launched ? { datePublished: launched } : {}),
      ...(p.countries && p.countries.length ? { areaServed: p.countries.map(c => ({ '@type': 'Country', name: COUNTRY[c] || c })) } : {}),
      ...(p.owner ? { author: { '@type': 'Person', name: p.owner.name, url: `${SITE}/makers/${p.owner.username}` } } : {}),
      ...(p.company ? { publisher: { '@type': 'Organization', name: p.company.name, ...(p.company.founded ? { foundingDate: String(p.company.founded) } : {}) } } : {}),
      interactionStatistic: [{ '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: p.upvote_count }, { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: p.comment_count }, { '@type': 'InteractionCounter', interactionType: 'https://schema.org/FollowAction', userInteractionCount: p.follower_count }] };
    const facts = [['Category', cats.map(c => `<a href="${S.catUrl(c)}">${esc(c)}</a>`).join(', ')], ['Based in', p.country && S.countryUrl(p.country) ? `${esc(p.city ? p.city + ', ' : '')}<a href="${S.countryUrl(p.country)}">${esc(COUNTRY[p.country] || p.country)}</a>` : esc(where)], ['Available in', esc((p.countries || []).map(c => COUNTRY[c] || c).join(', '))], ['Pay with', esc((p.pay_methods || []).join(', '))], ['Platforms', esc(p.platforms || '')], ['Languages', esc(p.languages || '')], ['Stage', esc(p.stage || '')], ['Launched on Hentity', esc(launched || '')]].filter(f => f[1]);
    return {
      title, desc, path: `/products/${p.slug}`, image: shot ? shot.url : p.logo_url, large: !!shot, type: 'product',
      ld: [app, crumbs([['Products', '/directory'], ...(cat ? [[cat, S.catUrl(cat)]] : []), [p.name, `/products/${p.slug}`]])],
      main: `<nav aria-label="Breadcrumb"><a href="/">Hentity</a> / <a href="/directory">Products</a>${cat ? ` / <a href="${S.catUrl(cat)}">${esc(cat)}</a>` : ''} / ${esc(p.name)}</nav>
        <h1>${esc(p.name)}</h1><p><strong>${esc(tag)}</strong></p>
        ${p.logo_url ? `<img src="${esc(p.logo_url)}" alt="${esc(p.name)} logo" width="64" height="64">` : ''}
        <h2>About ${esc(p.name)}</h2><p style="white-space:pre-line">${esc(p.description || p.tagline)}</p>
        <dl>${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
        <p>${p.upvote_count} upvotes · ${p.comment_count} comments · ${p.follower_count} followers on Hentity</p>
        ${p.website ? `<p><a href="${esc(p.website)}" rel="noopener">Visit ${esc(p.name)}</a></p>` : ''}
        ${p.owner ? `<p>Made by <a href="/makers/${esc(p.owner.username)}">${esc(p.owner.name)}</a>${p.company ? ` at ${esc(p.company.name)}` : ''}</p>` : ''}
        ${unclaimedBlock(p)}
        ${S.list(alts, `Alternatives to ${p.name}`)}${S.nav()}`
    };
  }
  if (type === 'maker') {
    const [u] = await rest(`profiles?username=eq.${encodeURIComponent(slug)}&banned=eq.false&select=id,username,name,headline,bio,country,city,avatar_url,website,x,linkedin,settings`);
    if (!u) return null;
    const indexable = !u.settings || u.settings.indexable !== false;
    const prods = await rest(`products?owner_id=eq.${u.id}&status=in.(scheduled,live)&select=name,slug,tagline,city,country&limit=20`).catch(() => []);
    const where = [u.city, COUNTRY[u.country] || u.country].filter(Boolean).join(', ');
    return {
      title: `${u.name} (@${u.username})${u.headline ? ' — ' + u.headline : ''} | Hentity`,
      desc: clip(u.bio || `${u.name} is a maker on Hentity${where ? ' based in ' + where : ''}.${prods.length ? ' Products: ' + prods.map(p => p.name).join(', ') + '.' : ''}`, 160),
      path: `/makers/${u.username}`, image: u.avatar_url, type: 'profile', noindex: !indexable || (!prods.length && !u.bio && !u.headline),
      ld: [{ '@context': 'https://schema.org', '@type': 'ProfilePage', mainEntity: { '@type': 'Person', name: u.name, alternateName: '@' + u.username, description: u.headline || undefined, ...(u.avatar_url ? { image: u.avatar_url } : {}), ...(where ? { homeLocation: { '@type': 'Place', name: where } } : {}), sameAs: [u.website, u.x && 'https://x.com/' + u.x, u.linkedin && (u.linkedin.startsWith('http') ? u.linkedin : 'https://' + u.linkedin)].filter(Boolean) } }],
      main: `<h1>${esc(u.name)}</h1>${u.headline ? `<p><strong>${esc(u.headline)}</strong></p>` : ''}${where ? `<p>${esc(where)}</p>` : ''}${u.bio ? `<p>${esc(u.bio)}</p>` : ''}${S.list(prods, 'Products by ' + u.name)}${S.nav()}`
    };
  }
  if (type === 'article') {
    const [a] = await rest(`articles?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=slug,title,dek,bullets,topic,source,source_url,image_url,published_at`);
    if (!a) return null;
    return {
      title: `${a.title} | Hentity News`, desc: clip(a.dek, 160), path: `/news/${a.slug}`, image: a.image_url, type: 'article', published: a.published_at,
      ld: [{ '@context': 'https://schema.org', '@type': 'NewsArticle', headline: clip(a.title, 110), description: a.dek, datePublished: a.published_at, dateModified: a.published_at, articleSection: a.topic, mainEntityOfPage: `${SITE}/news/${a.slug}`, ...(a.image_url ? { image: [a.image_url] } : { image: [SITE + '/og.png'] }), author: { '@type': 'Organization', name: a.source || 'Hentity' }, publisher: { '@type': 'Organization', name: 'Hentity', logo: { '@type': 'ImageObject', url: SITE + '/icon-512.png' } }, ...(a.source_url ? { isBasedOn: a.source_url } : {}) },
        crumbs([['News', '/news'], [a.title, `/news/${a.slug}`]])],
      main: `<nav aria-label="Breadcrumb"><a href="/">Hentity</a> / <a href="/news">News</a></nav><h1>${esc(a.title)}</h1><p>${esc(a.dek)}</p><ul>${(a.bullets || []).map(b => `<li>${esc(b)}</li>`).join('')}</ul>${a.source_url ? `<p>Source: <a href="${esc(a.source_url)}" rel="nofollow noopener">${esc(a.source || a.source_url)}</a></p>` : ''}`
    };
  }
  if (type === 'beta') {
    const [b] = await rest(`betas?slug=eq.${encodeURIComponent(slug)}&status=in.(open,closed)&select=slug,title,why,spots,accepted_count,perk,airtime_amount,closes_at,product:products(name,slug,logo_url,tagline)`);
    if (!b) return null;
    const p = b.product || {};
    const perk = [b.perk, b.airtime_amount > 0 ? '₦' + Number(b.airtime_amount).toLocaleString('en-US') + ' airtime' : ''].filter(Boolean).join(' + ');
    const left = Math.max(0, b.spots - b.accepted_count);
    return {
      title: `${p.name} beta · Testers wanted | Hentity`, desc: clip(`${b.title}. ${left} spots left${perk ? ' · perk: ' + perk : ''}. ${b.why || ''}`, 200),
      path: `/b/${b.slug}`, image: p.logo_url, type: 'website', noindex: true, ld: [],
      main: `<h1>${esc(b.title)}</h1><p>${esc(p.name)} · ${esc(b.why || '')}</p>`
    };
  }
  if (type === 'category' || type === 'country' || type === 'directory') {
    const cat = type === 'category' ? S.CAT_BY_SLUG[slug] : null, cc = type === 'country' ? S.COUNTRY_BY_SLUG[slug] : null;
    if ((type === 'category' && !cat) || (type === 'country' && !cc)) return null;
    const filter = cat ? `&categories=cs.${encodeURIComponent('{"' + cat + '"}')}` : cc ? `&country=eq.${cc}` : '';
    const rows = await rest(`product_feed?status=in.(scheduled,live,unclaimed)${filter}&select=${LIST}&order=upvote_count.desc,created_at.desc&limit=500`).catch(() => []);
    const cname = cc ? COUNTRY[cc] : '';
    const h1 = cat ? `${cat} products and startups from Africa` : cc ? `Startups and products built in ${cname}` : 'Directory of products built across Africa';
    const title = cat ? `Best ${cat} startups and products in Africa (${new Date().getFullYear()}) | Hentity` : cc ? `Best startups and products from ${cname} (${new Date().getFullYear()}) | Hentity` : 'African startup and product directory | Hentity';
    const lead = cat ? `${rows.length} ${cat} product${rows.length === 1 ? '' : 's'} launched by makers across Africa, ranked by the Hentity community. Compare features, payment methods and countries served.`
      : cc ? `${rows.length} product${rows.length === 1 ? '' : 's'} built by founders in ${cname}, ranked by the Hentity community. Find tools that work with local payments and languages.`
      : `${rows.length} products built by makers across Africa. Filter by country, payment method (Paystack, M-Pesa, MTN MoMo, USSD), stage and sector.`;
    const path = cat ? S.catUrl(cat) : cc ? S.countryUrl(cc) : '/directory';
    return {
      title, desc: clip(lead, 160), path, type: 'website', noindex: !rows.length && type !== 'directory', h1,
      ld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: h1, description: lead, url: SITE + path, mainEntity: { '@type': 'ItemList', numberOfItems: rows.length, itemListElement: rows.slice(0, 100).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/products/${p.slug}`, name: p.name })) } },
        crumbs([['Products', '/directory'], ...(cat || cc ? [[cat || cname, path]] : [])])],
      ssr: `<h2>${esc(h1)}</h2><p>${esc(lead)}</p>${S.list(rows)}${S.nav()}`
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
  const tpl = { product: '/product', maker: '/maker', article: '/article', home: '/home', news: '/news-index', beta: '/beta-apply', category: '/directory-index', country: '/directory-index', directory: '/directory-index' }[type];
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
  // Browsers always re-check (so a new release shows on the next load); Vercel's edge keeps a 30s copy.
  const CACHE = 'public, max-age=0, must-revalidate';
  res.setHeader('Vercel-CDN-Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (type === 'home' || type === 'news') {
    const data = await PRELOAD[type]().catch(() => null);
    res.setHeader('Cache-Control', CACHE);
    let extra = '';
    if (type === 'home' && data) {
      const board = Object.keys(data).filter(k => k.startsWith('board:')).map(k => data[k])[0] || [];
      extra = `<h2>This week’s launches</h2>${S.list(board)}${S.list(data.upcoming, 'Launching soon')}${S.nav()}`;
    } else if (type === 'news' && data) {
      const arts = Object.values(data).find(v => Array.isArray(v) && v[0] && v[0].dek !== undefined) || [];
      extra = arts.length ? `<h2>Latest African tech news</h2><ul>${arts.map(a => `<li><a href="/news/${esc(a.slug)}">${esc(a.title)}</a> — ${esc(a.dek || '')}</li>`).join('')}</ul>` : '';
    }
    if (extra) page = page.replace(/(<\/main>)/, S.block(extra) + '$1');
    return res.end(withPreload(page, data));
  }
  let meta = null, data = null;
  [meta, data] = await Promise.all([
    key && tpl ? build(type, key).catch(() => null) : null,
    key && PRELOAD[type] ? PRELOAD[type](key).catch(() => null) : null
  ]);
  if (!meta) {
    // Unknown or unpublished: a real 404 (so search engines drop it), while the page still renders its own "not found" state.
    if (key) res.statusCode = 404;
    res.setHeader('Cache-Control', CACHE);
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
    `<meta name="twitter:card" content="${meta.image && !meta.large ? 'summary' : 'summary_large_image'}">`,
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
    ;
  // Real, crawlable content in the page itself (search engines and AI crawlers that don't run JavaScript read it;
  // the app replaces it as soon as it renders)
  if (meta.main) page = page.replace(/(<main\b[^>]*>)[\s\S]*?(<\/main>)/, (m, a, b) => type === 'article' ? m.replace(a, a + S.block(meta.main)) : a + S.block(meta.main) + b);
  if (meta.ssr) page = page.replace(/(<\/main>)/, S.block(meta.ssr) + '$1');
  if (meta.h1) page = page.replace(/(<h1\b[^>]*id="title"[^>]*>)[^<]*/, (m, a) => a + esc(meta.h1) + ' ');
  res.setHeader('Cache-Control', CACHE);
  res.end(withPreload(page, data));
};
