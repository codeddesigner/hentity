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
    [/^\/(studio|betas|beta-)/, 'studio', 'Beta tests'], [/^\/submit/, 'submissions', 'Submitting products'], [/^\/claim/, 'claims', 'Claiming profiles'], [/^\/radar/, 'radar', 'On the radar']];
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

  function err(e) { if (e) { const m = e.message || String(e); const x = new Error({ WEEK_FULL: 'WEEK_FULL', DAY_FULL: 'DAY_FULL', DAY_PAST: 'Pick a launch day from tomorrow onwards', DAY_TOO_OLD: 'Launch days go back up to a year', DAY_TOO_FAR: 'Launch days open up to 5 weeks ahead' }[m] || m); x.code = e.code; throw x; } }
  async function q(promise) { const { data, error, count } = await promise; err(error); return count !== undefined && count !== null && data === null ? count : data; }
  const uid = () => session && session.user.id;
  function requireAuth(next) {
    if (!uid()) { location.href = '/signin?next=' + encodeURIComponent(next || location.pathname + location.search); throw new Error('AUTH_REQUIRED'); }
  }

  const PROFILE_PUBLIC = 'id,username,name,headline,bio,country,city,website,x,linkedin,avatar_url,avatar_color,role,is_verified,banned,is_seed,settings,interests,deletion_requested_at,username_changed_at,created_at';
  const BETA_COLS = 'id,product_id,owner_id,title,why,steps,countries,platforms,requirements,questions,spots,closes_at,test_start,test_end,time_needed,access_methods,nda,perk_type,perk,airtime_amount,funding,nudged_at,status,slug,form,agreement,access,settings,opens,signed_count,completed_at,room_id,applied_count,accepted_count,feedback_count,created_at,product:products(id,slug,name,tagline,color,logo_url,verified,week_id,status,upvote_count),owner:profiles!betas_owner_id_fkey(id,name,username,avatar_url,avatar_color)';
  const PRODUCT_COLS = 'id,slug,name,tagline,description,website,color,logo_url,media,video_url,categories,country,city,countries,pay_methods,currencies,languages,platforms,stage,status,effective_status,week_id,featured,promoted,verified,upvote_count,comment_count,follower_count,click_count,view_count,owner_id,company_id,created_at,submitted_at,week_starts_at,week_ends_at,launch_date,testers_wanted,active,inactive_note';

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
      let s = sb.from('product_feed').select(PRODUCT_COLS).eq('week_id', week).eq('effective_status', 'live');   // a product appears from 06:00 WAT on its launch day
      if (country && country !== 'all') s = s.eq('country', country);
      if (pay) s = s.contains('pay_methods', [pay]);
      const rows = await q(s.order('upvote_count', { ascending: false }).limit(limit || 60));
      return rows;
    },
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
      if (term) s = s.or(`name.ilike.%${term}%,tagline.ilike.%${term}%,city.ilike.%${term}%`);
      const order = sort === 'az' ? ['name', true] : sort === 'new' ? ['created_at', false] : sort === 'votes' ? ['upvote_count', false] : ['follower_count', false];
      return q(s.order(order[0], { ascending: order[1] }).order('upvote_count', { ascending: false }).limit(1000));
    },
    alternatives: (p) => pre('alts:' + p.id, () => q(sb.from('product_feed').select('id,slug,name,tagline,color,country,logo_url').in('status', ['scheduled', 'live']).overlaps('categories', p.categories || []).neq('id', p.id).limit(3))),

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
    trackView: pid => sb.rpc('track_view', { p: pid }),
    upvotedBy: (userId) => q(sb.from('upvotes').select('product_id,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(30)),
    votesByDay: (pid) => q(sb.from('upvotes').select('created_at').eq('product_id', pid).gte('created_at', new Date(Date.now() - 8 * 864e5).toISOString())),

    // ---------------- comments
    comments: ({ product, article }) => pre(product ? 'comments:p:' + product : 'comments:a:' + article, () => q(sb.from('comments').select('id,body,created_at,parent_id,deleted,user:profiles!comments_user_id_fkey(id,username,name,avatar_url,avatar_color)').eq(product ? 'product_id' : 'article_id', product || article).order('created_at'))),
    recentComments: () => pre('recent', () => q(sb.from('comments').select('created_at,product:products(name),article:articles(title),user:profiles!comments_user_id_fkey(name,city,username,avatar_url,avatar_color)').eq('deleted', false).order('created_at', { ascending: false }).limit(5))),
    async comment({ product, article, parent, body }) { requireAuth(); touched(); return q(sb.from('comments').insert({ product_id: product || null, article_id: article || null, parent_id: parent || null, body, user_id: uid() }).select('id,body,created_at,parent_id,deleted,user:profiles!comments_user_id_fkey(id,username,name,avatar_url,avatar_color)').single()); },
    deleteComment: id => (touched(), q(sb.from('comments').update({ deleted: true, body: '[deleted]' }).eq('id', id))),
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
    // Validate an idea (Figma: Validate)
    // Find (roles, people open to work, mutual interest, matches)
    editState: slug => q(sb.rpc('product_edit_state', { pslug: slug })),
    requestEdit: (pid, changes, msg) => q(sb.rpc('product_edit_request', { pid, changes, msg: msg || '' })),
    withdrawEdit: eid => q(sb.rpc('product_edit_withdraw', { eid })),
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
    radar: (status, { q: term, cc, from } = {}) => { let s = sb.from('radar').select('*').eq('status', status || 'review'); if (term) s = s.or(`name.ilike.%${term.replace(/[%,()]/g, '')}%,website.ilike.%${term.replace(/[%,()]/g, '')}%`); if (cc) s = s.eq('country', cc); return q(s.order('confidence', { ascending: false }).order('created_at', { ascending: false }).range(from || 0, (from || 0) + 199)); },
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

    // ---------------- realtime
    // How many people have this page open right now (Supabase presence; no database writes)
    here(room, cb) {
      let key; try { key = sessionStorage.getItem('hentity.pk') || Math.random().toString(36).slice(2); sessionStorage.setItem('hentity.pk', key); } catch (e) { key = Math.random().toString(36).slice(2); }
      const ch = sb.channel('here:' + room, { config: { presence: { key } } });
      ch.on('presence', { event: 'sync' }, () => { try { cb(Object.keys(ch.presenceState()).length); } catch (e) {} });
      ch.subscribe(st => { if (st === 'SUBSCRIBED') ch.track({ at: Date.now() }).catch(() => {}); });
      return () => sb.removeChannel(ch);
    },
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
    products: ({ status, term } = {}) => { let s = sb.from('product_feed').select(PRODUCT_COLS + ',updated_at,review_note,review_items,intro,verify,support_pledge,owner:profiles!products_owner_id_fkey(id,name,username)'); if (status && status !== 'all') s = status === 'live' ? s.eq('effective_status', 'live') : s.eq('status', status); if (term) s = s.or(`name.ilike.%${term}%,slug.ilike.%${term}%`); return q(s.order('updated_at', { ascending: false }).limit(200)); },
    emailStats: () => q(sb.rpc('admin_email_stats')),
    emailPreview: () => q(sb.rpc('email_preview_all')),
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
