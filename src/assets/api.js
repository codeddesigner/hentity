/* Hentity data layer: Supabase client, session/profile, and every query the product uses. */
(function () {
  'use strict';
  const SUPABASE_URL = 'https://sislzikhjapilksictxd.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_49iWYS0Wr9kVY_PfDQphww_jj9dRaBz';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    // Per-tab lock instead of the browser-wide one. With the shared lock, a single stuck tab (for example one
    // still running an older version of this file) blocks every hentity.com tab, so signed-in pages never load.
    // Reproduced with auth-js 2.65.0 (the version supabase-js 2.45.4 ships); auth-js still serialises work
    // within each tab, and Supabase tolerates two tabs refreshing the same token.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', lock: (name, acquireTimeout, fn) => fn() },
    realtime: { params: { eventsPerSecond: 5 } }
  });

  // Server-rendered pages (api/ssr.js) embed the public data they need as window.__PRELOAD__, keyed like
  // the calls below. Each entry is used once, then the normal network path takes over (filters, refreshes).
  // After this member changes something (comment, vote, follow...), skip preloads for a minute so a cached
  // page can never hide their own change.
  let freshAt = 0; try { freshAt = +sessionStorage.getItem('hentity.fresh') || 0; } catch (e) {}
  const PRE = Date.now() - freshAt < 60000 ? {} : (window.__PRELOAD__ || {});
  let weekReq = null;
  const touched = () => { try { sessionStorage.setItem('hentity.fresh', String(Date.now())); } catch (e) {} };
  const pre = (key, fetcher) => { if (Object.prototype.hasOwnProperty.call(PRE, key)) { const v = PRE[key]; delete PRE[key]; return Promise.resolve(v); } return fetcher(); };

  const PROFILE_KEY = 'hentity.profile.cache';
  let session = null, profile = null;
  try { profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch (e) {}
  const listeners = new Set();

  async function loadProfile() {
    if (!session) { profile = null; try { localStorage.removeItem(PROFILE_KEY); } catch (e) {} return null; }
    const { data } = await sb.rpc('my_profile');
    profile = (data && data[0]) || null;
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (e) {}
    return profile;
  }
  // Pages render as soon as the session is known. If this browser already has the signed-in member's
  // profile cached, use it straight away and refresh it in the background instead of waiting on the network.
  // Feature switches (Admin -> Features). Missing key = on. The cached copy renders the shell instantly;
  // the fresh copy arrives a moment later and redraws the shell if anything changed.
  const FEAT_KEY = 'hentity.features';
  let features = {}, featCached = false;
  try { const c = localStorage.getItem(FEAT_KEY); if (c) { features = JSON.parse(c) || {}; featCached = true; } } catch (e) {}
  const featuresReady = (async () => {
    try {
      const { data } = await sb.from('site_settings').select('value').eq('key', 'features').maybeSingle();
      const f = (data && data.value) || {}; const changed = JSON.stringify(f) !== JSON.stringify(features);
      features = f; try { localStorage.setItem(FEAT_KEY, JSON.stringify(f)); } catch (e) {}
      if (changed && window.H && H.renderShell) setTimeout(() => H.renderShell(), 0);
    } catch (e) {}
    return features;
  })();
  // Which feature each page belongs to. A page whose feature is off shows a notice instead (admins still see it).
  const PAGE_FEATURE = [[/^\/insights/, 'insights', 'Insights'], [/^\/validate/, 'validate', 'Validate an idea'], [/^\/find/, 'find', 'Find'], [/^\/chats/, 'chats', 'Chats'], [/^\/news/, 'news', 'News'],
    [/^\/(studio|betas|beta-)/, 'studio', 'Beta tests'], [/^\/submit/, 'submissions', 'Submitting products'], [/^\/claim/, 'claims', 'Claiming profiles'], [/^\/radar/, 'radar', 'On the radar'], [/^\/resources/, 'resources', 'Resources'], [/^\/data-room/, 'dataroom', 'Data room']];
  // A feature is 'on' (missing key or true), 'off' (false) or 'soon' (shown as Coming soon, unusable)
  const stateOf = k => features[k] === false ? 'off' : features[k] === 'soon' ? 'soon' : 'on';
  function gate(r) {
    const hit = PAGE_FEATURE.find(([re]) => re.test(location.pathname));
    const st = hit ? stateOf(hit[1]) : 'on';
    if (st === 'on') return r;
    const admin = r.profile && ['admin', 'moderator'].includes(r.profile.role);
    const show = () => {
      if (admin) { const b = document.createElement('div'); b.className = 'feat-off-bar'; b.innerHTML = st === 'soon' ? `${hit[2]} shows as Coming soon to everyone else. You can use it because you’re an admin. <a href="/admin#features">Change</a>` : `${hit[2]} is turned off for everyone else. You can see it because you’re an admin. <a href="/admin#features">Turn it back on</a>`; document.body.prepend(b); return; }
      const m = document.querySelector('#main') || document.querySelector('main');
      if (m) m.innerHTML = st === 'soon' ? `<div class="feat-off"><span class="soon">Coming soon</span><h1 class="t-h3">${hit[2]}</h1></div>` : `<div class="feat-off"><h1 class="t-h3">${hit[2]} is off right now</h1><p class="t-body-sm c-2">We’ve paused this part of Hentity for a while. Everything else works as usual.</p><a class="btn btn--secondary btn--sm" href="/">Back to Hentity</a></div>`;
      window.H && H.contentShown && H.contentShown();
    };
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', show) : show();
    return admin ? r : new Promise(() => {});
  }
  const core = (async () => {
    const { data } = await sb.auth.getSession();
    session = data.session;
    if (!session) { profile = null; try { localStorage.removeItem(PROFILE_KEY); } catch (e) {} }
    else if (profile && profile.id === session.user.id) {
      loadProfile().then(p => listeners.forEach(fn => fn('PROFILE_REFRESHED', session, p))).catch(() => {});
    }
    else await loadProfile();
    try { performance.mark('hentity:ready'); } catch (e) {}
    return { session, profile };
  })();
  const ready = Promise.all([core, featCached ? Promise.race([featuresReady, new Promise(r => setTimeout(r, 1500))]) : featuresReady]).then(([r]) => gate(r));
  // Supabase runs this callback while holding its auth lock. Awaiting another Supabase call in here
  // deadlocks every later request (pages hang while signed in), so the follow-up work is deferred
  // until the callback has returned — the pattern Supabase's docs prescribe.
  sb.auth.onAuthStateChange((event, s) => {
    const changed = (s && s.user && s.user.id) !== (session && session.user && session.user.id);
    session = s;
    setTimeout(async () => {
      if (changed || event === 'USER_UPDATED') { try { await loadProfile(); } catch (e) {} }
      listeners.forEach(fn => fn(event, session, profile));
    }, 0);
  });

  function err(e) { if (e) { const m = e.message || String(e); const x = new Error({ WEEK_FULL: 'WEEK_FULL', DAY_FULL: 'DAY_FULL', DAY_PAST: 'Pick a launch day from tomorrow onwards', DAY_TOO_OLD: 'Pick a launch day from 1950 onwards', DAY_TOO_FAR: 'Launch days open up to 5 weeks ahead' }[m] || m); x.code = e.code; throw x; } }
  async function q(promise) { const { data, error, count } = await promise; err(error); return count !== undefined && count !== null && data === null ? count : data; }
  const uid = () => session && session.user.id;
  function requireAuth(next) {
    if (!uid()) { location.href = '/signin?next=' + encodeURIComponent(next || location.pathname + location.search); throw new Error('AUTH_REQUIRED'); }
  }

  const PROFILE_PUBLIC = 'id,username,name,headline,bio,country,city,website,x,linkedin,avatar_url,avatar_color,role,is_verified,banned,is_seed,settings,interests,deletion_requested_at,username_changed_at,created_at';
  const BETA_COLS = 'id,product_id,owner_id,title,why,steps,countries,platforms,requirements,questions,spots,closes_at,test_start,test_end,time_needed,access_methods,nda,perk_type,perk,airtime_amount,funding,nudged_at,status,slug,form,agreement,access,settings,opens,signed_count,completed_at,room_id,applied_count,accepted_count,feedback_count,created_at,product:products(id,slug,name,tagline,color,logo_url,verified,week_id,status,upvote_count),owner:profiles!betas_owner_id_fkey(id,name,username,avatar_url,avatar_color)';
  const PRODUCT_COLS = 'id,slug,name,tagline,description,website,color,logo_url,media,video_url,categories,country,city,countries,pay_methods,currencies,languages,platforms,stage,status,effective_status,week_id,featured,promoted,verified,upvote_count,comment_count,follower_count,click_count,view_count,owner_id,company_id,created_at,submitted_at,week_starts_at,week_ends_at,launch_date,testers_wanted,active,inactive_note';

  // ---------------------------------------------------------------- Product analytics events
  // A random id for this browser (no name, no account), events batched and sent to /api/t, which adds
  // city, country and device. Kinds: seen (shown in a list), view (opened the page), click (a button).
  const TQ = []; let tTimer = null;
  function visitorId() {
    try { let v = localStorage.getItem('h.vid'); if (!v) { v = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('h.vid', v); } return v; }
    catch (e) { return 'tmp' + Math.random().toString(36).slice(2, 14); }
  }
  function flushTrack() {
    if (!TQ.length || location.protocol !== 'https:') { TQ.length = 0; return; }
    const e = TQ.splice(0, 60), body = JSON.stringify({ e, a: session && session.access_token || undefined });
    try { fetch('/api/t', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body }).catch(() => {}); } catch (err) {}
    if (TQ.length) flushTrack();
  }
  function track(k, pid, extra) {
    if (!pid) return;
    TQ.push(Object.assign({ k, p: pid, v: visitorId() }, extra || {}));
    clearTimeout(tTimer); tTimer = setTimeout(flushTrack, TQ.length > 40 ? 0 : 1500);
  }
  addEventListener('pagehide', flushTrack);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushTrack(); });

  const API = {
    sb, ready, url: SUPABASE_URL,
    get session() { return session; }, get profile() { return profile; }, get uid() { return uid(); },
    get isAdmin() { return !!profile && ['admin', 'moderator'].includes(profile.role); },
    get features() { return features; }, on: k => stateOf(k) === 'on', state: stateOf, featuresReady,
    onAuth(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    requireAuth,
    refreshProfile: loadProfile,

    // ---------------- auth
    auth: {
      // Passwordless: a 6-digit code is emailed; create=true also registers the account.
      async sendCode(email, opts) {
        opts = opts || {};
        const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: !!opts.create, data: opts.create ? Object.assign({ name: opts.name, username: opts.username }, opts.via ? { via: opts.via } : {}) : undefined, emailRedirectTo: location.origin + (opts.next || '/') } });
        err(error);
      },
      async verifyCode(email, token) { const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' }); err(error); await loadProfile(); },
      // Email change by code: one code goes to the new address (and, with "Secure email change" on, one to the current address too).
      async verifyEmailChange(email, token) { const { error } = await sb.auth.verifyOtp({ email, token, type: 'email_change' }); err(error); const { data } = await sb.auth.refreshSession(); await loadProfile(); return data && data.user || (await sb.auth.getUser()).data.user; },
      async changeEmail(email) { const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: location.origin + '/settings/account' }); err(error); },
      async signOut(scope) { await sb.auth.signOut(scope ? { scope } : undefined); profile = null; try { localStorage.removeItem(PROFILE_KEY); } catch (e) {} },
    },

    // ---------------- profiles
    async updateProfile(patch) { err((await sb.from('profiles').update(patch).eq('id', uid())).error); const r = await loadProfile(); try { localStorage.setItem(PROFILE_KEY, JSON.stringify(r)); } catch (e) {} return r; },
    async usernameAvailable(u) { const { data } = await sb.from('profiles').select('id').eq('username', u).maybeSingle(); return !data || data.id === uid(); },
    workEmailOk: async e => { const { data, error } = await sb.rpc('work_email_ok', { e }); err(error); return !!data; },
    profileByUsername: u => pre('maker:' + u, () => q(sb.from('profiles').select(PROFILE_PUBLIC).eq('username', u).maybeSingle())),
    profilesByIds: ids => ids.length ? pre('profiles:' + ids.join(','), () => q(sb.from('profiles').select('id,username,name,avatar_url,avatar_color,city,country,headline,bio,is_verified').in('id', ids))) : Promise.resolve([]),
    searchProfiles: (term) => q(sb.from('profiles').select('id,username,name,avatar_url,avatar_color,city,country').or(`username.ilike.%${term}%,name.ilike.%${term}%`).limit(8)),

    // ---------------- weeks & board
    weekSlots: () => pre('slots', () => q(sb.rpc('week_slots'))),
    // The live week only changes on Monday 06:00 WAT, so keep it until it ends instead of asking on every page.
    async currentWeek() {
      if (PRE.week) { const w = PRE.week; delete PRE.week; try { localStorage.setItem('hentity.week', JSON.stringify(w)); } catch (e) {} return w; }
      try { const c = JSON.parse(localStorage.getItem('hentity.week') || 'null'); if (c && new Date(c.starts_at) <= new Date() && new Date(c.ends_at) > new Date()) return c; } catch (e) {}
      // share one request between callers that ask at the same time
      return weekReq || (weekReq = (async () => {
        const now = new Date().toISOString(); const r = await q(sb.from('weeks').select('*').lte('starts_at', now).gt('ends_at', now).maybeSingle());
        try { if (r) localStorage.setItem('hentity.week', JSON.stringify(r)); } catch (e) {}
        return r;
      })().finally(() => setTimeout(() => { weekReq = null; }, 0)));
    },
    weeks: () => q(sb.from('weeks').select('*').order('id')),
    async board({ week, country, pay, limit } = {}) {
      const key = `board:${week}:${country || 'all'}:${pay || ''}:${limit || 60}`; if (Object.prototype.hasOwnProperty.call(PRE, key)) return pre(key);
      if (!week) return [];   // no launch week (e.g. listed by an admin): nothing to rank against
      let s = sb.from('product_feed').select(PRODUCT_COLS).eq('week_id', week).eq('effective_status', 'live');   // a product appears from 06:00 WAT on its launch day
      if (country && country !== 'all') s = s.eq('country', country);
      if (pay) s = s.contains('pay_methods', [pay]);
      const rows = await q(s.order('upvote_count', { ascending: false }).limit(limit || 60));
      return rows;
    },
    // A launch day before the day it was submitted = already launched: Directory only, not the board
    isBackdated: p => !!(p && p.launch_date && p.submitted_at && p.launch_date < new Date(new Date(p.submitted_at).getTime() + 3600e3).toISOString().slice(0, 10)),
    // Startups listed with a past launch day (or as a plain listing) show on the front page for 30 minutes after approval
    justListed: () => { const today = new Date(Date.now() + 3600e3).toISOString().slice(0, 10), since = new Date(Date.now() - 30 * 60e3).toISOString();
      return q(sb.from('product_feed').select(PRODUCT_COLS + ',reviewed_at').in('status', ['scheduled', 'live']).gte('reviewed_at', since).or(`launch_date.is.null,launch_date.lt.${today}`).order('reviewed_at', { ascending: false }).limit(6)).catch(() => []); },
    // Approved launches whose day hasn't started yet, soonest first
    upcoming: () => pre('upcoming', () => q(sb.from('product_feed').select(PRODUCT_COLS).eq('status', 'scheduled').neq('effective_status', 'live').order('launch_date', { ascending: true }).order('verified', { ascending: false }).limit(20))),
    daySlots: (d1, d2) => q(sb.rpc('day_slots', { d1, d2 })),
    launchingToday: () => pre('today', () => q(sb.from('product_feed').select('id', { count: 'exact', head: true }).eq('launch_date', new Date(Date.now() + 3600e3).toISOString().slice(0, 10)).in('status', ['scheduled', 'live']))),
    // Recent: newest products on Hentity, launched or not yet claimed (Figma: Products feed · Recent)
    recent: ({ country, pay } = {}) => { let s = sb.from('product_feed').select(PRODUCT_COLS).in('status', ['live', 'unclaimed']); if (country && country !== 'all') s = s.eq('country', country); if (pay) s = s.contains('pay_methods', [pay]); return q(s.order('created_at', { ascending: false }).order('upvote_count', { ascending: false }).limit(60)); },
    wallOfFame: () => q(sb.from('product_feed').select(PRODUCT_COLS).in('status', ['scheduled', 'live', 'unclaimed']).gt('upvote_count', 0).order('upvote_count', { ascending: false }).limit(12)),
    product: slug => pre('product:' + slug, () => q(sb.from('product_feed').select(PRODUCT_COLS + ',intro,review_note,review_items,verify,support_pledge,reviewed_at,claim,claimed_at').eq('slug', slug).maybeSingle())),
    productsByIds: ids => ids.length ? pre('products:' + ids.join(','), () => q(sb.from('product_feed').select(PRODUCT_COLS).in('id', ids))) : Promise.resolve([]),
    company: id => id ? pre('company:' + id, () => q(sb.from('companies').select('*').eq('id', id).maybeSingle())) : Promise.resolve(null),
    makers: pid => pre('makers:' + pid, () => q(sb.from('product_makers').select('role,accepted,user:profiles!product_makers_user_id_fkey(id,username,name,avatar_url,avatar_color,city,country,headline,bio)').eq('product_id', pid))),
    async directory({ countries, pay, stages, sectors, langs, term, sort, scope, profile }) {
      // profile: which pages to include: ['claimed','unclaimed'] (default both)
      const prof = profile && profile.length ? profile : ['claimed', 'unclaimed'];
      const st = [...(prof.includes('claimed') ? ['scheduled', 'live'] : []), ...(prof.includes('unclaimed') ? ['unclaimed'] : [])];
      let s = sb.from('product_feed').select(PRODUCT_COLS + ',claim').in('status', st.length ? st : ['none']);
      if (scope === 'local') s = s.eq('country', 'NG'); else if (countries && countries.length) s = s.in('country', countries);
      if (pay && pay.length) s = s.overlaps('pay_methods', pay);
      if (stages && stages.length) s = s.in('stage', stages);
      if (sectors && sectors.length) s = s.overlaps('categories', sectors);
      if (langs && langs.length) s = s.or(langs.map(l => `languages.ilike.%${l}%`).join(','));
      // "yolafresh" also finds "YoLa Fresh": names match with spaces, dots or dashes in between
      if (term) { const loose = /\s/.test(term) || term.length < 5 ? '' : `,name.ilike.%${term.split('').join('%')}%`; s = s.or(`name.ilike.%${term}%,tagline.ilike.%${term}%,city.ilike.%${term}%,slug.ilike.%${term.trim().replace(/\s+/g, '-')}%${loose}`); }
      const order = sort === 'az' ? ['name', true] : sort === 'new' ? ['created_at', false] : sort === 'votes' ? ['upvote_count', false] : ['follower_count', false];
      return q(s.order(order[0], { ascending: order[1] }).order('upvote_count', { ascending: false }).limit(1000));
    },
    // Closest products by shared tags and what they do (scored in product_alternatives); falls back to any shared tag
    alternatives: (p) => pre('alts:' + p.id, () => q(sb.rpc('product_alternatives', { pid: p.id, lim: 4 })).then(r => r || [])
      .catch(() => q(sb.from('product_feed').select('id,slug,name,tagline,color,country,logo_url').in('status', ['scheduled', 'live']).overlaps('categories', p.categories || []).neq('id', p.id).limit(3)))),

    // ---------------- votes, follows, bookmarks
    async myVotes(ids) { if (!uid() || !ids.length) return new Set(); const r = await q(sb.from('upvotes').select('product_id').eq('user_id', uid()).in('product_id', ids)); return new Set(r.map(x => x.product_id)); },
    async vote(pid, on) { requireAuth(); touched(); if (on) err((await sb.from('upvotes').insert({ user_id: uid(), product_id: pid })).error); else err((await sb.from('upvotes').delete().eq('user_id', uid()).eq('product_id', pid)).error); },
    async following(type, ids) { if (!uid() || !ids.length) return new Set(); const r = await q(sb.from('follows').select('target_id').eq('follower_id', uid()).eq('target_type', type).in('target_id', ids)); return new Set(r.map(x => x.target_id)); },
    async follow(type, id, on) { requireAuth(); touched(); if (on) err((await sb.from('follows').insert({ follower_id: uid(), target_type: type, target_id: id })).error); else err((await sb.from('follows').delete().eq('follower_id', uid()).eq('target_type', type).eq('target_id', id)).error); },
    async followCounts(id) {
      const [followers, following, upvotes] = await Promise.all([
        q(sb.from('follows').select('*', { count: 'exact', head: true }).eq('target_type', 'user').eq('target_id', id)),
        q(sb.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', id)),
        q(sb.from('upvotes').select('*', { count: 'exact', head: true }).eq('user_id', id))]);
      return { followers, following, upvotes };
    },
    async bookmarks(type) { if (!uid()) return []; return q(sb.from('bookmarks').select('target_id,created_at').eq('user_id', uid()).eq('target_type', type).order('created_at', { ascending: false })); },
    async bookmark(type, id, on) { requireAuth(); touched(); if (on) err((await sb.from('bookmarks').insert({ user_id: uid(), target_type: type, target_id: id })).error); else err((await sb.from('bookmarks').delete().eq('user_id', uid()).eq('target_type', type).eq('target_id', id)).error); },
    async isBookmarked(type, id) { if (!uid()) return false; const r = await q(sb.from('bookmarks').select('target_id').eq('user_id', uid()).eq('target_type', type).eq('target_id', id).maybeSingle()); return !!r; },
    async notifyRequests() { if (!uid()) return new Set(); const r = await q(sb.from('notify_requests').select('product_id').eq('user_id', uid())); return new Set(r.map(x => x.product_id)); },
    async notifyMe(pid, on) { requireAuth(); touched(); if (on) err((await sb.from('notify_requests').insert({ user_id: uid(), product_id: pid })).error); else err((await sb.from('notify_requests').delete().eq('user_id', uid()).eq('product_id', pid)).error); },
    trackClick: pid => sb.rpc('track_click', { p: pid }),
    track, visitorId,
    // Founders' analytics for one product (team only)
    productAnalytics: (pid, days) => q(sb.rpc('product_analytics', { pid, days })),
    trackView: pid => sb.rpc('track_view', { p: pid }),
    upvotedBy: (userId) => q(sb.from('upvotes').select('product_id,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(30)),
    votesByDay: (pid) => q(sb.from('upvotes').select('created_at').eq('product_id', pid).gte('created_at', new Date(Date.now() - 8 * 864e5).toISOString())),

    // ---------------- comments
    comments: ({ product, article }) => pre(product ? 'comments:p:' + product : 'comments:a:' + article, () => q(sb.from('comments').select('id,body,created_at,parent_id,deleted,user:profiles!comments_user_id_fkey(id,username,name,avatar_url,avatar_color)').eq(product ? 'product_id' : 'article_id', product || article).order('created_at'))),
    recentComments: () => pre('recent', () => q(sb.from('comments').select('created_at,product:products(name),article:articles(title),user:profiles!comments_user_id_fkey(name,city,username,avatar_url,avatar_color)').eq('deleted', false).order('created_at', { ascending: false }).limit(5))),
    async comment({ product, article, parent, body }) { requireAuth(); touched(); return q(sb.from('comments').insert({ product_id: product || null, article_id: article || null, parent_id: parent || null, body, user_id: uid() }).select('id,body,created_at,parent_id,deleted,user:profiles!comments_user_id_fkey(id,username,name,avatar_url,avatar_color)').single()); },
    deleteComment: id => (touched(), q(sb.from('comments').update({ deleted: true, body: '[deleted]' }).eq('id', id))),
    // Product reviews (one per member per product; makers reply)
    reviews: (pid, sort) => q(sb.rpc('product_reviews', { pid, sort: sort || 'helpful', lim: 200 })),
    async saveReview(pid, id, rating, body, extra) { requireAuth(); touched(); const row = Object.assign({ rating, body }, extra || {}); if (id) return q(sb.from('product_reviews').update(row).eq('id', id).select('id').single()); return q(sb.from('product_reviews').insert(Object.assign({ product_id: pid }, row)).select('id').single()); },
    // Most-requested features and what shipped (Hentity's own page)
    roadmap: pid => q(sb.rpc('roadmap', { pid })),
    async roadmapVote(id, on) { requireAuth(); if (on) err((await sb.from('roadmap_votes').insert({ item_id: id })).error); else err((await sb.from('roadmap_votes').delete().eq('item_id', id).eq('user_id', uid())).error); },
    deleteReview: id => q(sb.from('product_reviews').delete().eq('id', id)),
    async reviewHelpful(id, on) { requireAuth(); if (on) err((await sb.from('product_review_votes').insert({ review_id: id })).error); else err((await sb.from('product_review_votes').delete().eq('review_id', id).eq('user_id', uid())).error); },
    reviewReply: (id, txt) => q(sb.rpc('review_reply', { rid: id, txt: txt || '' })),
    async report(type, id, reason) { requireAuth(); err((await sb.from('reports').insert({ reporter_id: uid(), target_type: type, target_id: id, reason })).error); },

    // ---------------- notifications
    notifications: (limit) => q(sb.from('notifications').select('*,actor:profiles!notifications_actor_id_fkey(name,username,avatar_url,avatar_color),product:products(name,slug,color,logo_url)').eq('user_id', uid()).order('created_at', { ascending: false }).limit(limit || 50)),
    async unreadCount() { if (!uid()) return 0; return q(sb.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', uid()).is('read_at', null)); },
    markRead: id => q(sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)),
    markAllRead: () => q(sb.rpc('mark_all_read')),

    // ---------------- my products & submissions
    myProducts: () => q(sb.from('product_feed').select(PRODUCT_COLS + ',review_note,review_items,intro,claimed_at').or(`owner_id.eq.${uid()}`).neq('status', 'archived').order('created_at', { ascending: false })),
    async createDraft(fields) { requireAuth(); return q(sb.from('products').insert(Object.assign({ owner_id: uid() }, fields)).select().single()); },
    saveProduct: (id, patch) => q(sb.from('products').update(patch).eq('id', id).select().single()),
    deleteProduct: id => q(sb.from('products').delete().eq('id', id)),
    addMaker: (pid, userId, role) => q(sb.from('product_makers').insert({ product_id: pid, user_id: userId, role: role || 'Maker', accepted: false })),
    removeMaker: (pid, userId) => q(sb.from('product_makers').delete().eq('product_id', pid).eq('user_id', userId)),
    myCompanies: () => q(sb.from('companies').select('*').eq('owner_id', uid())),
    createCompany: c => q(sb.from('companies').insert(Object.assign({ owner_id: uid() }, c)).select().single()),
    async slugFree(slug, id) { const { data } = await sb.from('products').select('id').eq('slug', slug).maybeSingle(); return !data || data.id === id; },

    // ---------------- storage
    async upload(file, folder) {
      requireAuth();
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${uid()}/${folder || 'files'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await sb.storage.from('media').upload(path, file, { cacheControl: '31536000', upsert: false, contentType: file.type });
      err(error);
      return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
    },

    // ---------------- account
    exportData: () => q(sb.rpc('export_my_data')),
    requestDeletion: () => q(sb.rpc('request_deletion')),
    cancelDeletion: () => q(sb.rpc('cancel_deletion')),
    blocks: () => q(sb.from('blocks').select('created_at,blocked:profiles!blocks_blocked_id_fkey(id,name,username)').eq('user_id', uid())),
    block: (id, on) => on ? q(sb.from('blocks').insert({ user_id: uid(), blocked_id: id })) : q(sb.from('blocks').delete().eq('user_id', uid()).eq('blocked_id', id)),

    // ---------------- beta tests
    betas: () => q(sb.from('betas').select(BETA_COLS).in('status', ['open', 'closed']).order('closes_at', { ascending: true }).limit(120)),
    beta: id => q(sb.from('betas').select(BETA_COLS).eq('id', id).maybeSingle()),
    betasOfProducts: ids => ids.length ? q(sb.from('betas').select(BETA_COLS).in('product_id', ids).order('created_at', { ascending: false })) : Promise.resolve([]),
    betaStats: () => q(sb.rpc('beta_stats')),
    betaReach: cs => q(sb.rpc('beta_reach', { cs: cs || [] })),
    myBetaApps: () => uid() ? q(sb.from('beta_applications').select('id,beta_id,status,tasks_done,perk_released_at,created_at').eq('user_id', uid())) : Promise.resolve([]),
    myBetaApp: id => uid() ? q(sb.from('beta_applications').select('*').eq('beta_id', id).eq('user_id', uid()).maybeSingle()) : Promise.resolve(null),
    async applyBeta(row) { requireAuth(); touched(); return q(sb.from('beta_applications').insert(Object.assign({ user_id: uid() }, row)).select().single()); },
    updateMyApp: (id, patch) => { touched(); return q(sb.from('beta_applications').update(patch).eq('id', id).select().single()); },
    betaAccess: id => q(sb.from('beta_access').select('links').eq('beta_id', id).maybeSingle()),
    async saveBeta(id, row, links) {
      requireAuth(); touched();
      const b = id ? await q(sb.from('betas').update(row).eq('id', id).select('id').single()) : await q(sb.from('betas').insert(row).select('id').single());
      if (links) err((await sb.from('beta_access').upsert({ beta_id: b.id, links })).error);
      return b;
    },
    deleteBeta: id => q(sb.from('betas').delete().eq('id', id)),
    betaApplicants: id => q(sb.rpc('beta_applicants', { b: id })),
    decideApp: (id, status) => { touched(); return q(sb.from('beta_applications').update({ status }).eq('id', id)); },
    acceptBest: (b, n) => { touched(); return q(sb.rpc('beta_accept_best', { b, n })); },
    betaFeedback: id => q(sb.rpc('beta_feedback_list', { b: id })),
    async sendFeedback(row) { requireAuth(); touched(); return q(sb.from('beta_feedback').insert(row).select().single()); },
    myFeedback: appId => q(sb.from('beta_feedback').select('*').eq('application_id', appId).maybeSingle()),
    updateFeedback: (id, patch) => q(sb.from('beta_feedback').update(patch).eq('id', id)),
    setPayout: (app, phone, network) => q(sb.rpc('beta_set_payout', { app, phone, network })),
    myPayout: app => q(sb.rpc('my_beta_payout', { app })),
    nudgeTesters: b => q(sb.rpc('beta_nudge', { b })),
    // Insights
    insights: (cc, days) => q(sb.rpc('insights', { cc: cc || null, days: days || 30 })),
    // Funding
    fundingBoard: (pid, mode) => q(sb.rpc('funding_board', { pid, md: mode || 'grant' })),
    fundingOpp: (oid, pid) => q(sb.rpc('funding_opp', { oid, pid })),
    // Saved / applied tracker (funders take applications on their own sites)
    fundingTrack: (oid, pid, patch) => q(sb.from('funding_track').upsert(Object.assign({ user_id: uid(), opp_id: oid, product_id: pid || null, updated_at: new Date().toISOString() }, patch), { onConflict: 'user_id,opp_id' }).select().single()),
    // Saved page: roles, people, betas and funding in one call (products and stories come from bookmarks)
    mySaved: () => uid() ? q(sb.rpc('my_saved')) : Promise.resolve({}),
    savedPeopleKeys: () => uid() ? q(sb.rpc('my_saved_people_keys')).then(r => r || []) : Promise.resolve([]),
    savePerson: (key, on) => { requireAuth(); touched(); return q(sb.rpc('find_save_person', { person_key: key, on_: !!on })); },
    // What the founder's deck (or description) says, read in the browser: sectors, keywords, stage, raise, markets
    fundingProfileSave: (pid, row) => q(sb.from('funding_profiles').upsert(Object.assign({ product_id: pid, updated_by: uid(), updated_at: new Date().toISOString() }, row)).select().single()),
    fundingProfileRemove: pid => q(sb.from('funding_profiles').delete().eq('product_id', pid)),
    // Discuss: communities, posts, threaded replies, votes (writes go through the d_* functions)
    d: {
      feed: o => q(sb.rpc('d_feed', { sort: o.sort || 'hot', comm: o.comm || null, flair: o.flair || null, city: o.city || null, period: o.period || 'all', lim: o.lim || 25, off: o.off || 0 })).then(r => r || []),
      thread: (c, s) => q(sb.rpc('d_thread', { comm: c, post: s })),
      community: c => q(sb.rpc('d_community', { comm: c })),
      rail: () => q(sb.rpc('d_rail')),
      postable: () => q(sb.rpc('d_postable')).then(r => r || []),
      create: o => { requireAuth(); return q(sb.rpc('d_post_create', { comm: o.comm, flair: o.flair, title: o.title, body: o.body || '', product: o.product || null, link: o.link || null, images: o.images || [] })); },
      edit: (id, title, body) => q(sb.rpc('d_post_edit', { pid: id, title, body })),
      remove: id => q(sb.rpc('d_post_delete', { pid: id })),
      set: (id, o) => q(sb.rpc('d_post_set', { pid: id, pinned: o.pinned == null ? null : o.pinned, status: o.status === undefined ? 'keep' : (o.status || 'none') })),
      reply: (post, parent, body) => { requireAuth(); return q(sb.rpc('d_comment_create', { pid: post, parent: parent || null, body })); },
      replyEdit: (id, body) => q(sb.rpc('d_comment_edit', { cid: id, body })),
      replyRemove: id => q(sb.rpc('d_comment_delete', { cid: id })),
      vote: (kind, id, val) => { requireAuth(); return q(sb.rpc('d_vote', { kind, target: id, val })); },
      join: (c, on) => { requireAuth(); return q(sb.rpc('d_join', { comm: c, joining: on })); },
      save: (id, on) => { requireAuth(); return on ? q(sb.from('d_saves').insert({ user_id: uid(), post_id: id })) : q(sb.from('d_saves').delete().eq('user_id', uid()).eq('post_id', id)); },
      products: t => q(sb.from('products').select('slug,name,logo_url,color,owner_id').in('status', ['live', 'scheduled', 'unclaimed']).ilike('name', '%' + t + '%').order('upvote_count', { ascending: false }).limit(6))
    },
    fundingUntrack: oid => q(sb.from('funding_track').delete().eq('user_id', uid()).eq('opp_id', oid)),
    myFundingProducts: () => uid() ? q(sb.from('product_feed').select('id,slug,name,logo_url,color,status,categories,stage,country,city,verified').eq('owner_id', uid()).in('status', ['live', 'scheduled', 'review', 'changes']).order('created_at', { ascending: false })) : Promise.resolve([]),
    dataroom: pid => q(sb.from('dataroom_items').select('*').eq('product_id', pid)),
    dataroomUpload: async (pid, kind, file) => {
      if (file.size > 20 * 1024 * 1024) throw new Error('Files can be up to 20 MB');
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
      const path = `${pid}/${kind}-${Date.now()}.${ext}`;
      const up = await sb.storage.from('dataroom').upload(path, file, { contentType: file.type || 'application/pdf', upsert: false }); if (up.error) throw up.error;
      const old = await q(sb.from('dataroom_items').select('path,version').eq('product_id', pid).eq('kind', kind).maybeSingle());
      await q(sb.from('dataroom_items').upsert({ product_id: pid, kind, path, file_name: file.name.slice(0, 120), version: old ? (old.version || 1) + 1 : 1, updated_at: new Date().toISOString() }));
      if (old && old.path) sb.storage.from('dataroom').remove([old.path]).catch(() => {});
      return path; },
    dataroomText: (pid, kind, text) => q(sb.from('dataroom_items').upsert({ product_id: pid, kind, text_value: text, updated_at: new Date().toISOString() })),
    dataroomRemove: async (pid, kind) => { const old = await q(sb.from('dataroom_items').select('path').eq('product_id', pid).eq('kind', kind).maybeSingle()); if (old && old.path) await sb.storage.from('dataroom').remove([old.path]); return q(sb.from('dataroom_items').delete().eq('product_id', pid).eq('kind', kind)); },
    // Revoke: move every file to a new path so links already sent stop working
    dataroomRevoke: async pid => { const rows = await q(sb.from('dataroom_items').select('kind,path').eq('product_id', pid)); for (const r of rows.filter(x => x.path)) { const np = r.path.replace(/-(\d+)\./, `-${Date.now()}.`); const mv = await sb.storage.from('dataroom').move(r.path, np); if (!mv.error) await q(sb.from('dataroom_items').update({ path: np }).eq('product_id', pid).eq('kind', r.kind)); } },
    dataroomLink: async (path, days) => { const r = await sb.storage.from('dataroom').createSignedUrl(path, Math.round((days || 30) * 86400)); if (r.error) throw r.error; return r.data.signedUrl; },
    insightsFounders: (f) => q(sb.rpc('insights_founders', { f: f || {} })),
    insightsExplore: (ds, by, split, f, measure) => q(sb.rpc('insights_explore', { ds, by, split: split || null, f: f || {}, measure: measure || 'count' })),
    insightViews: () => uid() ? q(sb.from('insight_views').select('*').order('updated_at', { ascending: false }).limit(20)) : Promise.resolve([]),
    saveInsightView: (name, query) => q(sb.from('insight_views').insert({ name, query }).select().single()),
    deleteInsightView: id => q(sb.from('insight_views').delete().eq('id', id)),
    foundingTeam: async id => { const [t, p] = await Promise.all([q(sb.from('product_founders').select('team,founders').eq('product_id', id).maybeSingle()), q(sb.from('products').select('founded_year,raised_usd,raised_year').eq('id', id).maybeSingle())]);
      return Object.assign({ founding_team: t && t.team, founders_count: t && t.founders }, p || {}); },
    setFoundingTeam: (pid, team, founders, founded) => q(sb.rpc('set_founding_team', { pid, team: team || null, founders: founders || null, founded: founded || null })),
    // Validate an idea (Figma: Validate)
    // Find (roles, people open to work, mutual interest, matches)
    editState: slug => q(sb.rpc('product_edit_state', { pslug: slug })),
    requestEdit: (pid, changes, msg) => q(sb.rpc('product_edit_request', { pid, changes, msg: msg || '' })),
    withdrawEdit: eid => q(sb.rpc('product_edit_withdraw', { eid })),
    // Data room (Figma 105:1630 · 302:3757 · 304:3901 · 228:3074 · 229:3260)
    drRoom: () => q(sb.rpc('dr_my_room')),
    drSetup: (stage, pid, name) => { requireAuth(); return q(sb.rpc('dr_setup', { stg: stage, pid: pid || null, nm: name || '' })); },
    drUpload: async (roomId, file, item, folder, pages) => {
      requireAuth(); const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
      const path = `${uid()}/${roomId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      err((await sb.storage.from('dataroom').upload(path, file, { upsert: false, contentType: file.type || undefined })).error);
      try {
        const f = await q(sb.rpc('dr_add_file', { itm: item || '', fld: folder || 'other', nm: file.name, pth: path, sz: file.size, mt: file.type || '', pg: pages || null }));
        if (f && f.old_path) sb.storage.from('dataroom').remove([f.old_path]).catch(() => {});
        return f;
      } catch (e) { sb.storage.from('dataroom').remove([path]).catch(() => {}); throw e; }
    },
    drDelete: async id => { const path = await q(sb.rpc('dr_delete_file', { fid: id })); if (path) await sb.storage.from('dataroom').remove([path]); },
    drRename: (id, name) => q(sb.rpc('dr_rename_file', { fid: id, nm: name })),
    drFileUrl: path => sb.storage.from('dataroom').createSignedUrl(path, 600).then(r => { err(r.error); return r.data.signedUrl; }),
    drFileBlob: path => sb.storage.from('dataroom').download(path).then(r => { err(r.error); return r.data; }),
    drSaveLink: (id, l) => q(sb.rpc('dr_save_link', { lid: id || null, lbl: l.label, fids: l.file_ids || null, md: l.mode, allw: l.allow || [], dl: !!l.download, wm: l.watermark !== false, trk: l.track !== false, exp: l.expires_at || null })),
    drRevoke: (id, on) => q(sb.rpc('dr_revoke_link', { lid: id, on_: on !== false })),
    drAnalytics: (fid, lid, days) => q(sb.rpc('dr_analytics', { fid: fid || null, lid: lid || null, ndays: days || 30 })),
    drOpen: tok => q(sb.rpc('dr_open', { tok })),
    drCode: (tok, em) => q(sb.rpc('dr_request_code', { tok, em })),
    drStart: (tok, em, code, dev) => q(sb.rpc('dr_start', { tok, em: em || null, code: code || null, dev: dev || '' })),
    drResume: sec => q(sb.rpc('dr_resume', { sec })),
    // Founder badges (073_founder_badges.sql)
    badgeMe: () => { requireAuth(); return q(sb.rpc('badge_me')); },
    badgeSet: o => q(sb.rpc('badge_set', { featured: o.featured || null, hidden: o.hidden == null ? null : !!o.hidden })),
    badgeSeen: k => q(sb.rpc('badge_seen', { k })),
    badgePublic: uid => q(sb.rpc('badge_public', { uid })),
    badgeMarks: ids => q(sb.rpc('badge_marks', { uids: ids })),
    drTrack: (sec, fid, pg, secs, opened) => sb.rpc('dr_track', { sec, fid, pg, secs, opened: !!opened }).then(() => {}, () => {}),
    findBoard: (f = {}) => q(sb.rpc('find_board', { kinds: f.kinds && f.kinds.length ? f.kinds : null, q: f.q || null, cat: f.cat || null, cc: f.cc || null, lim: 60 })),
    findPeople: (f = {}) => q(sb.rpc('find_people', { kinds: f.kinds && f.kinds.length ? f.kinds : null, q: f.q || null, cc: f.cc || null, lim: 60 })),
    findCounts: () => q(sb.rpc('find_counts')),
    findRole: id => q(sb.rpc('find_role', { rid: id })),
    myFindRoles: () => uid() ? q(sb.from('find_roles').select('*').eq('owner_id', uid()).order('created_at', { ascending: false })) : Promise.resolve([]),
    myFindRole: id => q(sb.from('find_roles').select('*').eq('id', id).maybeSingle()),
    saveFindRole: (id, row) => { requireAuth(); return id ? q(sb.from('find_roles').update(row).eq('id', id).select('*').single()) : q(sb.from('find_roles').insert(row).select('*').single()); },
    myFindProfile: () => uid() ? q(sb.from('find_profiles').select('*').eq('user_id', uid()).maybeSingle()) : Promise.resolve(null),
    saveFindProfile: row => { requireAuth(); return q(sb.from('find_profiles').upsert(Object.assign({ user_id: uid() }, row)).select('*').single()); },
    findExpress: (rid, intro, answers, cv, linkedin) => { requireAuth(); return q(sb.rpc('find_express', { rid, intro, answers: answers || [], cv: cv || null, linkedin: linkedin || null })); },
    // CVs go to a private bucket under <user id>/; the poster opens them with a short-lived link
    uploadCv: async file => { requireAuth(); const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, ''); const path = `${uid()}/cv-${Date.now()}.${ext}`; err((await sb.storage.from('find-cv').upload(path, file, { upsert: false, contentType: file.type || undefined })).error); return { path, name: file.name.slice(0, 120), size: file.size }; },
    cvUrl: path => sb.storage.from('find-cv').createSignedUrl(path, 600).then(r => { err(r.error); return r.data.signedUrl; }),
    findInvite: (key, rid, intro) => { requireAuth(); return q(sb.rpc('find_invite', { person_key: key, rid, intro })); },
    findView: key => q(sb.rpc('find_view', { person_key: key })).catch(() => {}),
    findDecide: (iid, accept) => q(sb.rpc('find_decide', { iid, accept })),
    findWithdraw: iid => q(sb.rpc('find_withdraw', { iid })),
    findInbox: () => uid() ? q(sb.rpc('find_inbox')) : Promise.resolve([]),
    findMatch: id => q(sb.rpc('find_match', { mid: id })),
    findMessages: id => q(sb.from('find_messages').select('*').eq('match_id', id).order('created_at')),
    findSend: (id, body) => q(sb.rpc('find_send', { mid: id, body })),
    findSignNda: (id, name) => q(sb.rpc('find_sign_nda', { mid: id, signed_name: name })),
    findSetFit: (id, answers) => q(sb.rpc('find_set_fit', { mid: id, answers })),
    findSetTrial: (id, trial) => q(sb.rpc('find_set_trial', { mid: id, trial })),
    findStats: () => q(sb.rpc('find_my_stats')),
    findExport: () => q(sb.rpc('find_export')),
    // Removes Find data, then every CV file this member uploaded (the bucket folder is <user id>/)
    findDeleteHistory: async () => {
      requireAuth(); await q(sb.rpc('find_delete_history'));
      const b = sb.storage.from('find-cv'); let n = 0;
      for (;;) {
        const { data, error } = await b.list(uid(), { limit: 100 }); err(error);
        const paths = (data || []).filter(f => f.name && f.id !== null).map(f => uid() + '/' + f.name);
        if (!paths.length) break;
        err((await b.remove(paths)).error); n += paths.length;
        if (paths.length < 100 || n > 2000) break;
      }
      return n;
    },
    validateIdea: a => q(sb.rpc('validate_idea', { idea: a.idea, who: a.who || null, cc: a.cc || null, city: a.city || null, money: a.money || null, stage: a.stage || null, cats: a.cats || [] })),
    ideaCheck: id => q(sb.from('idea_checks').select('*').eq('id', id).maybeSingle()),
    myIdeaChecks: () => uid() ? q(sb.from('idea_checks').select('id,idea,score,created_at').eq('user_id', uid()).order('created_at', { ascending: false }).limit(6)) : Promise.resolve([]),
    updateIdeaCheck: (id, patch) => q(sb.from('idea_checks').update(patch).eq('id', id)),
    // Unclaimed profiles + claim flow (Figma: Claims)
    radarFeed: ({ cc, limit } = {}) => { let s = sb.from('product_feed').select(PRODUCT_COLS + ',claim').eq('status', 'unclaimed'); if (cc) s = s.eq('country', cc); return q(s.order('created_at', { ascending: false }).limit(limit || 60)); },
    unclaimedCount: cc => { let s = sb.from('products').select('id', { count: 'exact', head: true }).eq('status', 'unclaimed'); if (cc) s = s.eq('country', cc); return (async () => (await s).count || 0)(); },
    asks: async pid => (await sb.from('notify_requests').select('user_id', { count: 'exact', head: true }).eq('product_id', pid)).count || 0,
    claimInfo: s => q(sb.rpc('claim_info', { s })),
    claimStart: (s, r, m, em) => q(sb.rpc('claim_start', { s, r, m, em: em || null })),
    claimVerifyCode: (cid, code) => q(sb.rpc('claim_verify_code', { cid, code })),
    claimCheckDns: cid => q(sb.rpc('claim_check_dns', { cid })),
    async claimUpload(cid, file, kind) { requireAuth(); const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, ''); const path = `${uid()}/${cid}/${kind}-${Date.now()}.${ext}`; err((await sb.storage.from('claims').upload(path, file, { upsert: false, contentType: file.type || undefined })).error); return { path, kind, name: file.name, size: file.size }; },
    claimSubmitDocs: (cid, files, note) => q(sb.rpc('claim_submit_docs', { cid, files, note_text: note || null })),
    claimPublish: (cid, e) => q(sb.rpc('claim_publish', { cid, e })),
    requestRemoval: (s, nm, em, rel, why) => q(sb.rpc('request_removal', { s, nm, em, rel, why })),
    // Ops
    radar: (status, { q: term, cc, cat, batch, from } = {}) => { let s = sb.from('radar').select('*').eq('status', status || 'review'); if (term) s = s.or(`name.ilike.%${term.replace(/[%,()]/g, '')}%,website.ilike.%${term.replace(/[%,()]/g, '')}%`); if (cc) s = s.eq('country', cc); if (cat) s = s.contains('categories', [cat]); if (batch) s = s.eq('checks->>batch', batch); return q(s.order('confidence', { ascending: false }).order('created_at', { ascending: false }).range(from || 0, (from || 0) + 199)); },
    radarCounts: async () => { const c = {}; await Promise.all(['review', 'published', 'rejected', 'merged'].map(async k => { const { count } = await sb.from('radar').select('id', { count: 'exact', head: true }).eq('status', k); c[k] = count || 0; })); return c; },
    radarAdd: row => q(sb.from('radar').insert(Object.assign({ created_by: uid() }, row)).select('*').single()),
    radarUpdate: (id, row) => q(sb.from('radar').update(row).eq('id', id)),
    radarDupe: rid => q(sb.rpc('radar_dupe', { rid })),
    radarPublish: (rid, invite) => q(sb.rpc('radar_publish', { rid, invite: !!invite })),
    radarPush: rid => q(sb.rpc('radar_push', { rid })),
    radarUnpublish: rid => q(sb.rpc('radar_unpublish', { rid })),
    claimsQueue: () => q(sb.from('claims').select('*,product:products(slug,name,website,color,logo_url,country,city),user:profiles!claims_user_id_fkey(id,name,username,avatar_url,avatar_color)').in('status', ['review', 'verified', 'started']).order('created_at', { ascending: false }).limit(100)),
    claimDecide: (cid, ok, why) => q(sb.rpc('claim_decide', { cid, ok, why: why || null })),
    claimDocUrl: path => sb.storage.from('claims').createSignedUrl(path, 600).then(r => { err(r.error); return r.data.signedUrl; }),
    removals: () => q(sb.from('removal_requests').select('*,product:products(slug,name,status)').order('created_at', { ascending: false }).limit(100)),
    removalDecide: (rid, remove) => q(sb.rpc('removal_decide', { rid, remove })),
    // Badges & embeds
    badgeInfo: slug => q(sb.rpc('badge_info', { s: slug })),
    badgeSummary: pid => q(sb.rpc('badge_summary', { pid })),
    badgeHit: (s, ev) => sb.rpc('badge_hit', { s, ev }).then(() => {}, () => {}),
    // Beta Studio
    betaBySlug: slug => q(sb.from('betas').select(BETA_COLS).eq('slug', slug).maybeSingle()),
    productBetas: pid => q(sb.from('betas').select(BETA_COLS).eq('product_id', pid).order('created_at', { ascending: false })),
    openBetaOf: pid => q(sb.from('betas').select(BETA_COLS).eq('product_id', pid).eq('status', 'open').gt('closes_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle()),
    betaApply: a => { touched(); return q(sb.rpc('beta_apply', a)); },
    betaSign: (app, name) => q(sb.rpc('beta_sign', { app, signed_name: name, ua: navigator.userAgent })),
    myBetaAccess: b => q(sb.rpc('my_beta_access', { b })),
    betaTrack: (s, src) => sb.rpc('beta_track', { s, src: src || '' }).then(() => {}, () => {}),
    betaSources: b => q(sb.rpc('beta_sources', { b })),
    betaResults: b => q(sb.rpc('beta_results', { b })),
    remindSign: b => q(sb.rpc('beta_remind_sign', { b })),
    setTesterAccess: (app, on) => q(sb.rpc('beta_set_access', { app, on_: on })),
    completeBeta: b => q(sb.rpc('beta_complete', { b })),
    betaLinks: b => q(sb.from('beta_links').select('*').eq('beta_id', b).order('created_at')),
    addBetaLink: (b, code, label) => q(sb.from('beta_links').insert({ beta_id: b, code, label }).select().single()),
    deleteBetaLink: id => q(sb.from('beta_links').delete().eq('id', id)),
    betaCodes: b => q(sb.from('beta_codes').select('id,code,application_id').eq('beta_id', b).order('code')),
    addBetaCodes: (b, codes) => q(sb.from('beta_codes').upsert(codes.map(code => ({ beta_id: b, code })), { onConflict: 'beta_id,code', ignoreDuplicates: true })),
    clearBetaCodes: b => q(sb.from('beta_codes').delete().eq('beta_id', b).is('application_id', null)),
    betaAccessConfig: b => q(sb.from('beta_access').select('links,config').eq('beta_id', b).maybeSingle()),
    saveBetaAccessConfig: (b, config) => q(sb.from('beta_access').upsert({ beta_id: b, config })),
    async createBetaDraft(product_id, title) {
      requireAuth(); touched();
      const closes = new Date(Date.now() + 14 * 864e5).toISOString();
      return q(sb.from('betas').insert({ product_id, title: title || 'New beta', status: 'draft', closes_at: closes, spots: 20, perk_type: 'none' }).select('id,slug').single());
    },
    updateBeta: (id, patch) => { touched(); return q(sb.from('betas').update(patch).eq('id', id).select(BETA_COLS).single()); },
    productRoom: pid => q(sb.from('channels').select('slug').eq('product_id', pid).eq('kind', 'product').limit(1).maybeSingle()),

    // ---------------- chats
    channels: () => q(sb.from('channels').select('id,slug,name,description,kind,product_id,pinned,pinned_link,rules,archived,position,product:products(slug,name,color,logo_url,verified,upvote_count,tagline)').eq('archived', false).order('position').order('name')),
    channelMembers: (cid) => q(sb.from('channel_members').select('user_id,last_read_at,user:profiles!channel_members_user_id_fkey(id,name,username,avatar_url,avatar_color)').eq('channel_id', cid)),
    async myMemberships() { if (!uid()) return []; return q(sb.from('channel_members').select('channel_id,last_read_at').eq('user_id', uid())); },
    // Joining or reading a chat stamps it read on the server (server clock, so it can't drift)
    async joinChannel(cid) { if (!uid()) return; err((await sb.rpc('mark_channel_read', { cid })).error); },
    async markChannelRead(cid) { if (!uid() || !cid) return; const { error } = await sb.rpc('mark_channel_read', { cid }); if (error) console.warn('mark read failed', error.message); },
    messages: (cid, parent) => {
      let s = sb.from('messages').select('*,user:profiles!messages_user_id_fkey(id,name,username,avatar_url,avatar_color,is_verified),product:products(id,slug,name,tagline,color,logo_url,verified,upvote_count),reactions(emoji,user_id)').eq('channel_id', cid);
      s = parent ? s.or(`id.eq.${parent},parent_id.eq.${parent}`) : s.or('parent_id.is.null,also_in_channel.eq.true');
      return q(s.order('created_at', { ascending: !!parent }).limit(parent ? 200 : 80));
    },
    message: id => q(sb.from('messages').select('*,user:profiles!messages_user_id_fkey(id,name,username,avatar_url,avatar_color,is_verified),product:products(id,slug,name,tagline,color,logo_url,verified,upvote_count),reactions(emoji,user_id)').eq('id', id).maybeSingle()),
    // All badge counts in one round trip (rpc my_badges) instead of one query per chat channel
    async badges() { if (!uid()) return { notifications: 0, by_channel: {} }; return q(sb.rpc('my_badges')); },
    async unreadByChannel() { return (await API.badges()).by_channel || {}; },
    lastMessages: (ids) => q(sb.from('messages').select('channel_id,body,kind,created_at,user:profiles!messages_user_id_fkey(name)').in('channel_id', ids).is('parent_id', null).order('created_at', { ascending: false }).limit(200)),
    async send({ channel, body, parent, kind, product, attachment, duration, transcript, alsoInChannel }) {
      requireAuth();
      return q(sb.from('messages').insert({ channel_id: channel, user_id: uid(), body: body || '', parent_id: parent || null, kind: kind || 'text', product_id: product || null, attachment_url: attachment || null, duration: duration || null, transcript: transcript || null, also_in_channel: !!alsoInChannel }).select('id').single());
    },
    deleteMessage: id => q(sb.from('messages').update({ deleted: true, body: '' }).eq('id', id)),
    async react(mid, emoji, on) { requireAuth(); if (on) err((await sb.from('reactions').insert({ message_id: mid, user_id: uid(), emoji })).error); else err((await sb.from('reactions').delete().eq('message_id', mid).eq('user_id', uid()).eq('emoji', emoji)).error); },
    openDM: (other) => q(sb.rpc('open_dm', { other })),
    dmPartners: async (cids) => { if (!cids.length) return []; return q(sb.from('channel_members').select('channel_id,user:profiles!channel_members_user_id_fkey(id,name,username,avatar_url,avatar_color)').in('channel_id', cids).neq('user_id', uid())); },

    // ---------------- news
    articles: ({ topic, limit } = {}) => { const key = `articles:${topic || 'All'}:${limit || 30}`; if (Object.prototype.hasOwnProperty.call(PRE, key)) return pre(key); let s = sb.from('articles').select('*').eq('status', 'published'); if (topic && topic !== 'All') s = s.eq('topic', topic); return q(s.order('is_lead', { ascending: false }).order('published_at', { ascending: false }).limit(limit || 30)); },
    article: slug => pre('article:' + slug, () => q(sb.from('articles').select('*').eq('slug', slug).maybeSingle())),
    subscribe: (email) => q(sb.from('newsletter').upsert({ email: email.toLowerCase(), user_id: uid() || null }, { onConflict: 'email', ignoreDuplicates: true })),
    suggestStory: (url, note) => { requireAuth(); return q(sb.from('story_suggestions').insert({ url, note, user_id: uid() })); },
    publicStats: () => q(sb.rpc('public_stats')),   // counted from real data
    settings: async (key) => { if (Object.prototype.hasOwnProperty.call(PRE, 'settings:' + key)) return pre('settings:' + key); const r = await q(sb.from('site_settings').select('value').eq('key', key).maybeSingle()); return r ? r.value : null; },

    // ---------------- push notifications (Web Push; the installed app on iPhone, any modern browser elsewhere)
    push: (() => {
      // The public key comes from /api/push (kept in Vault); cached for the session
      let vapid = null; const key = async () => vapid || (vapid = await fetch('/api/push').then(r => r.ok ? r.json() : {}).then(j => j.key).catch(() => null));
      const u8 = b => { const s = atob((b + '='.repeat((4 - b.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); };
      const device = () => { const u = navigator.userAgent; return (/iPhone|iPad/.test(u) ? 'iPhone' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'Browser') + (matchMedia('(display-mode: standalone)').matches || navigator.standalone ? ' app' : ''); };
      const save = sub => { const j = sub.toJSON(); return q(sb.rpc('push_subscribe', { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, device: device() })); };
      const P = {
        // Some browsers expose the Push API but have no push service behind it (Edge on Android; Chrome on phones
        // without Google services): subscribing always fails with "push service error". Treat them as unsupported.
        // Learned by trying, not guessed from the browser name: some Edge for Android builds work, many don't
        noService: () => { try { return localStorage.getItem('h-push-noservice') === navigator.userAgent; } catch (e) { return false; } },
        // Edge for Android can "succeed" with a dead placeholder address that never receives anything
        deadEndpoint: sub => !sub || !/^https:\/\//.test(sub.endpoint || '') || /\.invalid(\/|:|$)/i.test(new URL(sub.endpoint).hostname + '/'),
        supported: () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !P.noService(),
        // What to tell someone whose browser can't do push
        noServiceMsg: () => { const ua = navigator.userAgent;
          return /\bEdgA\//.test(ua) ? 'This browser can’t receive push notifications. Open hentity.com in Chrome, Samsung Internet or Firefox and turn them on there.'
            : /Android/i.test(ua) ? 'Push notifications aren’t available in this browser on this phone. Open hentity.com in Firefox and turn them on there.'
            : 'This browser can’t receive push notifications. Try Chrome, Edge, Firefox or Safari.'; },
        permission: () => ('Notification' in window ? Notification.permission : 'unsupported'),
        async current() { if (!P.supported()) return null; const reg = await navigator.serviceWorker.getRegistration(); const sub = reg ? await reg.pushManager.getSubscription() : null; return sub && !P.deadEndpoint(sub) ? sub : null; },
        async enable() {
          requireAuth();
          const perm = await Notification.requestPermission();
          if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications are blocked for Hentity. Allow them in your browser or phone settings, then try again.' : 'Push notifications weren’t turned on.');
          const reg = await navigator.serviceWorker.ready;
          const k = await key(); if (!k) throw new Error('Push isn’t available right now. Try again in a minute.');
          let sub = await reg.pushManager.getSubscription();
          if (!sub) try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(k) }); } catch (e) {
            // No push service in this browser: remember it (so we stop offering) and say what to do instead
            if (e && (e.name === 'AbortError' || /push service/i.test(e.message || ''))) { try { localStorage.setItem('h-push-noservice', navigator.userAgent); } catch (er) {} throw new Error(P.noServiceMsg()); }
            throw e;
          }
          if (P.deadEndpoint(sub)) { await sub.unsubscribe().catch(() => {}); try { localStorage.setItem('h-push-noservice', navigator.userAgent); } catch (er) {} throw new Error(P.noServiceMsg()); }
          await save(sub); return true;
        },
        async disable() { const sub = await P.current(); if (sub) { await q(sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)).catch(() => {}); await sub.unsubscribe().catch(() => {}); } },
        // Keep this device's subscription saved (browsers rotate them; signing in on a shared device moves it)
        async sync() {
          if (!uid() || !P.supported() || P.permission() !== 'granted') return;
          let sub = await P.current().catch(() => null);
          // Allowed but this device has no subscription (cleared, expired or never finished): make one, no prompt needed
          if (!sub) { const k = await key(); if (!k) return; const reg = await navigator.serviceWorker.ready; sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(k) }).catch(() => null); }
          if (sub && !P.deadEndpoint(sub)) await save(sub).catch(() => {});
        },
        test: () => q(sb.rpc('push_test'))
      };
      return P;
    })(),
    // ---------------- realtime
    live(name, table, filter, cb) {
      const ch = sb.channel(name + ':' + Math.random().toString(36).slice(2));
      ch.on('postgres_changes', Object.assign({ event: '*', schema: 'public', table }, filter ? { filter } : {}), cb).subscribe();
      return () => sb.removeChannel(ch);
    },
    presence(room, me, onSync) {
      const ch = sb.channel('presence:' + room, { config: { presence: { key: me ? me.id : 'anon-' + Math.random() } } });
      ch.on('presence', { event: 'sync' }, () => onSync(ch.presenceState()));
      ch.on('broadcast', { event: 'typing' }, ({ payload }) => onSync(ch.presenceState(), payload));
      ch.subscribe(async s => { if (s === 'SUBSCRIBED' && me) await ch.track({ id: me.id, name: me.name }); });
      return { typing: (name) => ch.send({ type: 'broadcast', event: 'typing', payload: { name, at: Date.now() } }), leave: () => sb.removeChannel(ch) };
    }
  };

  // ---------------- admin
  API.admin = new Proxy({
    stats: () => q(sb.rpc('admin_stats')),
    review: (p, decision, note, items, wk, day) => q(sb.rpc('admin_review', { p, decision, note: note || null, items: items || [], wk: wk || null, day: day || null })),
    setUser: (u, patch) => q(sb.rpc('admin_set_user', { u, new_role: patch.role ?? null, verified: patch.verified ?? null, is_banned: patch.banned ?? null })),
    broadcast: (t, b, l) => q(sb.rpc('admin_broadcast', { ttl: t, bdy: b, lnk: l || null })),
    broadcastPreview: aud => q(sb.rpc('admin_broadcast_preview', { aud })),
    broadcastSend: (t, b, l, aud, mode) => q(sb.rpc('admin_broadcast_send', { ttl: t, bdy: b, lnk: l || null, aud, mode })),
    broadcasts: () => q(sb.from('push_broadcasts').select('*').order('created_at', { ascending: false }).limit(50)),
    products: ({ status, term } = {}) => { let s = sb.from('product_feed').select(PRODUCT_COLS + ',updated_at,review_note,review_items,intro,verify,support_pledge,owner:profiles!products_owner_id_fkey(id,name,username)'); if (status && status !== 'all') s = status === 'live' ? s.eq('effective_status', 'live') : s.eq('status', status); if (term) s = s.or(`name.ilike.%${term}%,slug.ilike.%${term}%`); return q(s.order('updated_at', { ascending: false }).limit(200)); },
    emailStats: () => q(sb.rpc('admin_email_stats')),
    emailPreview: () => q(sb.rpc('email_preview_all')),
    fundingOpps: () => q(sb.from('funding_opps').select('*').order('mode').order('name')),
    saveFundingOpp: (id, row) => id ? q(sb.from('funding_opps').update(Object.assign({}, row, { updated_at: new Date().toISOString() })).eq('id', id).select().single()) : q(sb.from('funding_opps').insert(row).select().single()),
    fundingCounts: () => q(sb.rpc('admin_funding_counts')),
    deleteFundingOpp: id => q(sb.from('funding_opps').delete().eq('id', id)),
    nudgeAudience: kinds => q(sb.rpc('admin_nudge_audience', { kinds })),
    sendNudges: (kinds, note, test, ids) => q(sb.rpc('admin_send_nudges', { kinds, note: note || null, test_only: !!test, only_ids: ids || null })),
    findRoles: st => q(sb.rpc('admin_find_roles', { st: st || 'review' })),
    reviewFindRole: (rid, ok, why) => q(sb.rpc('find_review_role', { rid, ok, why: why || null })),
    edits: st => q(sb.rpc('admin_product_edits', { st: st || 'pending' })),
    decideEdit: (eid, ok, fields, why, keepVerified) => q(sb.rpc('product_edit_decide', { eid, ok, fields: fields || null, why: why || null, keep_verified: keepVerified !== false })),
    updateProduct: (id, patch) => q(sb.from('products').update(patch).eq('id', id).select().single()),
    deleteProduct: id => q(sb.from('products').delete().eq('id', id)),
    users: (term, ids) => q(sb.rpc('admin_users', { term: term || null, ids: ids || null })),
    updateUser: (id, patch) => q(sb.from('profiles').update(patch).eq('id', id)),
    deleteUser: id => q(sb.from('profiles').delete().eq('id', id)),
    weeks: () => q(sb.from('weeks').select('*').order('id')),
    upsertWeek: w => q(sb.from('weeks').upsert(w)),
    betaPayouts: () => q(sb.rpc('admin_beta_payouts')),
    markPayout: (app, st) => q(sb.rpc('admin_mark_payout', { app, st })),
    betaFunded: (b, paid) => q(sb.rpc('admin_beta_funded', { b, paid })),
    weekCounts: () => q(sb.from('products').select('week_id,status').in('status', ['review', 'scheduled', 'live'])),
    comments: (term) => { let s = sb.from('comments').select('*,user:profiles!comments_user_id_fkey(name,username),product:products(name,slug),article:articles(title,slug)'); if (term) s = s.ilike('body', `%${term}%`); return q(s.order('created_at', { ascending: false }).limit(150)); },
    updateComment: (id, patch) => q(sb.from('comments').update(patch).eq('id', id)),
    hardDeleteComment: id => q(sb.from('comments').delete().eq('id', id)),
    messages: (term) => { let s = sb.from('messages').select('*,user:profiles!messages_user_id_fkey(name,username),channel:channels(name,slug,kind)').neq('kind', 'system'); if (term) s = s.ilike('body', `%${term}%`); return q(s.order('created_at', { ascending: false }).limit(150)); },
    deleteMessage: id => q(sb.from('messages').delete().eq('id', id)),
    reports: () => q(sb.from('reports').select('*,reporter:profiles!reports_reporter_id_fkey(name,username)').order('created_at', { ascending: false }).limit(200)),
    updateReport: (id, status) => q(sb.from('reports').update({ status, resolved_by: uid() }).eq('id', id)),
    channels: () => q(sb.from('channels').select('*').order('kind').order('position')),
    upsertChannel: c => q(sb.from('channels').upsert(c).select().single()),
    deleteChannel: id => q(sb.from('channels').delete().eq('id', id)),
    articles: () => q(sb.from('articles').select('*').order('created_at', { ascending: false })),
    upsertArticle: a => q(sb.from('articles').upsert(a).select().single()),
    deleteArticle: id => q(sb.from('articles').delete().eq('id', id)),
    suggestions: () => q(sb.from('story_suggestions').select('*,user:profiles!story_suggestions_user_id_fkey(name,username)').order('created_at', { ascending: false })),
    updateSuggestion: (id, status) => q(sb.from('story_suggestions').update({ status }).eq('id', id)),
    newsletter: () => q(sb.from('newsletter').select('*').order('created_at', { ascending: false })),
    removeSubscriber: email => q(sb.from('newsletter').delete().eq('email', email)),
    settings: () => q(sb.from('site_settings').select('*').order('key')),
    saveSetting: (key, value) => q(sb.from('site_settings').upsert({ key, value, updated_at: new Date().toISOString() })),
    audit: () => q(sb.from('audit_log').select('*,actor:profiles!audit_log_actor_id_fkey(name,username)').order('created_at', { ascending: false }).limit(200)),
    companies: () => q(sb.from('companies').select('*').order('created_at', { ascending: false })),
    updateCompany: (id, patch) => q(sb.from('companies').update(patch).eq('id', id)),
    makers: (pid) => q(sb.from('product_makers').select('*,user:profiles!product_makers_user_id_fkey(name,username)').eq('product_id', pid)),
    notifyRequests: (pid) => q(sb.from('notify_requests').select('*', { count: 'exact', head: true }).eq('product_id', pid))
  }, { get: (t, k) => typeof t[k] === 'function' ? (...a) => { touched(); return t[k](...a); } : t[k] });  // admin edits skip preloads too

  window.API = API;
})();
