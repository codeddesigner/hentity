// Personal beta links: hentity.com/go/b/<token>. Counts the open, ties the link to this device (2 devices max,
// the 3rd revokes it), then sends the tester to the maker's web beta with ?invite=<token>.
const crypto = require('crypto');
const SB = 'https://sislzikhjapilksictxd.supabase.co';
const KEY = 'sb_publishable_49iWYS0Wr9kVY_PfDQphww_jj9dRaBz';

async function openInvite(t, dev, checkOnly) {
  const r = await fetch(`${SB}/rest/v1/rpc/beta_invite_open`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ t, dev, check_only: !!checkOnly }) });
  if (!r.ok) throw new Error('supabase ' + r.status);
  return r.json();
}
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} | Hentity</title><style>body{font-family:Inter,system-ui,sans-serif;background:#fafafa;color:#0a0a0a;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;box-sizing:border-box}main{max-width:420px;text-align:center}h1{font-size:24px;letter-spacing:-.02em;margin:0 0 8px}p{color:#555;line-height:1.5}a{color:#ff5a1f}</style></head><body><main><h1>${title}</h1><p>${body}</p><p><a href="https://hentity.com">Hentity</a></p></main></body></html>`;

module.exports = async (req, res) => {
  const t = String((req.query && req.query.t) || '').replace(/[^a-f0-9]/g, '').slice(0, 64);
  res.setHeader('Cache-Control', 'no-store');
  if (!t) { res.statusCode = 404; return res.end(page('Link not found', 'Check the link in your beta email.')); }
  const cookies = Object.fromEntries(String(req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]));
  let dev = (cookies.hb_dev || '').replace(/[^a-f0-9]/g, '').slice(0, 32);
  if (!dev) { dev = crypto.randomBytes(16).toString('hex'); res.setHeader('Set-Cookie', `hb_dev=${dev}; Path=/go; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`); }
  try {
    const out = await openInvite(t, dev, false);
    if (out && out.ok && out.url) { res.statusCode = 302; res.setHeader('Location', out.url); return res.end(); }
    if (out && out.ok) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(page('Almost ready', 'The maker hasn’t added the web address yet. You’ll get an email when it’s ready.')); }
    res.statusCode = 410; res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const why = out && out.reason;
    return res.end(page('This link has stopped working', why === 'Opened on 3+ devices' ? 'It was opened on more than two devices, so it was switched off to keep the beta private. Ask the makers to restore it.' : why === 'Beta ended' ? 'The beta has ended. Thanks for testing!' : 'Your access was turned off. If this is a mistake, contact the makers.'));
  } catch (e) {
    res.statusCode = 502; res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(page('Try again in a moment', 'We couldn’t check your link just now.'));
  }
};
module.exports.openInvite = openInvite;
