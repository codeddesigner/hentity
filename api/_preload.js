// Builds window.__PRELOAD__ for server-rendered pages: the public data each page asks for first, fetched here
// in London next to the database, keyed exactly like the calls in src/assets/api.js so the browser can skip
// those round trips. Member-specific data (votes, saves, follows) is never preloaded.
const SB = 'https://sislzikhjapilksictxd.supabase.co';
const KEY = 'sb_publishable_49iWYS0Wr9kVY_PfDQphww_jj9dRaBz';
const { PRODUCT_COLS } = require('./_cols.json');   // written by build.py from src/assets/api.js

const MAKERS = 'role,accepted,user:profiles!product_makers_user_id_fkey(id,username,name,avatar_url,avatar_color,city,country,headline)';
const COMMENTS = 'id,body,created_at,parent_id,deleted,user:profiles!comments_user_id_fkey(id,username,name,avatar_url,avatar_color)';
const RECENT = 'created_at,product:products(name),article:articles(title),user:profiles!comments_user_id_fkey(name,city,username,avatar_url,avatar_color)';
const PROFILE_PUBLIC = 'id,username,name,headline,bio,country,city,website,x,linkedin,avatar_url,avatar_color,role,is_verified,banned,is_seed,settings,interests,deletion_requested_at,username_changed_at,created_at';
const PROFILE_SHORT = 'id,username,name,avatar_url,avatar_color,city,country,headline,is_verified';

async function get(path) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: KEY, Accept: 'application/json' } });
  if (!r.ok) throw new Error(`preload ${r.status} ${path.split('?')[0]}`);
  return r.json();
}
async function rpc(name) {
  const r = await fetch(`${SB}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: '{}' });
  if (!r.ok) throw new Error(`preload rpc ${r.status}`);
  return r.json();
}
const sel = s => 'select=' + encodeURIComponent(s);
const one = rows => (rows && rows[0]) || null;
const settle = async (out, key, promise) => { try { const v = await promise; if (v !== undefined) out[key] = v; } catch (e) { /* the page fetches it itself */ } };

async function currentWeek() {
  const now = new Date().toISOString();
  return one(await get(`weeks?${sel('*')}&starts_at=lte.${now}&ends_at=gt.${now}`));
}
const boardRows = week => get(`product_feed?${sel(PRODUCT_COLS)}&week_id=eq.${week}&effective_status=eq.live&order=upvote_count.desc&limit=60`);

async function home() {
  const out = {};
  const week = await currentWeek().catch(() => null);
  if (!week) return out;
  out.week = week;
  await Promise.all([
    settle(out, `board:${week.id}:all::60`, boardRows(week.id)),
    settle(out, 'upcoming', get(`product_feed?${sel(PRODUCT_COLS)}&status=eq.scheduled&effective_status=neq.live&order=launch_date.asc,verified.desc&limit=20`)),
    settle(out, 'today', get(`product_feed?select=id&launch_date=eq.${new Date(Date.now() + 3600e3).toISOString().slice(0, 10)}&status=in.(scheduled,live)`).then(r => (r || []).length)),
    settle(out, 'recent', get(`comments?${sel(RECENT)}&deleted=eq.false&order=created_at.desc&limit=5`))
  ]);
  return out;
}

async function product(slug) {
  const out = {};
  const p = one(await get(`product_feed?${sel(PRODUCT_COLS + ',intro,review_note,review_items,verify,support_pledge,reviewed_at')}&slug=eq.${encodeURIComponent(slug)}&status=in.(scheduled,live)`));
  if (!p) return out;
  out['product:' + slug] = p;
  const cats = (p.categories || []).map(c => `"${String(c).replace(/"/g, '')}"`).join(',');
  await Promise.all([
    settle(out, 'makers:' + p.id, get(`product_makers?${sel(MAKERS)}&product_id=eq.${p.id}`)),
    p.company_id ? settle(out, 'company:' + p.company_id, get(`companies?${sel('*')}&id=eq.${p.company_id}`).then(one)) : null,
    settle(out, 'comments:p:' + p.id, get(`comments?${sel(COMMENTS)}&product_id=eq.${p.id}&order=created_at`)),
    settle(out, 'alts:' + p.id, get(`product_feed?${sel('id,slug,name,tagline,color,country,logo_url')}&status=in.(scheduled,live)&categories=ov.${encodeURIComponent('{' + cats + '}')}&id=neq.${p.id}&limit=3`)),
    p.owner_id ? settle(out, 'profiles:' + p.owner_id, get(`profiles?${sel(PROFILE_SHORT)}&id=in.(${p.owner_id})`)) : null,
    p.week_id && p.effective_status === 'live' ? settle(out, `board:${p.week_id}:all::60`, boardRows(p.week_id)) : null,
    settle(out, 'week', currentWeek())
  ]);
  return out;
}

async function article(slug) {
  const out = {};
  const a = one(await get(`articles?${sel('*')}&slug=eq.${encodeURIComponent(slug)}&status=eq.published`));
  if (!a) return out;
  out['article:' + slug] = a;
  const ids = a.product_ids || [];
  await Promise.all([
    settle(out, `articles:${a.topic}:5`, get(`articles?${sel('*')}&status=eq.published&topic=eq.${encodeURIComponent(a.topic)}&order=is_lead.desc,published_at.desc&limit=5`)),
    settle(out, 'comments:a:' + a.id, get(`comments?${sel(COMMENTS)}&article_id=eq.${a.id}&order=created_at`)),
    ids.length ? settle(out, 'products:' + ids.join(','), get(`product_feed?${sel(PRODUCT_COLS)}&id=in.(${ids.join(',')})`)) : null
  ]);
  return out;
}

async function news() {
  const out = {};
  await Promise.all([
    settle(out, 'articles:All:30', get(`articles?${sel('*')}&status=eq.published&order=is_lead.desc,published_at.desc&limit=30`)),
    settle(out, 'settings:morning_brief', get(`site_settings?${sel('value')}&key=eq.morning_brief`).then(r => one(r) ? one(r).value : null))
  ]);
  return out;
}

async function maker(username) {
  const out = {};
  const u = one(await get(`profiles?${sel(PROFILE_PUBLIC)}&username=eq.${encodeURIComponent(username)}`));
  if (u) out['maker:' + username] = u;
  return out;
}

module.exports = { home, product, article, news, maker };
