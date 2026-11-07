// Public JSON API for Insights: GET /v1/insights?metric=startups&by=city&split=founding_team&category=Fintech&from=2024&to=2026
// Same engine and privacy rules as hentity.com/insights (only totals; groups under 5 come back as null when the founding team is involved).
const SB = 'https://sislzikhjapilksictxd.supabase.co';
const KEY = 'sb_publishable_49iWYS0Wr9kVY_PfDQphww_jj9dRaBz';
const F = { country: 'cc', city: 'city', category: 'cat', stage: 'stage', team: 'team', claimed: 'claimed', status: 'status', from: 'from', to: 'to' };
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const q = req.query || {};
  const f = {}; for (const [k, v] of Object.entries(F)) if (q[k]) f[v] = k === 'country' ? String(q[k]).toUpperCase().slice(0, 2) : String(q[k]).slice(0, 60);
  const body = { ds: String(q.metric || 'startups'), by: String(q.by || 'country'), split: q.split ? String(q.split) : null, f, measure: String(q.measure || 'count') };
  try {
    const r = await fetch(`${SB}/rest/v1/rpc/insights_explore`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) { res.statusCode = 400; return res.end(JSON.stringify({ error: j.message || 'Bad request', docs: 'https://hentity.com/insights?tab=explore' })); }
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
    res.end(JSON.stringify(Object.assign({ source: 'Hentity Insights', license: 'CC BY 4.0', url: 'https://hentity.com/insights', updated: new Date().toISOString() }, j), null, 2));
  } catch (e) { res.statusCode = 502; res.end(JSON.stringify({ error: 'Upstream error' })); }
};
