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
  // launch days for scheduled/live products (local tests only)
  (function () { T.products.forEach((p, i) => { const w = T.weeks.find(x => x.id === p.week_id); if (w && ['scheduled', 'live'].includes(p.status)) { const d = new Date(new Date(w.starts_at).getTime() + 3600e3 + (i % 3) * 864e5); p.launch_date = d.toISOString().slice(0, 10); } }); })();
  // ---- unclaimed profiles (local tests only)
  (function seedUnclaimed() {
    const fact = (key, label, value, source, url, date) => ({ key, label, value, source, url, date });
    const mk = (id, slug, name, tagline, website, country, city, cat, color, facts, news, extra) => Object.assign({ id, slug, name, tagline, website, country, city, categories: [cat], color, status: 'unclaimed', owner_id: null, week_id: null, media: [], pay_methods: [], countries: [country], stage: '', upvote_count: 0, comment_count: 0, follower_count: 212, click_count: 0, view_count: 1840, verified: false, featured: false, promoted: false, description: '', languages: '', platforms: '', currencies: '', created_at: new Date(Date.now() - 4 * 864e5).toISOString(), updated_at: new Date().toISOString(),
      claim: { facts, news, spotted_at: new Date(Date.now() - 4 * 864e5).toISOString(), checked_at: new Date(Date.now() - 2 * 864e5).toISOString(), sources: 5, contact_email: 'hello@' + website.replace(/^https?:\/\//, '') } }, extra || {});
    T.products.push(mk('u0000000-0000-4000-a000-000000000001', 'mazao-hub', 'Mazao Hub', 'Marketplace connecting smallholder farmers to buyers in Nairobi', 'https://mazaohub.co.ke', 'KE', 'Nairobi', 'Agriculture', '#16A34A', [
      fact('product', 'Product', 'Android app and USSD (*483*12#) for selling produce to Nairobi buyers', 'Google Play', 'https://play.google.com'),
      fact('funding', 'Funding', '$1.2M seed · October 2026', 'Disrupt Africa', 'https://disrupt-africa.com', '2026-10-14'),
      fact('investors', 'Investors', 'Savannah Fund, two angels', 'Disrupt Africa', 'https://disrupt-africa.com', '2026-10-14'),
      fact('company', 'Company', 'Mazao Hub Ltd · registered in Kenya', 'Business Registration Service', 'https://brs.go.ke'),
      fact('traction', 'Traction', '10,000+ Android installs', 'Google Play', 'https://play.google.com'),
      fact('hiring', 'Hiring', '3 open roles: Android, field sales, ops', 'mazaohub.co.ke/careers', 'https://mazaohub.co.ke/careers'),
      fact('founded', 'Founded', '2025', 'Business Registration Service', 'https://brs.go.ke'), fact('team', 'Team size', '11–50', 'mazaohub.co.ke/careers', 'https://mazaohub.co.ke/careers')],
      [{ title: 'Mazao Hub raises $1.2M to link Kenyan farmers with city buyers', source: 'Disrupt Africa', url: 'https://disrupt-africa.com', date: '2026-10-14' }, { title: 'The USSD apps keeping produce prices fair in Nairobi markets', source: 'TechCabal', url: 'https://techcabal.com', date: '2026-09-02' }]));
    T.products.push(mk('u0000000-0000-4000-a000-000000000002', 'sabi-logistics', 'Sabi Logistics', 'Same-day delivery for Lagos SMEs, booked on WhatsApp', 'https://sabilogistics.ng', 'NG', 'Lagos', 'Logistics', '#2563EB', [fact('cohort', 'Accelerator', 'Techstars Lagos cohort', 'Techstars Lagos cohort', 'https://techstars.com', '2026-10-01')], [], { follower_count: 41 }));
    T.products.push(mk('u0000000-0000-4000-a000-000000000003', 'agbe-farms', 'Agbe Farms', 'Cold storage you rent by the crate, in Ibadan markets', 'https://agbefarms.com', 'NG', 'Ibadan', 'Agriculture', '#15803D', [fact('company', 'Company', 'Agbe Farms Ltd', 'Nigeria company registry', 'https://cac.gov.ng', '2026-09-01')], [], { follower_count: 9 }));
    T.radar = [
      { id: 'r1', name: 'Duka Credit', website: 'https://dukacredit.co.ke', tagline: 'Kiosk inventory loans', country: 'KE', city: 'Nairobi', categories: ['Fintech'], confidence: 78, found_via: 'Google Play', contact_email: 'hello@dukacredit.co.ke', status: 'review', created_at: new Date(Date.now() - 864e5).toISOString(), checks: { africa: 'HQ Nairobi (Kenya BRS record)', product: 'Live Android app, 5k installs', unique: 'No domain or name match', personal: 'Business details only', logo: 'Generated monogram; real logo not found' },
        facts: [{ key: 'product', label: 'Product', value: 'Android app for kiosk inventory loans', source: 'Google Play', url: 'https://play.google.com' }, { key: 'traction', label: 'Traction', value: '5,000+ installs', source: 'Google Play', url: 'https://play.google.com' }, { key: 'company', label: 'Company', value: 'Duka Credit Ltd', source: 'Business Registration Service', url: 'https://brs.go.ke' }], news: [] },
      { id: 'r2', name: 'Kente Health', website: 'https://kentehealth.com', tagline: 'Clinic records for Accra pharmacies', country: 'GH', city: 'Accra', categories: ['Health'], confidence: 74, found_via: 'TechCabal', contact_email: '', status: 'review', created_at: new Date(Date.now() - 2 * 864e5).toISOString(), checks: {}, facts: [{ key: 'funding', label: 'Funding', value: 'Pre-seed', source: 'TechCabal', url: 'https://techcabal.com' }], news: [] },
      { id: 'r3', name: 'ZipCash', website: '', tagline: 'Transfers', country: 'NG', city: '', categories: ['Fintech'], confidence: 34, found_via: 'Community tip', contact_email: '', status: 'review', created_at: new Date().toISOString(), checks: {}, facts: [], news: [] }];
    T.claims = [{ id: 'cl9', product_id: 'u0000000-0000-4000-a000-000000000002', user_id: '00000000-0000-4000-a000-000000000006', role: 'founder', method: 'docs', status: 'review', note: 'Director under maiden name', docs: [{ path: 'x/cert.pdf', kind: 'certificate', name: 'CAC-certificate.pdf' }, { path: 'x/id.jpg', kind: 'id', name: 'passport.jpg' }], created_at: new Date(Date.now() - 5 * 36e5).toISOString() }]; T.removal_requests = [{ id: 'rr1', product_id: 'u0000000-0000-4000-a000-000000000003', name: 'Tunde', email: 'tunde@agbefarms.com', relation: 'Founder', reason: 'Not ready yet', status: 'open', created_at: new Date(Date.now() - 17 * 36e5).toISOString(), due_at: new Date(Date.now() + 31 * 36e5).toISOString() }];
    T.notify_requests = T.notify_requests || [];
  })();
  // ---- beta tests (local tests only)
  (function seedBetas() {
    const P = T.products, mineP = P.find(p => p.owner_id === ME) || P[0], other = P.filter(p => p.owner_id !== ME);
    const day = n => new Date(Date.now() + n * 864e5), iso = n => day(n).toISOString().slice(0, 10);
    const others = T.profiles.filter(x => x.id !== ME);
    T.betas = [
      { id: 'b0000001-0000-4000-8000-000000000001', product_id: other[0].id, owner_id: other[0].owner_id || others[0].id, title: 'Test our Moniepoint CSV import before launch', why: 'Half our customers moved from OPay to Moniepoint this year. We want 50 real traders to try it on their own statements.', steps: ['Install the beta', 'Import one month of Moniepoint statements', 'Check 10 transactions'], countries: ['NG', 'GH'], platforms: ['Android', 'Web'], requirements: ['Uses Moniepoint for business at least weekly'], questions: ['How often do you use Moniepoint for business?', 'How do you keep your books today?'], spots: 50, closes_at: day(4).toISOString(), test_start: iso(5), test_end: iso(12), time_needed: '20 min', access_methods: ['Play internal testing', 'Web link'], nda: true, perk_type: 'product', perk: '3 months of Pro', airtime_amount: 5000, funding: 'held', status: 'open', room_id: null, applied_count: 40, accepted_count: 32, feedback_count: 0, created_at: day(-2).toISOString() },
      { id: 'b0000002-0000-4000-8000-000000000002', product_id: other[1].id, owner_id: other[1].owner_id || others[1].id, title: 'Help us test our new Sheng and Twi voice models', why: 'We need native speakers.', steps: ['Open the web link', 'Record 5 sentences'], countries: [], platforms: ['Web', 'API'], requirements: [], questions: [], spots: 40, closes_at: day(6).toISOString(), test_start: iso(7), test_end: iso(14), time_needed: '30 min', access_methods: ['Web link'], nda: false, perk_type: 'product', perk: '$50 in API credit', airtime_amount: 1000, funding: 'held', status: 'open', applied_count: 18, accepted_count: 18, feedback_count: 0, created_at: day(-1).toISOString() },
      { id: 'b0000003-0000-4000-8000-000000000003', product_id: other[2].id, owner_id: other[2].owner_id || others[2].id, title: 'Pilot the queue screen in your clinic', why: '', steps: ['Install'], countries: ['RW', 'KE'], platforms: ['Web'], requirements: [], questions: [], spots: 12, closes_at: day(9).toISOString(), test_start: iso(10), test_end: iso(24), time_needed: 'A few days', access_methods: ['Web link'], nda: false, perk_type: 'product', perk: '6 months free', status: 'open', applied_count: 35, accepted_count: 12, feedback_count: 0, created_at: day(-3).toISOString() },
      { id: 'b0000004-0000-4000-8000-000000000004', product_id: mineP.id, owner_id: ME, title: 'Try our new USSD flow', why: 'We rebuilt it.', steps: ['Dial the code', 'Pay once', 'Tell us what broke'], countries: ['NG'], platforms: ['USSD / SMS', 'Android'], requirements: ['Has a Nigerian bank account'], questions: ['Which bank do you use?'], spots: 10, closes_at: day(3).toISOString(), test_start: iso(-1), test_end: iso(6), time_needed: '10 min', access_methods: ['Promo code'], nda: false, perk_type: 'product', perk: '1 year free', status: 'open', applied_count: 3, accepted_count: 1, feedback_count: 1, created_at: day(-4).toISOString() }
    ];
    T.beta_access = T.betas.map(b => ({ beta_id: b.id, links: [{ label: 'Web link', url: 'https://example.com/beta' }] }));
    T.beta_applications = [
      { id: 'a1', beta_id: 'b0000002-0000-4000-8000-000000000002', user_id: ME, answers: [], confirmed: [], device: 'MacBook Air', device_os: 'macOS', status: 'accepted', match_score: 2, match_total: 2, tasks_done: [1], created_at: day(-1).toISOString() },
      { id: 'a2', beta_id: 'b0000004-0000-4000-8000-000000000004', user_id: others[0].id, answers: [{ q: 'Which bank do you use?', a: 'GTBank and Opay' }], confirmed: ['Has a Nigerian bank account'], device: 'Tecno Spark 20', device_os: 'Android 13', status: 'applied', match_score: 3, match_total: 3, tasks_done: [], created_at: day(-1).toISOString() },
      { id: 'a3', beta_id: 'b0000004-0000-4000-8000-000000000004', user_id: others[1].id, answers: [{ q: 'Which bank do you use?', a: 'Access' }], confirmed: [], device: 'iPhone 12', device_os: 'iOS 17+', status: 'applied', match_score: 1, match_total: 3, tasks_done: [], created_at: day(-2).toISOString() },
      { id: 'a4', beta_id: 'b0000004-0000-4000-8000-000000000004', user_id: others[2].id, answers: [{ q: 'Which bank do you use?', a: 'Kuda' }], confirmed: ['Has a Nigerian bank account'], device: 'Infinix Hot 30', device_os: 'Android 13', status: 'accepted', match_score: 3, match_total: 3, tasks_done: [1, 2, 3], created_at: day(-3).toISOString() }
    ];
    T.beta_feedback = [{ id: 'f1', beta_id: 'b0000004-0000-4000-8000-000000000004', application_id: 'a4', user_id: others[2].id, ease: 4, verdict: 'mostly', details: 'Two transfers on 3 Oct came in as one. Reversal on 14 Oct shows as income.', extra: 'Please add Kuda next!', media: [], voice_url: null, quote_ok: true, tag: '', fixed: false, created_at: day(0).toISOString() }];
  })();
  // ---- beta studio (local tests only)
  (function studio() {
    T.betas.forEach((b, i) => Object.assign(b, { slug: ['moniepoint-csv', 'voice-models', 'clinic-queue', 'ussd-flow'][i] || 'beta-' + i, form: [], agreement: { legal_name: 'Demo Ltd', law: 'Nigeria', clauses: {} }, access: { web: true }, settings: { show_on_product: true, close_when_full: true, auto_accept: false }, opens: 120 + i, signed_count: 0 }));
    const b1 = T.betas[0]; b1.form = [{ id: 'q1', type: 'multi', q: 'Which mobile money apps do you use for business?', options: ['Moniepoint', 'OPay', 'PalmPay', 'MTN MoMo'], must: ['Moniepoint'], required: true }, { id: 'q2', type: 'choice', q: 'Roughly how many transactions a day?', options: ['Under 10', '10–50', '50+'], required: true }, { id: 'q3', type: 'short', q: 'How do you keep your books today?', required: false }, { id: 'q4', type: 'voice', q: 'Tell us about your business in 30 seconds', required: false }];
    T.beta_applications.forEach(a => { if (a.status === 'accepted') { a.signed_at = new Date(Date.now() - 864e5).toISOString(); a.signed_name = 'Signed Name'; a.full_name = a.full_name || ''; } });
    T.beta_links = [{ id: 'l1', beta_id: T.betas[3].id, code: 'balogun', label: 'WhatsApp · Balogun traders group', opens: 312 }];
    T.betas.push({ id: 'b0000005-0000-4000-8000-000000000005', product_id: T.betas[3].product_id, owner_id: ME, title: 'Help test Momo', why: '', steps: [], countries: [], platforms: [], requirements: [], questions: [], spots: 20, closes_at: new Date(Date.now() + 14 * 864e5).toISOString(), test_start: null, test_end: null, time_needed: '20 min', access_methods: [], nda: false, perk_type: 'none', perk: '', airtime_amount: 0, funding: 'none', status: 'draft', applied_count: 0, accepted_count: 0, feedback_count: 0, slug: 'momo-beta', form: [], agreement: {}, access: {}, settings: { show_on_product: true, close_when_full: true }, opens: 0, signed_count: 0, created_at: new Date().toISOString() });
    T.beta_access.push({ beta_id: 'b0000005-0000-4000-8000-000000000005', links: [], config: {} });
    T.beta_codes = [];
    T.beta_access.forEach(x => x.config = { web_url: 'https://app.example.com/beta' });
  })();
  const weekOf = id => T.weeks.find(w => w.id === id);
  function feed() { return T.products.map(p => { const w = weekOf(p.week_id); return Object.assign({}, p, { testers_wanted: (T.betas || []).some(b => b.product_id === p.id && b.status === 'open' && new Date(b.closes_at) > new Date()), effective_status: p.status === 'scheduled' && (p.launch_date ? new Date(p.launch_date + 'T05:00:00Z') <= new Date() : w && new Date(w.starts_at) <= new Date()) ? 'live' : p.status, week_starts_at: w && w.starts_at, week_ends_at: w && w.ends_at }); }); }
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
    range(a, b) { this.lim = b - a + 1; return this; }
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
        if (this.t === 'betas') vals.forEach(v => Object.assign(v, Object.assign({ why: '', steps: [], countries: [], platforms: [], requirements: [], questions: [], form: [], agreement: {}, access: {}, settings: { show_on_product: true, close_when_full: true }, opens: 0, signed_count: 0, applied_count: 0, accepted_count: 0, feedback_count: 0, airtime_amount: 0, perk: '', time_needed: '20 min', owner_id: ME, slug: 'new-beta-' + (T.betas.length + 1) }, v)));
        if (this.t === 'beta_applications') vals.forEach(v => Object.assign(v, { status: 'applied', match_score: 3, match_total: 3, tasks_done: [] }));
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
  const sess = () => localStorage.getItem('mock.signedIn') === '1' ? { user: { id: ME, email: 'encircode@gmail.com', identities: [{ provider: 'email' }] }, access_token: 'x' } : null;
  const RPC = {
    week_slots: () => T.weeks.filter(w => new Date(w.ends_at) > new Date()).slice(0, 6).map(w => Object.assign({}, w, { taken: T.products.filter(p => p.week_id === w.id && ['review', 'scheduled', 'live'].includes(p.status)).length })),
    admin_stats: () => ({ users: 42, users_week: 9, products: T.products.length, live: 13, review: T.products.filter(p => p.status === 'review').length, scheduled: 3, upvotes_week: 5210, comments_week: 230, messages_week: 410, reports_open: 2, subscribers: 312, suggestions: 3, signups_by_day: Array.from({ length: 14 }, (_, i) => ({ d: i, n: 2 + (i * 7) % 9 })), votes_by_day: Array.from({ length: 14 }, (_, i) => ({ d: i, n: 200 + (i * 53) % 400 })) }),
    day_slots: a => { const out = []; for (let d = new Date(a.d1 + 'T12:00:00Z'); d.toISOString().slice(0, 10) <= a.d2; d.setUTCDate(d.getUTCDate() + 1)) { const day = d.toISOString().slice(0, 10); const ps = T.products.filter(p => p.launch_date === day && ['review', 'scheduled', 'live'].includes(p.status)); out.push({ day, taken: ps.length + (day.endsWith('7') ? 6 - ps.length : 0), capacity: 6, launches: ps.filter(p => p.status !== 'review').map(p => ({ name: p.name, color: p.color, logo_url: p.logo_url })) }); } return out; },
    beta_set_payout: a => { T.beta_payouts = T.beta_payouts || []; T.beta_payouts.push({ application_id: a.app, phone: a.phone, network: a.network, status: 'pending' }); return null; },
    my_beta_payout: a => { const o = (T.beta_payouts || []).find(x => x.application_id === a.app); return o ? { masked: o.phone.slice(0, 7) + ' ••• ' + o.phone.slice(-4), network: o.network, amount: 1000, status: o.status } : null; },
    beta_nudge: () => 1,
    insights: a => { const P = T.products.filter(p => ['live','scheduled'].includes(p.status) && (!a.cc || p.country === a.cc)); const cnt = f => { const m = {}; P.forEach(p => [].concat(f(p)).forEach(k => k && (m[k] = (m[k] || 0) + 1))); return m; }; const heat = {}; P.forEach((p, i) => { const d = new Date(Date.now() - (i * 9 % 300) * 864e5).toISOString().slice(0, 10); heat[d] = (heat[d] || 0) + 1 + (i % 4); }); const cities = {}; P.forEach(p => { const k = p.city + '|' + p.country; cities[k] = (cities[k] || 0) + 1; });
      return { days: a.days, live: P.length, live_week: 3, launched: 9, launched_prev: 6, views: 4120, views_prev: 3300, cities: Object.keys(cities).length, cities_new: 1, heat, total: P.length,
        industries: Object.entries(cnt(p => p.categories)).map(([name, n], i) => ({ name, n, cur: i === 2 ? 3 : 1, prev: 1 })).sort((x, y) => y.n - x.n), countries: Object.entries(cnt(p => p.country)).map(([cc, n]) => ({ cc, n })).sort((x, y) => y.n - x.n),
        city_list: Object.entries(cities).map(([k, n]) => ({ city: k.split('|')[0], cc: k.split('|')[1], n, new: n > 1 ? 1 : 0 })).sort((x, y) => y.n - x.n), stages: Object.entries(cnt(p => p.stage || 'Pre-seed')).map(([stage, n]) => ({ stage, n })), raised: [] }; },
    validate_idea: a => { T.idea_checks = T.idea_checks || []; const P = T.products.filter(p => ['live', 'unclaimed', 'scheduled'].includes(p.status));
      const words = a.idea.toLowerCase().match(/[a-z]{4,}/g) || [];
      const M = P.map(p => { const txt = (p.tagline + ' ' + (p.description || '')).toLowerCase(); const sh = words.filter(w => txt.includes(w.slice(0, 5))); const sim = Math.min(99, Math.round(65 * Math.min(1, sh.length / 4) + ((p.categories || []).some(c => a.cats.includes(c)) ? 20 : 0) + 8)); return { id: p.id, slug: p.slug, name: p.name, tagline: p.tagline, city: p.city, country: p.country, status: p.status, categories: p.categories, color: p.color, logo_url: p.logo_url, followers: p.follower_count, upvotes: p.upvote_count, sim, shared: sh.slice(0, 3) }; }).filter(m => m.sim >= 36).sort((x, y) => y.sim - x.sim);
      const byc = {}; M.forEach(m => { const k = m.city + '|' + m.country; byc[k] = (byc[k] || 0) + 1; });
      const lvl = (n, a1, b1) => n >= a1 ? 'crowded' : n >= b1 ? 'some' : 'open';
      const L = { problem: lvl(M.length, 5, 1), customer: 'some', approach: lvl(M[0] ? M[0].sim : 0, 75, 55), market: lvl(M.filter(m => !a.cc || m.country === a.cc).length, 4, 1) };
      const score = Math.max(5, 100 - ({ crowded: 30, some: 15, open: 0 })[L.problem] - 7 - ({ crowded: 35, some: 18, open: 0 })[L.approach] - ({ crowded: 20, some: 10, open: 0 })[L.market]);
      const r = { id: 'ic' + (T.idea_checks.length + 1), user_id: ME, idea: a.idea, who: a.who, country: a.cc, city: a.city, money: a.money, stage: a.stage, categories: a.cats, score, tests: {}, shared: false, created_at: new Date().toISOString(),
        result: { score, levels: L, counts: { similar: M.length, customer: 1, market: M.filter(m => !a.cc || m.country === a.cc).length, city: M.filter(m => (m.city || '').toLowerCase() === (a.city || '').toLowerCase()).length, top: M[0] ? M[0].sim : 0, unclaimed: M.filter(m => m.status === 'unclaimed').length, live: M.filter(m => m.status !== 'unclaimed').length, followers: M.reduce((s, m) => s + (m.followers || 0), 0), checked: P.length },
          matches: M.slice(0, 8), cities: Object.entries(byc).map(([k, n]) => ({ city: k.split('|')[0], cc: k.split('|')[1], n })).sort((x, y) => y.n - x.n).slice(0, 6), words: [] } };
      T.idea_checks.unshift(r); return { id: r.id, score }; },
    claim_info: a => { const p = T.products.find(x => x.slug === a.s); if (!p) return null; const c = (T.claims || []).find(x => x.product_id === p.id && x.user_id === ME); return { product: Object.assign({}, p, { domain: (p.website || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*/, ''), facts: (p.claim || {}).facts || [] }), claim: c || null, taken: false, followers: p.follower_count, asks: 12 }; },
    claim_start: a => { const p = T.products.find(x => x.slug === a.s); const dom = (p.website || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*/, ''); if (a.m === 'email' && !(a.em || '').endsWith('@' + dom)) throw new Error('Use an email address ending in @' + dom); let c = T.claims.find(x => x.product_id === p.id && x.user_id === ME); if (!c) { c = { id: 'cl1', product_id: p.id, user_id: ME, status: 'started', created_at: new Date().toISOString() }; T.claims.push(c); } Object.assign(c, { role: a.r, method: a.m, email: a.em, code_sent_at: new Date().toISOString(), dns_token: a.m === 'dns' ? 'hentity-verify=3f9a1c0be27d4e5a8c61f0aa' : c.dns_token }); return c; },
    claim_verify_code: a => { const c = T.claims.find(x => x.id === a.cid); if (a.code !== '123456') return { status: 'wrong', left: 4 }; c.status = 'verified'; c.verified_at = new Date().toISOString(); return { status: 'verified', via: 'email' }; },
    claim_check_dns: a => { const c = T.claims.find(x => x.id === a.cid); c.n = (c.n || 0) + 1; if (c.n > 2) { c.status = 'verified'; return { status: 'verified', via: 'dns' }; } return { status: c.n > 1 ? 'not_found' : 'checking' }; },
    claim_submit_docs: a => { const c = T.claims.find(x => x.id === a.cid); c.status = 'review'; c.docs = a.files; return { status: 'review' }; },
    claim_publish: a => { const c = T.claims.find(x => x.id === a.cid); const p = T.products.find(x => x.id === c.product_id); p.status = 'live'; p.owner_id = ME; if (a.e.tagline) p.tagline = a.e.tagline; c.status = 'published'; return { slug: p.slug, told: 212, via: c.method }; },
    request_removal: () => null, claim_decide: a => { const c = T.claims.find(x => x.id === a.cid); if (c) c.status = a.ok ? 'verified' : 'rejected'; return null; },
    removal_decide: a => { const r = T.removal_requests.find(x => x.id === a.rid); r.status = a.remove ? 'removed' : 'declined'; return null; },
    radar_dupe: a => a.rid === 'r2' ? null : null,
    radar_publish: a => { const r = T.radar.find(x => x.id === a.rid); r.status = 'published'; return { slug: r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), id: 'x' }; },
    badge_info: a => ({ name: 'X', slug: a.s, upvotes: 212, live: true, week_rank: 1, week_over: true, week_label: '2 Nov', month_rank: 4, month_over: false, month: 'November 2026' }),
    badge_summary: () => ({ views: 18420, clicks: 1204, upvotes: 212 }), badge_hit: () => null,
    beta_track: a => { const b = T.betas.find(x => x.slug === a.s); if (b) b.opens++; return null; },
    beta_apply: a => { const b = T.betas.find(x => x.id === a.b); if (T.beta_applications.some(x => x.beta_id === a.b && x.user_id === ME)) throw new Error('You’ve already applied to this beta'); if (a.signed_name.toLowerCase() !== a.full_name.toLowerCase()) throw new Error('Type your full name exactly as above to sign'); const flags = (b.form || []).filter(q => (q.must || []).length && !(a.answers.find(x => x.id === q.id) || {}).a?.includes?.(q.must[0])).map(q => 'Didn’t pick ' + q.must.join(' or ')); const r = { id: crypto.randomUUID(), beta_id: a.b, user_id: ME, answers: a.answers, confirmed: [], device: a.device, device_os: a.device_os, status: b.settings.auto_accept && !flags.length ? 'accepted' : 'applied', flags, full_name: a.full_name, city: a.city, country: a.country, source: a.source, signed_at: new Date().toISOString(), signed_name: a.signed_name, sign_meta: { phone_tail: a.phone.slice(-4), agreement: b.agreement, product: 'Demo' }, match_score: 2, match_total: 2, tasks_done: [], created_at: new Date().toISOString() }; T.beta_applications.push(r); b.applied_count++; window.__applied = r; return { id: r.id, status: r.status, flags, signed_at: r.signed_at }; },
    beta_sign: a => { const r = T.beta_applications.find(x => x.id === a.app); r.signed_at = new Date().toISOString(); r.signed_name = a.signed_name; return r.signed_at; },
    my_beta_access: a => { const r = T.beta_applications.find(x => x.beta_id === a.b && x.user_id === ME); if (!r) return null; if (r.status !== 'accepted') return { state: r.status }; if (!r.signed_at) return { state: 'unsigned' }; const b = T.betas.find(x => x.id === a.b); return { state: 'ready', expires: b.test_end, web: b.access.web ? { url: 'https://hentity.com/go/b/abc123' } : undefined, android: b.access.android ? { optin: 'https://play.google.com/apps/testing/x', gmail: 'me@gmail.com' } : undefined, links: [] }; },
    beta_sources: a => [{ code: 'balogun', label: 'WhatsApp · Balogun traders group', opens: 312, applied: 2 }, { code: 'product', label: 'product', opens: null, applied: 1 }],
    beta_results: a => ({ opens: 1036, applied: 184, accepted: 50, signed: 48, used: 44, feedback: 41, ease: 4.2, worked: 89, top_tag: 'POS transfers merged', top_tag_n: 9, fixed: 3, paid: 205000, paid_n: 41, unused: 0 }),
    beta_remind_sign: () => 2, beta_set_access: () => null, beta_complete: a => { const b = T.betas.find(x => x.id === a.b); b.status = 'closed'; b.completed_at = new Date().toISOString(); return null; },
    admin_beta_payouts: () => [{ application_id: 'a1', beta_id: 'b0000002-0000-4000-8000-000000000002', beta_title: 'Help us test', product: 'Swahili Speech Kit', tester: 'Chidera Okeke', username: 'chidera', phone: '+2348030000000', network: 'MTN', amount: 1000, status: 'due' }],
    admin_mark_payout: () => null, admin_beta_funded: () => null,
    beta_stats: () => ({ paid: 5000, open: T.betas.filter(b => b.status === 'open').length, match: 2, testers_month: T.beta_applications.filter(a => a.status === 'accepted').length, perks: T.beta_feedback.length }),
    beta_reach: a => { const o = {}; T.profiles.forEach(p => { if (!a.cs.length || a.cs.includes(p.country)) o[p.country] = (o[p.country] || 0) + 1; }); return o; },
    beta_accept_best: a => { const b = T.betas.find(x => x.id === a.b); const pend = T.beta_applications.filter(x => x.beta_id === a.b && ['applied', 'waitlist'].includes(x.status)).sort((x, y) => y.match_score / y.match_total - x.match_score / x.match_total).slice(0, Math.max(0, Math.min(a.n, b.spots - b.accepted_count))); pend.forEach(x => { x.status = 'accepted'; b.accepted_count++; }); return pend.length; },
    beta_applicants: a => T.beta_applications.filter(x => x.beta_id === a.b).map(x => { const pr = T.profiles.find(p => p.id === x.user_id) || {}; return Object.assign({}, x, { name: pr.name, username: pr.username, avatar_url: pr.avatar_url, avatar_color: pr.avatar_color, country: pr.country, city: pr.city, email: x.status === 'accepted' ? pr.email : null, has_feedback: T.beta_feedback.some(f => f.application_id === x.id) }); }),
    beta_feedback_list: a => T.beta_feedback.filter(f => f.beta_id === a.b).map(f => { const pr = T.profiles.find(p => p.id === f.user_id) || {}; const ap = T.beta_applications.find(x => x.id === f.application_id) || {}; return Object.assign({}, f, { name: pr.name, username: pr.username, avatar_color: pr.avatar_color, country: pr.country, city: pr.city, device: ap.device, perk_released: true }); }),
    work_email_ok: (a) => !/@(gmail|yahoo|outlook|hotmail)\./.test(a.e) || a.e === 'encircode@gmail.com', my_badges: () => ({ notifications: 2, by_channel: {} }), my_profile: () => localStorage.getItem('mock.signedIn') ? T.profiles.filter(p => p.id === ME) : [], admin_users: (a) => T.profiles.filter(p => !a.ids || a.ids.includes(p.id)).filter(p => !a.term || (p.name + p.username).toLowerCase().includes(a.term.toLowerCase())), open_dm: () => T.channels[0].id, export_my_data: () => ({ profile: {} }), admin_broadcast: () => 42
  };
  window.supabase = {
    createClient() {
      return {
        from: t => new Q(t),
        rpc: (n, a) => { try { return Promise.resolve({ data: RPC[n] ? RPC[n](a) : null, error: null }); } catch (e) { return Promise.resolve({ data: null, error: { message: e.message } }); } },
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
        storage: { from: () => ({ upload: async () => ({ error: null }), createSignedUrl: async () => ({ data: { signedUrl: 'data:text/plain,doc' }, error: null }), getPublicUrl: p => ({ data: { publicUrl: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22/>' } }) }) },
        channel: () => { const c = { on: () => c, subscribe: (cb) => { cb && cb('SUBSCRIBED'); return c; }, track: async () => {}, send: async () => {}, presenceState: () => ({}) }; return c; },
        removeChannel: () => {}
      };
    }
  };
})();
