// Server-rendered SEO for dynamic pages. Vercel rewrites /products/:slug, /makers/:handle and /news/:slug here.
// It loads the static template from this deployment, fills in title, description, canonical, Open Graph,
// Twitter and JSON-LD from Supabase, and adds a crawlable <noscript> summary. The page then hydrates as usual.
const SB = 'https://sislzikhjapilksictxd.supabase.co';
const KEY = 'sb_publishable_49iWYS0Wr9kVY_PfDQphww_jj9dRaBz';
const SITE = 'https://hentity.com';
const COUNTRY = require('./_seo').COUNTRY;

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
const TEAM_COLS = 'name,username,headline,bio,city,country,website,x,linkedin,avatar_url,settings,banned';
function unclaimedBlock(p) {
  if (p.effective_status !== 'unclaimed') return '';
  const f = (p.claim && p.claim.facts) || [], n = (p.claim && p.claim.news) || [];
  return `<p>This profile was created by Hentity from public sources and hasn't been claimed by the ${esc(p.name)} team yet. <a href="/claim/${esc(p.slug)}">Work there? Claim it.</a></p>`
    + (f.length ? `<h2>What we know about ${esc(p.name)}</h2><dl>${f.map(x => `<dt>${esc(x.label || x.key)}</dt><dd>${esc(x.value)}${x.source ? ` (source: ${x.url ? `<a href="${esc(x.url)}" rel="nofollow noopener">${esc(x.source)}</a>` : esc(x.source)})` : ''}</dd>`).join('')}</dl>` : '')
    + (n.length ? `<h2>${esc(p.name)} in the news</h2><ul>${n.map(x => `<li><a href="${esc(x.url)}" rel="nofollow noopener">${esc(x.title)}</a> (${esc(x.source || '')})</li>`).join('')}</ul>` : '');
}

