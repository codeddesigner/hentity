// For makers' apps: GET https://hentity.com/api/beta-invite?t=<invite> → {"ok":true,"tester":"Ngozi","beta":"…","expires":"2026-11-18"}
// Read-only check (doesn't count an open or a device). CORS is open so a web beta can call it from the browser.
const { openInvite } = require('./go.js');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  const t = String((req.query && req.query.t) || '').replace(/[^a-f0-9]/g, '').slice(0, 64);
  if (!t) { res.statusCode = 400; return res.end(JSON.stringify({ ok: false, reason: 'missing t' })); }
  try {
    const out = await openInvite(t, '', true);
    if (out && out.url !== undefined) delete out.url;
    res.statusCode = out && out.ok ? 200 : 403;
    return res.end(JSON.stringify(out));
  } catch (e) { res.statusCode = 502; return res.end(JSON.stringify({ ok: false, reason: 'unavailable' })); }
};
