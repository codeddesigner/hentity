// Product analytics collector: hentity.com/api/t
// Pages post small batches of events here (seen in a list, opened a page, clicked a button). This adds the
// visitor's city and country from the hosting edge and the device type, then records them through the
// track_events database function, passing the member's own session when they're signed in.
const SB = 'https://sislzikhjapilksictxd.supabase.co';
const KEY = 'sb_publishable_49iWYS0Wr9kVY_PfDQphww_jj9dRaBz';
const dec = s => { try { return decodeURIComponent(s || ''); } catch (e) { return s || ''; } };

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body); } catch (e) { body = null; }
  const evs = body && Array.isArray(body.e) ? body.e.slice(0, 60) : [];
  if (!evs.length) { res.statusCode = 204; return res.end(); }
  const ua = String(req.headers['user-agent'] || '');
  if (/bot|crawl|spider|slurp|preview|headless|lighthouse/i.test(ua)) { res.statusCode = 204; return res.end(); }
  const device = /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? 'phone' : 'computer';
  const city = dec(req.headers['x-vercel-ip-city']).slice(0, 60) || null;
  const country = String(req.headers['x-vercel-ip-country'] || '').slice(0, 2) || null;
  const token = typeof body.a === 'string' && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(body.a) ? body.a : null;
  try {
    const r = await fetch(`${SB}/rest/v1/rpc/track_events`, {
      method: 'POST',
      headers: Object.assign({ apikey: KEY, 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
      body: JSON.stringify({ evs, city, country, device })
    });
    // An expired session shouldn't lose the events: retry once as a guest
    if (r.status === 401 && token) await fetch(`${SB}/rest/v1/rpc/track_events`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ evs, city, country, device }) });
  } catch (e) { /* analytics must never break a page */ }
  res.statusCode = 204; res.end();
};
