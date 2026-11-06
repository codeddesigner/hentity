// /api/health — runs the site's main read queries against the live database and reports any that fail.
// Read-only, public data only; useful after schema changes (e.g. an ambiguous embed returns HTTP 300).
const SB = 'https://sislzikhjapilksictxd.supabase.co';
const KEY = 'sb_publishable_49iWYS0Wr9kVY_PfDQphww_jj9dRaBz';
const PRODUCT_COLS = 'id,slug,name,tagline,description,website,color,logo_url,media,video_url,categories,country,city,countries,pay_methods,currencies,languages,platforms,stage,status,effective_status,week_id,featured,promoted,verified,upvote_count,comment_count,follower_count,click_count,view_count,owner_id,company_id,created_at,submitted_at,week_starts_at,week_ends_at';
const Q = {
  board: ['product_feed', PRODUCT_COLS, 'status=in.(scheduled,live)&limit=3'],
  weeks: ['weeks', '*', 'limit=1'],
  makers: ['product_makers', 'role,accepted,user:profiles!product_makers_user_id_fkey(id,username,name,avatar_url,avatar_color,city,country,headline)', 'limit=3'],
  comments: ['comments', 'id,body,created_at,parent_id,deleted,user:profiles!comments_user_id_fkey(id,username,name,avatar_url,avatar_color)', 'limit=3'],
  live_comments: ['comments', 'created_at,product:products(name),article:articles(title),user:profiles!comments_user_id_fkey(name,city,username,avatar_url,avatar_color)', 'limit=3'],
  channels: ['channels', 'id,slug,name,description,kind,product_id,pinned,pinned_link,rules,archived,position,product:products(slug,name,color,logo_url,verified,upvote_count,tagline)', 'limit=3'],
  channel_members: ['channel_members', 'user_id,last_read_at,user:profiles!channel_members_user_id_fkey(id,name,username,avatar_url,avatar_color)', 'limit=3'],
  messages: ['messages', '*,user:profiles!messages_user_id_fkey(id,name,username,avatar_url,avatar_color,is_verified),product:products(id,slug,name,tagline,color,logo_url,verified,upvote_count),reactions(emoji,user_id)', 'limit=3'],
  last_messages: ['messages', 'channel_id,body,kind,created_at,user:profiles!messages_user_id_fkey(name)', 'limit=3'],
  thread_users: ['messages', 'parent_id,user:profiles!messages_user_id_fkey(id,name,username,avatar_url,avatar_color)', 'limit=3'],
  articles: ['articles', '*', 'limit=1'],
  profiles: ['profiles', 'id,username,name,avatar_url,avatar_color,city,country,headline,is_verified', 'limit=1'],
  settings: ['site_settings', 'value', 'key=eq.stats']
};
module.exports = async (req, res) => {
  const out = {}; let ok = true;
  await Promise.all(Object.entries(Q).map(async ([name, [table, select, extra]]) => {
    const t = Date.now();
    try {
      const r = await fetch(`${SB}/rest/v1/${table}?select=${encodeURIComponent(select)}&${extra}`, { headers: { apikey: KEY } });
      const body = r.ok ? null : (await r.text()).slice(0, 300);
      out[name] = { status: r.status, ms: Date.now() - t, ...(body ? { error: body } : {}) };
      if (!r.ok) ok = false;
    } catch (e) { out[name] = { status: 0, error: String(e) }; ok = false; }
  }));
  res.statusCode = ok ? 200 : 500;
  res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ ok, checks: out }, null, 2));
};
