/* In-memory stand-in for supabase-js, used only by local Playwright tests (served in place of the CDN bundle). */
(function () {
  const D = window.__FIXTURE__;
  const T = {};
  Object.keys(D).forEach(k => T[k] = (D[k] || []).map(r => Object.assign({}, r)));
  ['upvotes', 'follows', 'bookmarks', 'notify_requests', 'notifications', 'channel_members', 'reactions', 'reports', 'newsletter', 'story_suggestions', 'audit_log', 'blocks'].forEach(k => T[k] = T[k] || []);
  const ME = '11111111-1111-4111-8111-111111111111';
  const signedIn = localStorage.getItem('mock.signedIn') === '1';
  if (!T.profiles.find(p => p.id === ME)) T.profiles.push({ id: ME, username: 'chidera', name: 'Chidera Okeke', email: 'encircode@gmail.com', role: localStorage.getItem('mock.role') || 'admin', country: 'NG', city: 'Lagos', headline: 'Founder', bio: '', website: '', x: '', linkedin: '', settings: { showUpvotes: true, showCity: true, liveFeed: false, indexable: true, notif: {} }, created_at: new Date().toISOString() });
  T.notifications.push({ id: 'n1', user_id: ME, type: 'review', grp: 'launches', title: '<b>Ledgerline for Accountants</b> was approved and booked for the week of 16 Nov.', body: 'Review', link: '/scheduled', action_label: 'View schedule', read_at: null, created_at: new Date(Date.now() - 2 * 36e5).toISOString() });
  T.notifications.push({ id: 'n2', user_id: ME, type: 'follow', grp: 'followers', title: '<b>Thandi Bhengu</b> started following you.', body: 'Followers', link: '/makers/thandi', action_label: 'Follow back', actor_id: '00000000-0000-4000-a000-000000000006', read_at: null, created_at: new Date(Date.now() - 864e5).toISOString() });
  T.products.filter(p => p.slug === 'momo-parser' || p.slug === 'ledgerline-for-accountants').forEach(p => p.owner_id = ME);
  T.channels.forEach(c => { if (c.kind !== 'dm') T.channel_members.push({ channel_id: c.id, user_id: ME, last_read_at: new Date(Date.now() - 3 * 36e5).toISOString() }); });
  const weekOf = id => T.weeks.find(w => w.id === id);
  function feed() { return T.products.map(p => { const w = weekOf(p.week_id); return Object.assign({}, p, { effective_status: p.status === 'scheduled' && w && new Date(w.starts_at) <= new Date() ? 'live' : p.status, week_starts_at: w && w.starts_at, week_ends_at: w && w.ends_at }); }); }
  const FK = { user: 'user_id', product: 'product_id', owner: 'owner_id', actor: 'actor_id', channel: 'channel_id', reporter: 'reporter_id', article: 'article_id', blocked: 'blocked_id' };
  function parseEmbeds(sel) {
    const out = []; const re = /(\w+):(\w+)(?:!(\w+))?\(([^()]*)\)|(\w+)\(([^()]*)\)/g; let m;
    while ((m = re.exec(sel || ''))) { if (m[1]) out.push({ alias: m[1], table: m[2], fk: m[3] }); else out.push({ alias: m[5], table: m[5], reverse: true }); }
    return out;
  }
  function attach(rows, sel, table) {
    const emb = parseEmbeds(sel);
    return rows.map(r => {
      const o = Object.assign({}, r);
      emb.forEach(e => {
        if (e.reverse) { o[e.alias] = (T[e.table] || []).filter(x => x[table.replace(/s$/, '') + '_id'] === r.id); return; }
        let col = e.fk ? e.fk.replace(table + '_', '').replace(/^products_/, '').replace('_fkey', '') : FK[e.alias] || e.alias + '_id';
        const src = e.table === 'products' ? feed() : T[e.table] || [];
        o[e.alias] = src.find(x => x.id === r[col]) || null;
      });
      return o;
    });
  }
  function like(v, pat) { return new RegExp('^' + pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i').test(String(v ?? '')); }
  function orFilter(expr) {
    const parts = expr.split(/,(?![^(]*\))/);
    return r => parts.some(p => { const [col, op, ...rest] = p.split('.'); const v = rest.join('.'); if (op === 'eq') return String(r[col]) === v; if (op === 'ilike') return like(r[col], v); if (op === 'is') return r[col] == null; return false; });
  }
  class Q {
    constructor(table) { this.t = table; this.f = []; this.op = 'select'; this.sel = '*'; this.ord = []; this.lim = null; this.one = null; this.headCount = false; }
    select(s, o) { if (this.op === 'select') this.sel = s || '*'; else this.retSel = s || '*'; if (o && o.head) this.headCount = true; return this; }
    eq(c, v) { this.f.push(r => r[c] === v || String(r[c]) === String(v)); return this; }
    neq(c, v) { this.f.push(r => r[c] !== v); return this; }
    in(c, vs) { this.f.push(r => vs.includes(r[c])); return this; }
    is(c, v) { this.f.push(r => (r[c] ?? null) === v); return this; }
    gt(c, v) { this.f.push(r => r[c] > v); return this; } gte(c, v) { this.f.push(r => r[c] >= v); return this; }
    lt(c, v) { this.f.push(r => r[c] < v); return this; } lte(c, v) { this.f.push(r => r[c] <= v); return this; }
    ilike(c, v) { this.f.push(r => like(r[c], v)); return this; }
    or(e) { this.f.push(orFilter(e)); return this; }
    contains(c, v) { this.f.push(r => v.every(x => (r[c] || []).includes(x))); return this; }
    overlaps(c, v) { this.f.push(r => v.some(x => (r[c] || []).includes(x))); return this; }
    order(c, o) { this.ord.push([c, !o || o.ascending !== false]); return this; }
    limit(n) { this.lim = n; return this; }
    maybeSingle() { this.one = 'maybe'; return this; } single() { this.one = 'single'; return this; }
    insert(v) { this.op = 'insert'; this.val = v; return this; } upsert(v) { this.op = 'upsert'; this.val = v; return this; }
    update(v) { this.op = 'update'; this.val = v; return this; } delete() { this.op = 'delete'; return this; }
    then(res, rej) { try { res(this.run()); } catch (e) { res({ data: null, error: { message: e.message } }); } }
    rows() { return this.t === 'product_feed' ? feed() : (T[this.t] = T[this.t] || []); }
    run() {
      const all = this.rows();
      if (this.op === 'insert' || this.op === 'upsert') {
        const vals = (Array.isArray(this.val) ? this.val : [this.val]).map(v => Object.assign({ id: crypto.randomUUID(), created_at: new Date().toISOString() }, v));
        if (this.t === 'products') vals.forEach(v => Object.assign(v, { status: v.status || 'draft', upvote_count: 0, comment_count: 0, follower_count: 0, media: v.media || [], categories: v.categories || [], pay_methods: v.pay_methods || [] }));
        if (this.t === 'upvotes') vals.forEach(v => { const p = T.products.find(x => x.id === v.product_id); if (p) p.upvote_count++; });
        if (this.t === 'messages') vals.forEach(v => { v.reply_count = 0; if (v.parent_id) { const pm = T.messages.find(m => m.id === v.parent_id); if (pm) { pm.reply_count++; pm.last_reply_at = v.created_at; } } });
        T[this.t].push(...vals);
        const out = attach(vals, this.retSel, this.t);
        return { data: this.one ? out[0] : out, error: null };
      }
      let rows = all.filter(r => this.f.every(f => f(r)));
      if (this.op === 'update') { rows.forEach(r => Object.assign(r, this.val)); const src = this.t === 'product_feed' ? T.products : null; const out = attach(rows, this.retSel, this.t); return { data: this.one ? out[0] || null : out, error: null }; }
      if (this.op === 'delete') { if (this.t === 'upvotes') rows.forEach(v => { const p = T.products.find(x => x.id === v.product_id); if (p) p.upvote_count--; }); T[this.t] = all.filter(r => !rows.includes(r)); return { data: null, error: null }; }
      if (this.headCount) return { data: null, count: rows.length, error: null };
      this.ord.slice().reverse().forEach(([c, asc]) => rows.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)));
      if (this.lim) rows = rows.slice(0, this.lim);
      rows = attach(rows, this.sel, this.t === 'product_feed' ? 'products' : this.t);
      if (this.one) { if (this.one === 'single' && !rows[0]) return { data: null, error: { message: 'No rows' } }; return { data: rows[0] || null, error: null }; }
      return { data: rows, error: null };
    }
  }
  const authListeners = [];
  const sess = () => signedIn ? { user: { id: ME, email: 'encircode@gmail.com', identities: [{ provider: 'email' }] }, access_token: 'x' } : null;
  const RPC = {
    week_slots: () => T.weeks.filter(w => new Date(w.ends_at) > new Date()).slice(0, 6).map(w => Object.assign({}, w, { taken: T.products.filter(p => p.week_id === w.id && ['review', 'scheduled', 'live'].includes(p.status)).length })),
    admin_stats: () => ({ users: 42, users_week: 9, products: T.products.length, live: 13, review: T.products.filter(p => p.status === 'review').length, scheduled: 3, upvotes_week: 5210, comments_week: 230, messages_week: 410, reports_open: 2, subscribers: 312, suggestions: 3, signups_by_day: Array.from({ length: 14 }, (_, i) => ({ d: i, n: 2 + (i * 7) % 9 })), votes_by_day: Array.from({ length: 14 }, (_, i) => ({ d: i, n: 200 + (i * 53) % 400 })) }),
    work_email_ok: (a) => !/@(gmail|yahoo|outlook|hotmail)\./.test(a.e) || a.e === 'encircode@gmail.com', my_profile: () => localStorage.getItem('mock.signedIn') ? T.profiles.filter(p => p.id === ME) : [], admin_users: (a) => T.profiles.filter(p => !a.ids || a.ids.includes(p.id)).filter(p => !a.term || (p.name + p.username).toLowerCase().includes(a.term.toLowerCase())), open_dm: () => T.channels[0].id, export_my_data: () => ({ profile: {} }), admin_broadcast: () => 42
  };
  window.supabase = {
    createClient() {
      return {
        from: t => new Q(t),
        rpc: (n, a) => Promise.resolve({ data: RPC[n] ? RPC[n](a) : null, error: null }),
        auth: {
          getSession: async () => ({ data: { session: sess() } }),
          onAuthStateChange: fn => { authListeners.push(fn); return { data: { subscription: { unsubscribe() {} } } }; },
          signInWithPassword: async ({ password }) => { if (password !== 'hentity2026') return { error: { message: 'Invalid login credentials' } }; localStorage.setItem('mock.signedIn', '1'); return { error: null }; },
          signUp: async () => ({ data: { user: { id: ME } }, error: null }),
          // Passwordless mock: any code works except 000000; unknown sign-in emails are rejected like Supabase does
          signInWithOtp: async ({ email, options }) => (!options.shouldCreateUser && !/ledgerline|hentity|encircode/.test(email) ? { error: { message: 'Signups not allowed for otp' } } : { error: null }),
          verifyOtp: async ({ token }) => { if (token === '000000') return { error: { message: 'Token has expired or is invalid' } }; localStorage.setItem('mock.signedIn', '1'); authListeners.forEach(f => f('SIGNED_IN', sess())); return { error: null }; },
          mfa: { listFactors: async () => ({ data: { totp: [] } }), getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } }), enroll: async () => ({ data: null, error: { message: 'mock' } }) },
          signOut: async () => { localStorage.removeItem('mock.signedIn'); return { error: null }; },
          resend: async () => ({ error: null }), resetPasswordForEmail: async () => ({ error: null }), updateUser: async () => ({ error: null }),
          signInWithOAuth: async () => ({ error: { message: 'Unsupported provider: provider is not enabled' } }),
          unlinkIdentity: async () => ({ error: null }), linkIdentity: async () => ({ error: null })
        },
        storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: p => ({ data: { publicUrl: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22/>' } }) }) },
        channel: () => { const c = { on: () => c, subscribe: (cb) => { cb && cb('SUBSCRIBED'); return c; }, track: async () => {}, send: async () => {}, presenceState: () => ({}) }; return c; },
        removeChannel: () => {}
      };
    }
  };
})();