async function build(type, slug) {
  if (type === 'product') {
    const [p] = await rest(`product_feed?slug=eq.${encodeURIComponent(slug)}&status=in.(scheduled,live,unclaimed)&select=${PCOLS},claim,company_id,owner:profiles!products_owner_id_fkey(${TEAM_COLS})`);
    if (!p) return null;
    // The founders and makers behind it, with their bios (unless a maker opted out of search engines)
    const mk = await rest(`product_makers?product_id=eq.${p.id}&accepted=eq.true&select=role,user:profiles!product_makers_user_id_fkey(${TEAM_COLS})`).catch(() => []);
    const team = [p.owner && !p.owner.banned && { u: p.owner, role: 'Founder' }, ...mk.filter(m => m.user && !m.user.banned && (!p.owner || m.user.username !== p.owner.username)).map(m => ({ u: m.user, role: m.role || 'Maker' }))].filter(Boolean);
    const open = u => !u.settings || u.settings.indexable !== false;
    const person = ({ u, role }) => ({ '@type': 'Person', name: u.name, url: `${SITE}/makers/${u.username}`, jobTitle: role, ...(open(u) ? { ...(u.headline ? { description: u.headline } : {}), ...(u.avatar_url ? { image: u.avatar_url } : {}), ...(u.city || u.country ? { homeLocation: { '@type': 'Place', name: [u.city, COUNTRY[u.country] || u.country].filter(Boolean).join(', ') } } : {}), sameAs: [u.website, u.x && 'https://x.com/' + u.x.replace(/^@/, ''), u.linkedin && (u.linkedin.startsWith('http') ? u.linkedin : 'https://' + u.linkedin)].filter(Boolean) } : {}) });
    const teamHtml = team.length ? `<h2>The team behind ${esc(p.name)}</h2>` + team.map(({ u, role }) => `<section><h3><a href="/makers/${esc(u.username)}">${esc(u.name)}</a>, ${esc(role)}</h3>${open(u) ? `${u.headline ? `<p><strong>${esc(u.headline)}</strong></p>` : ''}${u.city || u.country ? `<p>Based in ${esc([u.city, COUNTRY[u.country] || u.country].filter(Boolean).join(', '))}</p>` : ''}${u.bio ? `<p>${esc(u.bio)}</p>` : ''}` : ''}</section>`).join('') : '';
    if (p.company_id) p.company = (await rest(`companies?id=eq.${p.company_id}&select=name,city,country,verified,founded`).catch(() => []))[0] || null;
    const where = [p.city, COUNTRY[p.country] || p.country].filter(Boolean).join(', ');
    const cats = p.categories || [];
    const cat = cats[0];
    // Closest alternatives by shared tags and description (product_alternatives); falls back to any shared tag
    const alts = await rest(`rpc/product_alternatives?pid=${p.id}&lim=6`).catch(() => null)
      || (cats.length ? await rest(`product_feed?status=in.(scheduled,live)&categories=ov.${encodeURIComponent('{' + cats.map(c => '"' + c.replace(/"/g, '') + '"').join(',') + '}')}&id=neq.${p.id}&select=${LIST}&order=upvote_count.desc&limit=6`).catch(() => []) : []);
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
      ...(team.length ? { author: team.map(person) } : {}),
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
        ${teamHtml}${p.company ? `<p>Company: ${esc(p.company.name)}</p>` : ''}
        ${unclaimedBlock(p)}
        ${S.list(alts, `Alternatives to ${p.name}`)}${S.nav()}`
    };
  }
  if (type === 'maker') {
    const [u] = await rest(`profiles?username=eq.${encodeURIComponent(slug)}&banned=eq.false&select=id,username,name,headline,bio,country,city,avatar_url,website,x,linkedin,settings`);
    if (!u) return null;
    const indexable = !u.settings || u.settings.indexable !== false;
    const [own, made] = await Promise.all([rest(`products?owner_id=eq.${u.id}&status=in.(scheduled,live)&select=name,slug,tagline,city,country&limit=20`).catch(() => []),
      rest(`product_makers?user_id=eq.${u.id}&accepted=eq.true&select=product:products(name,slug,tagline,city,country,status)`).catch(() => [])]);
    const prods = own.concat(made.map(m => m.product).filter(x => x && ['scheduled', 'live'].includes(x.status) && !own.some(o => o.slug === x.slug)));
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
  // Discuss: the feed, a community, and public threads (DiscussionForumPosting with nested replies)
  if (type === 'discuss' || type === 'dcomm' || type === 'dthread') {
    const plain = t => esc(String(t || '')).split(/\n{2,}/).map(x => `<p>${x.replace(/\n/g, '<br>')}</p>`).join('');
    const postItem = p => `<li><a href="/d/${esc(p.community.slug)}/${esc(p.slug)}"><strong>${esc(p.title)}</strong></a> — h/${esc(p.community.slug)} · ${p.comment_count} comments · ${p.score} votes</li>`;
    const person = a => a ? { '@type': 'Person', name: a.name || a.username, url: `${SITE}/makers/${a.username}` } : { '@type': 'Person', name: 'deleted' };
    if (type === 'discuss') {
      const rows = await rest(`rpc/d_feed?sort=hot&lim=30`).catch(() => []);
      return { title: 'Discuss: talk about African startups and products | Hentity', desc: 'Ask questions, review products and give makers feedback. Communities for African founders, developers and users, and one for every product on Hentity.',
        path: '/discuss', type: 'website', ld: [crumbs([['Discuss', '/discuss']])],
        main: `<h1>Discuss</h1><p>Talk about African startups and products. Ask, review, give makers feedback.</p>${rows.length ? `<ul>${rows.map(postItem).join('')}</ul>` : ''}` };
    }
    if (type === 'dcomm') {
      const c = await rest(`rpc/d_community?comm=${encodeURIComponent(slug)}`).catch(() => null);
      if (!c) return null;
      const rows = await rest(`rpc/d_feed?sort=new&comm=${encodeURIComponent(c.slug)}&lim=30`).catch(() => []);
      const about = c.kind === 'product' && c.product ? `Official community for ${c.product.name}: feedback, bugs, feature requests and questions, with replies from the makers.` : c.about;
      return { title: `h/${c.slug}: ${c.kind === 'product' ? c.product.name + ' community' : c.title} | Hentity Discuss`, desc: clip(about, 160), path: `/d/${c.slug}`, type: 'website',
        image: c.product && c.product.logo_url, noindex: !rows.length, ld: [crumbs([['Discuss', '/discuss'], ['h/' + c.slug, `/d/${c.slug}`]])],
        main: `<nav aria-label="Breadcrumb"><a href="/discuss">Discuss</a> / h/${esc(c.slug)}</nav><h1>h/${esc(c.slug)}</h1><p>${esc(about)}</p>${c.product ? `<p><a href="/products/${esc(c.product.slug)}">${esc(c.product.name)} on Hentity</a></p>` : ''}${rows.length ? `<ul>${rows.map(postItem).join('')}</ul>` : ''}` };
    }
    const [cs, ps] = String(slug).split('~');
    const T = await rest(`rpc/d_thread?comm=${encodeURIComponent(cs)}&post=${encodeURIComponent(ps || '')}`).catch(() => null);
    if (!T || !T.post) return null;
    const P = T.post, C = T.community, path = `/d/${C.slug}/${P.slug}`;
    const kids = {}; (T.comments || []).forEach(c => { (kids[c.parent_id || 'root'] = kids[c.parent_id || 'root'] || []).push(c); });
    const best = list => (list || []).slice().sort((a, b) => b.score - a.score);
    const ldC = (c, d) => ({ '@type': 'Comment', text: c.deleted ? '[deleted]' : c.body, datePublished: c.created_at, author: person(c.deleted ? null : c.author), upvoteCount: Math.max(0, c.score), url: `${SITE}${path}#c-${c.id}`,
      ...(d < 3 && kids[c.id] ? { comment: best(kids[c.id]).slice(0, 10).map(x => ldC(x, d + 1)) } : {}) });
    const htmlC = (c, d) => `<li id="c-${c.id}"><p><strong>${esc(c.deleted ? 'deleted' : 'u/' + c.author.username)}</strong>${c.author && c.author.tag ? ` (${esc(c.author.tag)})` : ''} · ${c.score} points</p>${c.deleted ? '<p>[deleted]</p>' : plain(c.body)}${d < 4 && kids[c.id] ? `<ul>${best(kids[c.id]).map(x => htmlC(x, d + 1)).join('')}</ul>` : ''}</li>`;
    const top = best(kids.root);
    const thin = !P.comment_count && P.score < 3 && String(P.body || '').length < 40;
    return {
      title: `${P.title} : h/${C.slug} | Hentity`, desc: clip(P.body || `${P.title}. A discussion in h/${C.slug} on Hentity.`, 160), path, type: 'article', published: P.created_at,
      image: (P.images || [])[0] || (P.product && P.product.logo_url), noindex: thin,
      ld: [{ '@context': 'https://schema.org', '@type': 'DiscussionForumPosting', headline: clip(P.title, 110), text: P.body || P.title, url: SITE + path, mainEntityOfPage: SITE + path,
          datePublished: P.created_at, dateModified: P.edited_at || P.last_activity_at || P.created_at, author: person(P.author),
          ...(P.images && P.images.length ? { image: P.images } : {}),
          ...(P.product ? { about: { '@type': 'SoftwareApplication', name: P.product.name, url: `${SITE}/products/${P.product.slug}` } } : {}),
          interactionStatistic: [{ '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: Math.max(0, P.score) },
                                 { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: P.comment_count }],
          isPartOf: { '@type': 'WebPage', name: `h/${C.slug}`, url: `${SITE}/d/${C.slug}` },
          comment: top.slice(0, 20).map(c => ldC(c, 0)) },
        crumbs([['Discuss', '/discuss'], ['h/' + C.slug, `/d/${C.slug}`], [P.title, path]])],
      main: `<nav aria-label="Breadcrumb"><a href="/discuss">Discuss</a> / <a href="/d/${esc(C.slug)}">h/${esc(C.slug)}</a></nav><article><h1>${esc(P.title)}</h1><p>Posted by <a href="/makers/${esc(P.author.username)}">u/${esc(P.author.username)}</a>${P.author.tag ? ` (${esc(P.author.tag)})` : ''} in <a href="/d/${esc(C.slug)}">h/${esc(C.slug)}</a> · ${P.score} votes · ${P.comment_count} comments</p>${plain(P.body)}${P.product ? `<p>About <a href="/products/${esc(P.product.slug)}">${esc(P.product.name)}</a></p>` : ''}</article>
        ${top.length ? `<h2>${P.comment_count} comments</h2><ul>${top.slice(0, 40).map(c => htmlC(c, 0)).join('')}</ul>` : ''}
        ${(T.related || []).length ? `<h2>Related discussions</h2><ul>${T.related.map(r => `<li><a href="/d/${esc(r.community)}/${esc(r.slug)}">${esc(r.title)}</a> — h/${esc(r.community)}</li>`).join('')}</ul>` : ''}`
    };
  }
  // Funding: the public basics of every grant and investor (matching and apply links stay for members)
  if (type === 'funding' || type === 'fopp') {
    const KIND = { grant: 'Grant', prize: 'Prize', competition: 'Competition', vc: 'VC fund', angel: 'Angel network', accelerator: 'Accelerator', micro_vc: 'Micro-VC' };
    const fslug = n => S.slugify(n).slice(0, 70).replace(/-$/, '');
    const fpath = o => `/funding/${fslug(o.name) ? fslug(o.name) + '-' : ''}${o.id}`;
    const today = new Date().toISOString().slice(0, 10);
    const fdate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    const row = o => `<li><a href="${fpath(o)}"><strong>${esc(o.name)}</strong></a>${o.org && o.org !== o.name ? ` (${esc(o.org)})` : ''} — ${esc(KIND[o.kind] || '')}${o.amount_text ? ', ' + esc(o.amount_text) : ''}${o.deadline && o.deadline >= today ? `, deadline ${fdate(o.deadline)}` : ''}${(o.categories || []).length ? ` · ${esc(o.categories.join(', '))}` : ''}</li>`;
    if (type === 'funding') {
      const rows = await rest('funding_opps?active=eq.true&select=id,name,org,kind,mode,amount_text,deadline,categories,countries&order=name').catch(() => []);
      const g = rows.filter(o => o.mode === 'grant'), e = rows.filter(o => o.mode === 'equity');
      const open = g.filter(o => o.deadline && o.deadline >= today).sort((a, b) => a.deadline.localeCompare(b.deadline));
      const lead = `${g.length} grants, prizes and competitions and ${e.length} investors, angel networks and accelerators backing startups in Africa. Hentity matches them to your product’s sector, stage, country and team.`;
      return { title: `Grants and investors for African startups (${new Date().getFullYear()}) | Hentity Funding`, desc: clip(lead, 160), path: '/funding', type: 'website',
        ld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Funding for African startups', description: lead, url: SITE + '/funding',
          mainEntity: { '@type': 'ItemList', numberOfItems: rows.length, itemListElement: rows.slice(0, 200).map((o, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE + fpath(o), name: o.name })) } },
          crumbs([['Funding', '/funding']])],
        main: `<h1>Grants and investors for African startups</h1><p>${esc(lead)}</p>
          ${open.length ? `<h2>Grants closing soon</h2><ul>${open.map(row).join('')}</ul>` : ''}
          <h2>Grants, prizes and competitions (${g.length})</h2><ul>${g.map(row).join('')}</ul>
          <h2>Investors, angel networks and accelerators (${e.length})</h2><ul>${e.map(row).join('')}</ul>
          <p><a href="/signup?next=/funding">Create a free account</a> and list your product to see which ones you qualify for.</p>${S.nav()}` };
    }
    const id = (String(slug).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) || [])[0];
    if (!id) return null;
    const [o] = await rest(`funding_opps?id=eq.${id}&active=eq.true&select=id,mode,kind,name,org,logo_url,amount_text,amount_note,amount_usd,categories,stages,countries,region_label,women_only,needs_incorporation,needs_live,deadline,deadline_note,decision_by,slots_text,round_note,judging,description,checked_at,portfolio,updated_at`);
    if (!o) return null;
    const grant = o.mode === 'grant', kind = KIND[o.kind] || (grant ? 'Grant' : 'Investor');
    const cs = o.countries || [], place = cs.length === 1 ? (COUNTRY[cs[0]] || cs[0]) : 'African';
    const where = o.region_label || (cs.length ? cs.map(c => COUNTRY[c] || c).join(', ') : 'Startups across Africa');
    const open = o.deadline && o.deadline >= today;
    const rules = [['Sector', (o.categories || []).join(', ') || 'Any sector'], ['Stage', (o.stages || []).join(', ') || 'Any stage'], ['Where', where],
      o.women_only && ['Team', 'Women-founded or co-founded'], o.needs_incorporation && ['Company', 'Must be a registered company'], o.needs_live && ['Product', 'Must have a live product']].filter(Boolean);
    const similar = (o.categories || []).length ? await rest(`funding_opps?active=eq.true&mode=eq.${o.mode}&id=neq.${o.id}&categories=ov.${encodeURIComponent('{' + o.categories.map(c => '"' + c.replace(/"/g, '') + '"').join(',') + '}')}&select=id,name,org,kind,amount_text,deadline,categories&limit=8`).catch(() => []) : [];
    const path = fpath(o);
    const desc = clip(`${o.name}${o.org && o.org !== o.name ? ' by ' + o.org : ''}: ${kind.toLowerCase()}${o.amount_text ? ' of ' + o.amount_text : ''} for ${(o.categories || []).length ? o.categories.slice(0, 3).join(', ') + ' ' : ''}startups (${where}).${open ? ' Deadline ' + fdate(o.deadline) + '.' : ''} ${o.description || ''}`, 160);
    const funder = { '@type': 'Organization', name: o.org || o.name, ...(o.logo_url ? { logo: o.logo_url } : {}) };
    const ld = grant
      ? { '@context': 'https://schema.org', '@type': 'MonetaryGrant', name: o.name, description: o.description || desc, url: SITE + path, funder,
          ...(o.amount_usd ? { amount: { '@type': 'MonetaryAmount', currency: 'USD', value: Number(o.amount_usd) } } : {}),
          areaServed: cs.length ? cs.map(c => ({ '@type': 'Country', name: COUNTRY[c] || c })) : { '@type': 'Place', name: 'Africa' } }
      : { '@context': 'https://schema.org', '@type': 'Organization', name: o.name, description: o.description || desc, url: SITE + path, ...(o.logo_url ? { logo: o.logo_url } : {}),
          knowsAbout: o.categories || [], areaServed: cs.length ? cs.map(c => ({ '@type': 'Country', name: COUNTRY[c] || c })) : { '@type': 'Place', name: 'Africa' } };
    return {
      title: `${o.name}: ${kind.toLowerCase()} for ${place} startups | Hentity Funding`, desc, path, image: o.logo_url, type: 'website',
      ld: [ld, crumbs([['Funding', '/funding'], [o.name, path]])],
      main: `<nav aria-label="Breadcrumb"><a href="/">Hentity</a> / <a href="/funding">Funding</a> / ${esc(o.name)}</nav>
        <h1>${esc(o.name)}</h1><p><strong>${esc(o.org && o.org !== o.name ? o.org + ' · ' : '')}${esc(kind)}${o.amount_text ? ' · ' + esc(o.amount_text) : ''}${o.amount_note ? ' (' + esc(o.amount_note) + ')' : ''}</strong></p>
        ${o.description ? `<p>${esc(o.description)}</p>` : ''}
        ${open ? `<p>Deadline: ${fdate(o.deadline)}${o.deadline_note ? ', ' + esc(o.deadline_note) : ''}${o.decision_by ? `. Decision by ${fdate(o.decision_by)}` : ''}.</p>` : o.round_note ? `<p>${esc(o.round_note)}</p>` : ''}
        ${o.slots_text ? `<p>${esc(o.slots_text)}</p>` : ''}
        <h2>Who ${grant ? 'can apply' : 'they back'}</h2><dl>${rules.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        ${(o.judging || []).length ? `<h2>How it’s judged</h2><ul>${o.judging.map(j => `<li>${esc(j.label)}: ${esc(String(j.pct))}%</li>`).join('')}</ul>` : ''}
        ${(o.portfolio || []).length ? `<h2>Portfolio</h2><p>${esc(o.portfolio.join(', '))}</p>` : ''}
        ${o.checked_at ? `<p>Details checked by Hentity on ${fdate(o.checked_at)}.</p>` : ''}
        <p><a href="/signup?next=${encodeURIComponent(path)}">Create a free account</a> to see if your product qualifies, get the application link and deadline reminders.</p>
        ${similar.length ? `<h2>Similar ${grant ? 'grants' : 'investors'}</h2><ul>${similar.map(row).join('')}</ul>` : ''}
        <p><a href="/funding">All grants and investors for African startups</a></p>`
    };
  }
  // Insights: the headline numbers as text, linking to the category and country pages
  if (type === 'insights') {
    const d = await rest('rpc/insights?days=30').catch(() => null);
    if (!d) return null;
    const ind = (d.industries || []).slice(0, 8), ctry = (d.countries || []).slice(0, 8), cities = (d.city_list || []).slice(0, 10);
    const lead = `${d.total} startups and products on Hentity across ${(d.countries || []).length} African countries and ${d.cities} cities. ${ind[0] ? ind[0].name + ' leads with ' + ind[0].n + ' products' : ''}${ctry[0] ? ', and ' + (COUNTRY[ctry[0].cc] || ctry[0].cc) + ' has the most startups (' + ctry[0].n + ')' : ''}. Updated hourly.`;
    const link = (url, t) => url ? `<a href="${url}">${esc(t)}</a>` : esc(t);
    return { title: `The state of African startups: sectors, countries and cities (${new Date().getFullYear()}) | Hentity Insights`, desc: clip(lead, 160), path: '/insights', type: 'website',
      ld: [{ '@context': 'https://schema.org', '@type': 'Dataset', name: 'The state of African startups', description: lead, url: SITE + '/insights', creator: { '@type': 'Organization', name: 'Hentity', url: SITE },
        dateModified: new Date().toISOString(), isAccessibleForFree: true, spatialCoverage: { '@type': 'Place', name: 'Africa' }, keywords: ['African startups', 'startup ecosystem', ...ind.map(x => x.name)],
        license: 'https://creativecommons.org/licenses/by/4.0/', distribution: [{ '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: SITE + '/insights' }] }, crumbs([['Insights', '/insights']])],
      ssr: `<h2>The state of African startups</h2><p>${esc(lead)}</p>
        ${ind.length ? `<h2>Top sectors</h2><ul>${ind.map(x => `<li>${link(S.CAT_BY_SLUG[S.slugify(x.name)] ? S.catUrl(x.name) : null, x.name)}: ${x.n} products</li>`).join('')}</ul>` : ''}
        ${ctry.length ? `<h2>Top countries</h2><ul>${ctry.map(x => `<li>${link(S.countryUrl(x.cc), COUNTRY[x.cc] || x.cc)}: ${x.n} startups</li>`).join('')}</ul>` : ''}
        ${cities.length ? `<h2>Top cities</h2><ul>${cities.map(x => `<li>${esc(x.city)}, ${esc(COUNTRY[x.cc] || x.cc)}: ${x.n}</li>`).join('')}</ul>` : ''}
        ${(d.stages || []).length ? `<h2>By stage</h2><ul>${d.stages.map(x => `<li>${esc(x.stage)}: ${x.n}</li>`).join('')}</ul>` : ''}` };
  }
  // Radar: new startups Hentity found in the news, app stores and registries
  if (type === 'radar') {
    const rows = await rest(`product_feed?status=eq.unclaimed&select=${LIST}&order=created_at.desc&limit=60`).catch(() => []);
    const lead = `New African startups found by Hentity in the news, app stores and company registries${rows.length ? ': ' + rows.slice(0, 4).map(p => p.name).join(', ') + ' and more' : ''}. Follow them, or ask the team to join.`;
    return { title: 'On the radar: new African startups this week | Hentity', desc: clip(lead, 160), path: '/radar', type: 'website',
      ld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'New African startups on the radar', description: lead, url: SITE + '/radar', mainEntity: { '@type': 'ItemList', numberOfItems: rows.length, itemListElement: rows.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/products/${p.slug}`, name: p.name })) } }, crumbs([['Radar', '/radar']])],
      ssr: `<h2>New startups on the radar</h2><p>${esc(lead)}</p>${S.list(rows)}${S.nav()}` };
  }
  if (type === 'beta') {
    const [b] = await rest(`betas?slug=eq.${encodeURIComponent(slug)}&status=in.(open,closed)&select=slug,title,why,spots,accepted_count,perk,airtime_amount,closes_at,product:products(name,slug,logo_url,tagline)`);
    if (!b) return null;
    const p = b.product || {};
    const perk = [b.perk, b.airtime_amount > 0 ? '₦' + Number(b.airtime_amount).toLocaleString('en-US') + ' airtime' : ''].filter(Boolean).join(' + ');
    const left = Math.max(0, b.spots - b.accepted_count);
    return {
      title: `${p.name} beta | Testers wanted | Hentity`, desc: clip(`${b.title}. ${left} spots left${perk ? ' · perk: ' + perk : ''}. ${b.why || ''}`, 200),
      path: `/b/${b.slug}`, image: p.logo_url, type: 'website', noindex: true, ld: [],
      main: `<h1>${esc(b.title)}</h1><p>${esc(p.name)} · ${esc(b.why || '')}</p>`
    };
  }
  // Sector in a country: "Fintech companies in Nigeria"
  if (type === 'catcountry') {
    const [cs, ks] = String(slug).split('~'); const cat = S.CAT_BY_SLUG[cs], cc = S.COUNTRY_BY_SLUG[ks];
    if (!cat || !cc) return null;
    const cname = COUNTRY[cc], noun = S.CAT_NOUN[cat] || cat + ' companies', dem = S.DEMONYM[cc] || cname;
    const [rows, all, funds] = await Promise.all([
      rest(`product_feed?status=in.(scheduled,live,unclaimed)&country=eq.${cc}&categories=cs.${encodeURIComponent('{"' + cat + '"}')}&select=slug,name,tagline,city,country,categories,pay_methods,stage,upvote_count,created_at&order=upvote_count.desc,created_at.desc&limit=300`).catch(() => []),
      rest('product_feed?status=in.(scheduled,live,unclaimed)&select=categories,country&limit=5000').catch(() => []),
      rest(`funding_opps?active=eq.true&categories=cs.${encodeURIComponent('{"' + cat + '"}')}&or=(countries.eq.{},countries.cs.{${cc}})&select=id,name,org,kind,mode,amount_text,deadline&order=deadline.asc.nullslast&limit=12`).catch(() => [])]);
    const n = rows.length, counts = S.comboCounts(all);
    const tally = arr => { const m = {}; arr.forEach(x => x && (m[x] = (m[x] || 0) + 1)); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    const cities = tally(rows.map(p => p.city && p.city.trim())), pays = tally(rows.flatMap(p => p.pay_methods || []));
    const newest = rows.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 5);
    const yr = new Date().getFullYear(), path = S.comboUrl(cat, cc);
    const lead = `${n} ${dem} ${noun.toLowerCase().replace(/^ai /, 'AI ').replace(/^saas /, 'SaaS ')} on Hentity${rows.length ? ', including ' + rows.slice(0, 3).map(p => p.name).join(', ') : ''}. Ranked by the community, with what each does, where it’s based and how it takes payments.`;
    const facts = [cities.length && `Most are based in ${cities.slice(0, 3).map(([c, k]) => `${c} (${k})`).join(', ')}.`,
      pays.length && `The most common ways to pay: ${pays.slice(0, 4).map(([c, k]) => `${c} (${k})`).join(', ')}.`,
      ].filter(Boolean);   // stage left out: many seeded profiles default to "Idea" (Paystack isn't one)
    const fpath = o => `/funding/${S.slugify(o.name).slice(0, 70).replace(/-$/, '')}-${o.id}`;
    const today = new Date().toISOString().slice(0, 10);
    const other = (list, fn) => list.filter(([k, v]) => v >= S.COMBO_MIN).map(fn).filter(Boolean);
    const otherCountries = other(Object.entries(counts).filter(([k]) => k.startsWith(cat + '|') && !k.endsWith('|' + cc)).sort((a, b) => b[1] - a[1]), ([k, v]) => { const c2 = k.split('|')[1]; return `<a href="${S.comboUrl(cat, c2)}">${esc(noun)} in ${esc(COUNTRY[c2])}</a> (${v})`; });
    const otherCats = other(Object.entries(counts).filter(([k]) => k.endsWith('|' + cc) && !k.startsWith(cat + '|')).sort((a, b) => b[1] - a[1]), ([k, v]) => { const c2 = k.split('|')[0]; return `<a href="${S.comboUrl(c2, cc)}">${esc(S.CAT_NOUN[c2] || c2)} in ${esc(cname)}</a> (${v})`; });
    const h1 = `${noun} in ${cname}`;
    const item = p => `<li><a href="/products/${esc(p.slug)}"><strong>${esc(p.name)}</strong></a> — ${esc(S.trimP(p.tagline))}${[p.city, (p.pay_methods || []).slice(0, 3).join(', ')].filter(Boolean).length ? ` <small>(${esc([p.city, (p.pay_methods || []).slice(0, 3).join(', ')].filter(Boolean).join(' · '))})</small>` : ''}</li>`;
    return {
      title: `${h1} (${yr}): ${n} ${dem} ${cat === 'AI' ? 'AI' : cat === 'SaaS' ? 'SaaS' : noun.split(' ')[0].toLowerCase()} startup${n === 1 ? '' : 's'} | Hentity`,
      desc: clip(lead, 160), path, type: 'website', noindex: n < S.COMBO_MIN, h1,
      ld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: h1, description: lead, url: SITE + path, about: [{ '@type': 'Thing', name: cat }, { '@type': 'Country', name: cname }],
        mainEntity: { '@type': 'ItemList', numberOfItems: n, itemListElement: rows.slice(0, 100).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/products/${p.slug}`, name: p.name })) } },
        crumbs([['Products', '/directory'], [cat, S.catUrl(cat)], [cname, path]])],
      ssr: `<h2>${esc(h1)}</h2><p>${esc(lead)}</p>${facts.length ? `<p>${esc(facts.join(' '))}</p>` : ''}
        ${n ? `<h2>${n === 1 ? 'The' : 'All ' + n} ${esc(noun.toLowerCase())} in ${esc(cname)}</h2><ol>${rows.map(item).join('')}</ol>` : ''}
        ${newest.length > 2 ? `<h2>Newest ${esc(noun.toLowerCase())} in ${esc(cname)}</h2><ul>${newest.map(p => `<li><a href="/products/${esc(p.slug)}">${esc(p.name)}</a> — ${esc(S.trimP(p.tagline))}</li>`).join('')}</ul>` : ''}
        ${funds.length ? `<h2>Funding for ${esc(cat === 'Fintech' ? 'fintech' : cat)} startups in ${esc(cname)}</h2><ul>${funds.map(o => `<li><a href="${fpath(o)}">${esc(o.name)}</a>${o.org && o.org !== o.name ? ` (${esc(o.org)})` : ''}${o.amount_text ? ' — ' + esc(o.amount_text) : ''}${o.deadline && o.deadline >= today ? ', deadline ' + esc(o.deadline) : ''}</li>`).join('')}</ul><p><a href="/funding">All grants and investors for African startups</a></p>` : ''}
        ${otherCountries.length ? `<h2>${esc(noun)} in other countries</h2><p>${otherCountries.join(' · ')}</p>` : ''}
        ${otherCats.length ? `<h2>Other startups in ${esc(cname)}</h2><p>${otherCats.join(' · ')}</p>` : ''}
        <p><a href="${S.catUrl(cat)}">All ${esc(cat)} across Africa</a> · <a href="${S.countryUrl(cc)}">All startups in ${esc(cname)}</a></p>`
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
    // Links to the sector-in-country pages that have enough companies
    const counts = cat || cc ? S.comboCounts(await rest('product_feed?status=in.(scheduled,live,unclaimed)&select=categories,country&limit=5000').catch(() => [])) : {};
    const pairs = Object.entries(counts).filter(([k, v]) => v >= S.COMBO_MIN && (cat ? k.startsWith(cat + '|') : k.endsWith('|' + cc))).sort((a, b) => b[1] - a[1]);
    const combos = pairs.length ? `<h2>${cat ? esc(S.CAT_NOUN[cat] || cat) + ' by country' : 'Startups in ' + esc(COUNTRY[cc]) + ' by sector'}</h2><p>${pairs.map(([k, v]) => { const [c2, k2] = k.split('|'); return `<a href="${S.comboUrl(c2, k2)}">${esc(S.CAT_NOUN[c2] || c2)} in ${esc(COUNTRY[k2])}</a> (${v})`; }).join(' · ')}</p>` : '';
    return {
      title, desc: clip(lead, 160), path, type: 'website', noindex: !rows.length && type !== 'directory', h1,
      ld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: h1, description: lead, url: SITE + path, mainEntity: { '@type': 'ItemList', numberOfItems: rows.length, itemListElement: rows.slice(0, 100).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/products/${p.slug}`, name: p.name })) } },
        crumbs([['Products', '/directory'], ...(cat || cc ? [[cat || cname, path]] : [])])],
      ssr: `<h2>${esc(h1)}</h2><p>${esc(lead)}</p>${combos}${S.list(rows)}${S.nav()}`
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
  return page.replace(/(<meta charset="utf-8">)/i, m => `${m}\n<script>window.__PRELOAD__=${json}</script>`);
}

let warm = false;  // false only on the first request after a cold start
module.exports = async (req, res) => {
  const t0 = Date.now(), cold = !warm; warm = true;
  // Server-Timing is visible in the browser's performance data (and in the perf beacons)
  const end = res.end.bind(res);
  res.end = body => { try { res.setHeader('Server-Timing', `ssr;dur=${Date.now() - t0}${cold ? ', cold;dur=0' : ''}`); } catch (e) {} return end(body); };
  const { type } = req.query;
  const slug = req.query.post ? `${req.query.slug}~${req.query.post}` : req.query.slug;
  const tpl = { product: '/product', maker: '/maker', article: '/article', home: '/home', news: '/news-index', beta: '/beta-apply', discuss: '/discuss-index', dcomm: '/discuss-index', dthread: '/discuss-index', category: '/directory-index', catcountry: '/directory-index', country: '/directory-index', directory: '/directory-index', funding: '/funding-index', fopp: '/funding-opp', insights: '/insights-index', radar: '/radar-index' }[type];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  let page;
  try { page = template(tpl || '/404'); }
  catch (e) {
    // Fallback: fetch the static template from this deployment
    try { const r = await fetch(`${proto}://${host}${tpl || '/404'}`, { headers: { 'x-ssr': '1' } }); page = await r.text(); }
    catch (e2) { res.statusCode = 502; return res.end('Template unavailable'); }
  }
  const key = ['discuss', 'funding', 'insights', 'radar'].includes(type) ? type : slug ? String(slug).toLowerCase() : '';
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
    if (extra) page = page.replace(/(<\/main>)/, m => S.block(extra) + m);
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
    .replace('</head>', () => tags + '\n</head>')
    ;
  // Real, crawlable content in the page itself (search engines and AI crawlers that don't run JavaScript read it;
  // the app replaces it as soon as it renders)
  if (meta.main) page = page.replace(/(<main\b[^>]*>)[\s\S]*?(<\/main>)/, (m, a, b) => type === 'article' ? m.replace(a, () => a + S.block(meta.main)) : a + S.block(meta.main) + b);
  if (meta.ssr) page = page.replace(/(<\/main>)/, m => S.block(meta.ssr) + m);
  if (meta.h1) page = page.replace(/(<h1\b[^>]*id="title"[^>]*>)[^<]*/, (m, a) => a + esc(meta.h1) + ' ');
  res.setHeader('Cache-Control', CACHE);
  res.end(withPreload(page, data));
};
