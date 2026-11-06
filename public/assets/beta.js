/* Beta tests: shared helpers and the beta call card (board, request-form preview, product pages). */
(function () {
  'use strict';
  const { esc, icon, plogo, verified } = H;
  const COUNTRIES = { NG: 'Nigeria', GH: 'Ghana', KE: 'Kenya', ZA: 'South Africa', RW: 'Rwanda', MA: 'Morocco', EG: 'Egypt', UG: 'Uganda', TZ: 'Tanzania', SN: 'Senegal', CI: 'Côte d’Ivoire', ET: 'Ethiopia' };
  const PLATFORMS = ['Android', 'iOS', 'Web', 'USSD / SMS', 'WhatsApp', 'API', 'Desktop'];
  const TIMES = ['10 min', '20 min', '1 hour', 'A few days', '1 week+'];
  const ACCESS = ['Play internal testing', 'TestFlight', 'APK download', 'Web link', 'Promo code'];
  const DAY = 864e5;
  const NETWORKS = ['MTN', 'Airtel', 'Glo', '9mobile', 'Safaricom', 'Vodacom', 'Telecel', 'AirtelTigo', 'Orange', 'Other'];
  const FEE = 0.05;
  const naira = n => '₦' + Math.round(n || 0).toLocaleString('en-US');
  // Combined perk line: "3 months of Pro + ₦5,000 airtime"
  const perkText = b => [b.perk, b.airtime_amount > 0 ? naira(b.airtime_amount) + ' airtime' : ''].filter(Boolean).join(' + ');
  const budget = b => { const base = (b.airtime_amount || 0) * (b.spots || 0); const fee = Math.ceil(base * FEE); return { base, fee, total: base + fee }; };

  const day0 = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const fmtDay = d => d ? new Date(typeof d === 'string' && d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  function closesIn(b) {
    const ms = new Date(b.closes_at) - Date.now(); if (ms <= 0) return 'Closed';
    const days = Math.round((day0(b.closes_at) - day0(Date.now())) / DAY);
    if (days <= 0) { const h = Math.max(1, Math.round(ms / 36e5)); return `Closes in ${h} hour${h === 1 ? '' : 's'}`; }
    return days === 1 ? 'Closes tomorrow' : `Closes in ${days} days`;
  }
  // Where a beta is in its life: open → (full) → picking → testing → closed
  function phase(b) {
    const now = Date.now();
    if (b.status === 'cancelled') return { k: 'closed', label: 'Cancelled' };
    if (b.status === 'draft') return { k: 'draft', label: 'Draft' };
    if (b.status === 'awaiting_payment') return { k: 'draft', label: 'Awaiting payment' };
    const te = b.test_end && new Date(b.test_end + 'T23:59:59'), ts = b.test_start && new Date(b.test_start + 'T00:00:00');
    if (b.status === 'closed' || (te && now > te)) return { k: 'closed', label: 'Closed' };
    if (ts && now >= ts) { const n = te ? Math.round((te - ts) / DAY) : 0, d = Math.floor((now - ts) / DAY) + 1; return { k: 'testing', label: n ? `Testing · day ${Math.min(d, n)} of ${n}` : 'Testing' }; }
    if (now >= new Date(b.closes_at)) return { k: 'picking', label: 'Picking testers' };
    if (b.accepted_count >= b.spots) return { k: 'full', label: 'Full' };
    return { k: 'open', label: 'Open' };
  }
  const canApply = b => ['open', 'full'].includes(phase(b).k);
  function pill(b, app) {
    if (app && app.status === 'accepted') return '<span class="bpill bpill--in">You’re in</span>';
    if (app && ['applied', 'waitlist'].includes(app.status)) return `<span class="bpill bpill--applied">${app.status === 'waitlist' ? 'Waitlisted' : 'Applied'}</span>`;
    const p = phase(b);
    return `<span class="bpill bpill--${p.k}">${esc(p.label)}</span>`;
  }
  const countryText = cs => !cs || !cs.length ? 'Anywhere in Africa' : cs.map(c => COUNTRIES[c] || c).join(cs.length === 2 ? ' or ' : ', ');
  const who = b => [countryText(b.countries), (b.requirements || [])[0]].filter(Boolean).join(' · ');
  const filled = b => Math.min(100, Math.round((b.accepted_count || 0) / Math.max(1, b.spots) * 100));
  // Profile → platform, mirrors platform_of() in the database
  function platformOf(os, device) {
    os = os || ''; device = device || '';
    if (/android/i.test(os)) return 'Android';
    if (/ios|iphone|ipad/i.test(os) || /iphone|ipad/i.test(device)) return 'iOS';
    if (/windows|mac|linux|chrome/i.test(os) || /laptop|desktop|pc|mac/i.test(device)) return 'Web';
    if (/feature phone|ussd/i.test(device)) return 'USSD / SMS';
    return '';
  }
  // Checks Hentity can do from the viewer's profile; requirements are confirmed by the tester when applying
  function match(b, prof, confirmed) {
    prof = prof || {}; confirmed = confirmed || [];
    const plat = platformOf(prof.device_os, prof.device);
    const rows = [
      { label: 'Lives in ' + countryText(b.countries), ok: !b.countries.length || b.countries.includes(prof.country), auto: true, you: prof.country ? 'You: ' + [prof.city, COUNTRIES[prof.country] || prof.country].filter(Boolean).join(', ') : 'Add your country in your profile' },
      { label: b.platforms.length ? 'Tests on ' + b.platforms.join(' or ') : 'Any device', ok: !b.platforms.length || (plat && b.platforms.includes(plat)), auto: true, unknown: b.platforms.length && !plat, you: prof.device ? `You: ${prof.device}${prof.device_os ? ' · ' + prof.device_os : ''}` : 'Tell us your device when you apply' }
    ];
    (b.requirements || []).forEach(r => rows.push({ label: r, ok: confirmed.includes(r), auto: false, you: confirmed.includes(r) ? 'You confirmed this' : 'Confirm it when you apply' }));
    return { rows, score: rows.filter(x => x.ok).length, total: rows.length };
  }

  // The beta call card (Figma: Beta call card)
  function card(b, opts) {
    opts = opts || {};
    const p = b.product || {}, app = opts.app, ph = phase(b);
    const href = opts.preview ? '#' : `/betas/${b.id}`;
    let cta;
    if (opts.preview) cta = `<span class="btn btn--accent btn--sm">${icon('flask', 'ic-14')}Apply to test</span>`;
    else if (app && app.status === 'accepted') cta = `<a class="btn btn--primary btn--sm" href="${href}">${icon('arrow-right', 'ic-14')}Open your beta</a>`;
    else if (app && ['applied', 'waitlist'].includes(app.status)) cta = `<span class="btn btn--secondary btn--sm" aria-disabled="true">${icon('check', 'ic-14')}${app.status === 'waitlist' ? 'On the waitlist' : 'Application sent'}</span>`;
    else if (ph.k === 'full') cta = `<a class="btn btn--secondary btn--sm" href="${href}#apply">${icon('bell', 'ic-14')}Join waitlist</a>`;
    else if (ph.k === 'open') cta = `<a class="btn btn--accent btn--sm" href="${href}#apply">${icon('flask', 'ic-14')}Apply to test</a>`;
    else cta = '';
    const tags = [...(b.platforms || []), b.time_needed].filter(Boolean).map(t => `<span class="btag">${esc(t)}</span>`).join('');
    const right = ph.k === 'full' ? `Full${b.applied_count > b.accepted_count ? ' · ' + (b.applied_count - b.accepted_count) + ' on waitlist' : ''}` : ph.k === 'open' ? closesIn(b) : ph.label;
    return `<article class="bcard card ${opts.preview ? '' : 'stretch lift'}" data-beta="${b.id}">
      <div class="bcard__head">${plogo(p, 32)}<div class="grow" style="min-width:0"><p class="t-label row gap-6">${esc(p.name || 'Your product')}${p.verified ? verified('verified--sm') : ''}</p><p class="t-caption c-3 truncate" style="font-weight:400">${esc(p.tagline || '')}</p></div>${pill(b, app)}</div>
      <h3 class="bcard__title">${opts.preview ? esc(b.title || 'Your headline') : `<a class="stretch-link" href="${href}">${esc(b.title)}</a>`}</h3>
      ${tags ? `<div class="row gap-6 wrap">${tags}</div>` : ''}
      <p class="bcard__line c-2">${icon('users', 'ic-14')}<span>${esc(who(b))}</span></p>
      ${perkText(b) ? `<p class="bcard__line bcard__perk">${icon('sparkles', 'ic-14')}<span>${esc(perkText(b))}</span></p>` : ''}
      <div class="bcard__bar${ph.k === 'full' || ph.k === 'closed' ? ' is-full' : ''}"><i style="width:${filled(b)}%"></i></div>
      <div class="row between t-caption c-3" style="font-weight:400"><span>${b.accepted_count || 0} of ${b.spots} spots filled</span><span>${esc(right)}</span></div>
      <div class="bcard__foot">${opts.preview ? '<span class="btn btn--ghost btn--sm">Details</span>' : `<a class="btn btn--ghost btn--sm" href="${href}">Details</a>`}${cta}</div>
    </article>`;
  }

  window.B = { NETWORKS, FEE, naira, perkText, budget, COUNTRIES, PLATFORMS, TIMES, ACCESS, phase, canApply, pill, card, closesIn, who, countryText, filled, match, platformOf, fmtDay };
})();
