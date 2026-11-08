// Web Push sender. The database calls this (pg_net, from the notifications trigger) with the recipient's
// device subscriptions and the message; we encrypt it for each device (RFC 8291, aes128gcm) and sign the
// request with our VAPID key (RFC 8292), using only Node's crypto. Devices that are gone (404/410) are
// reported back to the database so they stop being tried.
// No environment variables: the keys live in Supabase Vault (067_push_keys.sql).
//   GET  /api/push   the public key browsers subscribe with (created on first use, never replaced)
//   POST /api/push   from the notifications trigger, with the vault push_secret; the signing key is read with it
const crypto = require('crypto');
const SB = 'https://sislzikhjapilksictxd.supabase.co';
const KEY = 'sb_publishable_49iWYS0Wr9kVY_PfDQphww_jj9dRaBz';
const b64u = b => Buffer.from(b).toString('base64url');
const unb64u = s => Buffer.from(String(s), 'base64url');

function vapidKey(pub, priv) {
  const p = unb64u(pub);
  return crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: priv, x: b64u(p.subarray(1, 33)), y: b64u(p.subarray(33, 65)) }, format: 'jwk' });
}
function vapidAuth(endpoint, pub, key, subject) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${pub}`;
}
// RFC 8291: one record, aes128gcm
function encrypt(payload, p256dh, authSecret) {
  const ua = unb64u(p256dh), auth = unb64u(authSecret);
  const as = crypto.createECDH('prime256v1'); as.generateKeys();
  const asPub = as.getPublicKey();
  const shared = as.computeSecret(ua);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub]), 32));
  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, ct]);
}

async function send(sub, msg, env, key) {
  const body = encrypt(JSON.stringify(msg), sub.p256dh, sub.auth);
  const r = await fetch(sub.endpoint, { method: 'POST', body, headers: {
    'Content-Type': 'application/octet-stream', 'Content-Encoding': 'aes128gcm', TTL: '86400', Urgency: msg.urgent ? 'high' : 'normal',
    ...(msg.tag ? { Topic: String(msg.tag).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'hentity' } : {}),
    Authorization: vapidAuth(sub.endpoint, env.VAPID_PUBLIC_KEY, key, env.VAPID_SUBJECT || 'mailto:hello@hentity.com') } });
  return r.status;
}

const rpc = (fn, args) => fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) })
  .then(r => r.ok ? r.json() : null).catch(() => null);

// First run: make the key pair here, store it in Vault, and from then on read it back
async function publicKey() {
  let pub = await rpc('push_vapid');
  if (pub) return pub;
  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  const d = e.getPrivateKey();   // always store 32 bytes (a leading zero byte can be dropped)
  await rpc('push_vapid_init', { pub: b64u(e.getPublicKey()), priv: b64u(Buffer.concat([Buffer.alloc(32 - d.length), d])) });
  return rpc('push_vapid');      // whoever stored first wins
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const key = await publicKey();
    if (!key) { res.status(503).json({ error: 'Push is not set up yet' }); return; }
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    res.status(200).json({ key });
    return;
  }
  if (req.method !== 'POST') { res.status(405).end(); return; }
  const secret = req.headers['x-push-secret'];
  const keys = secret ? await rpc('push_keys', { secret }) : null;
  if (!keys || !keys.pub || !keys.priv) { res.status(401).end(); return; }
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const subs = Array.isArray(b.subs) ? b.subs.slice(0, 20) : [];
  const msg = { title: String(b.title || 'Hentity').slice(0, 120), body: String(b.body || '').slice(0, 300), url: String(b.url || '/notifications').slice(0, 500),
    tag: b.tag ? String(b.tag).slice(0, 64) : undefined, badge: Number.isFinite(+b.badge) ? +b.badge : undefined, icon: b.icon || undefined, urgent: !!b.urgent };
  const env = { VAPID_PUBLIC_KEY: keys.pub, VAPID_SUBJECT: 'mailto:hello@hentity.com' };
  const key = vapidKey(keys.pub, keys.priv);
  const results = await Promise.all(subs.map(s => send(s, msg, env, key).catch(() => 0)));
  const gone = subs.filter((s, i) => results[i] === 404 || results[i] === 410).map(s => s.endpoint);
  const ok = subs.filter((s, i) => results[i] >= 200 && results[i] < 300).map(s => s.endpoint);
  const bid = /^[0-9a-f-]{36}$/.test(String(b.bid || '')) ? b.bid : null;
  if (gone.length || ok.length) await rpc('push_result', { secret, gone, ok, bid });
  res.status(200).json({ sent: ok.length, gone: gone.length, failed: subs.length - ok.length - gone.length, codes: results });
};
module.exports._test = { encrypt, vapidAuth, vapidKey };
