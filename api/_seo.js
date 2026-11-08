// Shared SEO helpers: category and country landing pages, and the server-rendered HTML that search engines
// (and AI crawlers that don't run JavaScript) read before the page hydrates.
const SITE = 'https://hentity.com';
const CATEGORIES = ['Fintech', 'SaaS', 'Apps', 'AI', 'Commerce', 'Productivity', 'Dev Tools', 'Health', 'Education', 'Agriculture', 'Logistics', 'Infrastructure', 'Energy & Climate', 'Proptech'];
const COUNTRY = { NG: 'Nigeria', KE: 'Kenya', GH: 'Ghana', ZA: 'South Africa', RW: 'Rwanda', EG: 'Egypt', MA: 'Morocco', SN: 'Senegal', ET: 'Ethiopia', UG: 'Uganda', TZ: 'Tanzania', CI: 'Côte d’Ivoire', CM: 'Cameroon', TN: 'Tunisia' };
const slugify = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const CAT_BY_SLUG = Object.fromEntries(CATEGORIES.map(c => [slugify(c), c]));
const COUNTRY_BY_SLUG = Object.fromEntries(Object.entries(COUNTRY).map(([k, v]) => [slugify(v), k]));
const catUrl = c => `/categories/${slugify(c)}`;
const countryUrl = cc => COUNTRY[cc] ? `/countries/${slugify(COUNTRY[cc])}` : null;

// schema.org applicationCategory values Google understands
const APP_CAT = { Fintech: 'FinanceApplication', Commerce: 'ShoppingApplication', Health: 'HealthApplication', Education: 'EducationalApplication', 'Dev Tools': 'DeveloperApplication', Productivity: 'BusinessApplication', SaaS: 'BusinessApplication', Logistics: 'BusinessApplication', Agriculture: 'BusinessApplication', Infrastructure: 'BusinessApplication', AI: 'BusinessApplication', Apps: 'UtilitiesApplication', 'Energy & Climate': 'BusinessApplication', Proptech: 'LifestyleApplication' };
const appCategory = cats => APP_CAT[(cats || [])[0]] || 'BusinessApplication';

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const trimP = s => String(s || '').trim().replace(/[.\s]+$/, '');

// One product as a crawlable list item
const item = p => `<li><a href="/products/${esc(p.slug)}"><strong>${esc(p.name)}</strong></a> — ${esc(trimP(p.tagline))}${p.city || p.country ? ` <small>(${esc([p.city, COUNTRY[p.country] || p.country].filter(Boolean).join(', '))})</small>` : ''}</li>`;
const list = (rows, heading) => rows && rows.length ? `${heading ? `<h2>${esc(heading)}</h2>` : ''}<ul>${rows.map(item).join('')}</ul>` : '';
const nav = () => `<nav aria-label="Browse"><p><strong>Browse by category:</strong> ${CATEGORIES.map(c => `<a href="${catUrl(c)}">${esc(c)}</a>`).join(' · ')}</p><p><strong>Browse by country:</strong> ${['NG', 'KE', 'GH', 'ZA', 'RW', 'EG', 'MA', 'UG', 'TZ', 'SN', 'ET', 'CI'].map(cc => `<a href="${countryUrl(cc)}">${esc(COUNTRY[cc])}</a>`).join(' · ')}</p></nav>`;
// Wrapper: visible until the app hydrates, then removed (same content, so it's not cloaking)
const block = inner => `<div class="ssr" data-ssr>${inner}</div>`;

// Sector + country landing pages (/categories/fintech/nigeria): how people actually search
const CAT_NOUN = { Fintech: 'Fintech companies', SaaS: 'SaaS companies', Apps: 'Consumer apps', AI: 'AI startups', Commerce: 'E-commerce companies', Productivity: 'Productivity tools', 'Dev Tools': 'Developer tools', Health: 'Healthtech companies', Education: 'Edtech companies', Agriculture: 'Agritech companies', Logistics: 'Logistics startups', Infrastructure: 'Infrastructure startups', 'Energy & Climate': 'Climate tech companies', Proptech: 'Proptech companies' };
const DEMONYM = { NG: 'Nigerian', KE: 'Kenyan', GH: 'Ghanaian', ZA: 'South African', RW: 'Rwandan', EG: 'Egyptian', MA: 'Moroccan', SN: 'Senegalese', ET: 'Ethiopian', UG: 'Ugandan', TZ: 'Tanzanian', CI: 'Ivorian', CM: 'Cameroonian', TN: 'Tunisian' };
const comboUrl = (c, cc) => COUNTRY[cc] ? `/categories/${slugify(c)}/${slugify(COUNTRY[cc])}` : null;
const COMBO_MIN = 3;   // fewer companies than this: the page exists but stays out of search (thin)
// Count products per sector+country, from rows with { categories, country }
const comboCounts = rows => { const m = {}; (rows || []).forEach(p => (p.categories || []).forEach(c => { if (CAT_BY_SLUG[slugify(c)] && COUNTRY[p.country]) { const k = c + '|' + p.country; m[k] = (m[k] || 0) + 1; } })); return m; };
module.exports = { CAT_NOUN, DEMONYM, comboUrl, COMBO_MIN, comboCounts, SITE, CATEGORIES, COUNTRY, slugify, CAT_BY_SLUG, COUNTRY_BY_SLUG, catUrl, countryUrl, appCategory, esc, trimP, item, list, nav, block };
