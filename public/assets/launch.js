/* Launch flow state shared by /submit, /under-review, /changes-requested, /scheduled, /launch-week, /launch-recap */
(function () {
  const { icon, esc, store } = H;
  const DEFAULT = { name: 'Ledgerline', tagline: 'Bookkeeping that reads your mobile money statements', website: 'https://ledgerline.app', cats: ['Fintech', 'SaaS'], country: 'NG', city: 'Lagos', pay: ['Paystack', 'USSD'], week: 47, intro: '', support: false, status: 'draft', submittedAt: null, media: ['#0a0a0a', '#ff5b14', '#16a34a', '#2563eb'], video: 'https://youtu.be/ledgerline-demo', verify: { domain: true, company: false, founder: false } };
  function sub() { return Object.assign({}, DEFAULT, store.get('submission', {})); }
  function save(s) { store.set('submission', s); }
  const WEEKS = { 46: 'Nov 9–15', 47: 'Nov 16–22', 48: 'Nov 23–29', 49: 'Nov 30 – Dec 6' };
  function card(s, opts) {
    opts = opts || {};
    return `<div class="card lcard"><span class="plogo" style="background:#000">${esc((s.name || '?')[0].toUpperCase())}</span>
      <div class="grow stack gap-6"><p class="t-h4">${esc(s.name || 'Your product')}</p><p class="c-2">${esc(s.tagline || 'Your tagline appears here')}</p>
        <div class="row gap-8 wrap"><span class="badge">${esc(s.cats[0] || 'Category')}</span>${opts.flag ? `<span class="row gap-6 t-caption c-2">${H.flag(s.country)}${esc(s.city)}</span>` : `<span class="row gap-4 t-caption c-2">${icon('comment', 'ic-14')}0</span>`}${s.pay.length ? `<span class="badge badge--outline">${esc(s.pay.join(' · '))}</span>` : ''}</div></div>
      <span class="upvote" aria-hidden="true">${icon('upvote')}<span class="t-count">0</span></span></div>`;
  }
  function timeline(steps) {
    return `<ol class="timeline">${steps.map(([state, t, m]) => `<li class="${state}"><span class="tl-dot">${state === 'done' ? icon('check') : ''}</span><div><p class="tl-title">${t}</p>${m ? `<p class="tl-meta">${m}</p>` : ''}</div></li>`).join('')}</ol>`;
  }
  function fmtDate(ts) { const d = new Date(ts); return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }).replace(/(\d+) (\w+)/, '$2 $1') + ' · ' + d.toTimeString().slice(0, 5); }
  window.L = { sub, save, WEEKS, card, timeline, fmtDate, DEFAULT };
})();
