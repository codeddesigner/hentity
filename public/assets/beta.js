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
    const href = opts.preview ? '#' : b.slug ? `/b/${b.slug}` : `/betas/${b.id}`;
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


  // ---------------------------------------------------------------- Studio: agreement, form, links
  const LAWS = { NG: 'Nigeria', GH: 'Ghana', KE: 'Kenya', ZA: 'South Africa', RW: 'Rwanda', EG: 'Egypt', MA: 'Morocco', UG: 'Uganda', TZ: 'Tanzania', SN: 'Senegal', CI: 'Côte d’Ivoire', ET: 'Ethiopia' };
  const DP_ACT = { Nigeria: 'the Nigeria Data Protection Act 2023', Ghana: 'Ghana’s Data Protection Act 2012', Kenya: 'Kenya’s Data Protection Act 2019', 'South Africa': 'South Africa’s POPIA', Rwanda: 'Rwanda’s data protection law (2021)', Egypt: 'Egypt’s Personal Data Protection Law', Uganda: 'Uganda’s Data Protection and Privacy Act 2019' };
  // key, title, summary for the maker, always on?
  const CLAUSES = [
    ['confidentiality', 'Confidentiality', 'Keep the beta private until public launch or 90 days, whichever comes first.'],
    ['feedback', 'Feedback', 'We may use feedback to improve the product. Testers don’t gain rights to features.'],
    ['data', 'Your data', 'Testers’ data stays on their account and is deleted on request.', true],
    ['perk', 'Perk terms', 'The perk is released by Hentity when feedback is submitted.'],
    ['novote', 'No voting conditions', 'Joining, staying in or getting the perk never depends on upvotes or reviews.', true],
    ['software', 'Beta software', 'Things may break. Keep your own records while testing.'],
    ['leaving', 'Leaving', 'Testers can leave at any time; access ends the same day.', true]
  ];
  const clauseOn = (b, k) => { const c = CLAUSES.find(x => x[0] === k); if (c && c[3]) return true; const v = ((b.agreement || {}).clauses || {})[k]; return v !== false; };
  // Full agreement text: [{h, p}] in order
  function agreementText(b, productName, tester) {
    const a = b.agreement || {}, co = a.legal_name || productName || 'The company', law = a.law || 'Nigeria', pn = productName || 'the product';
    const perk = perkText(b);
    const out = [];
    if (clauseOn(b, 'confidentiality')) out.push(['Confidentiality', `You agree not to share screenshots, recordings or details of the beta until ${pn} launches it publicly, or 90 days from signing, whichever is sooner.`]);
    if (clauseOn(b, 'feedback')) out.push(['Feedback', `${co} may use your feedback to improve its products. You keep no rights to features built from it.`]);
    out.push(['Your data', `Anything you put into the beta stays in your account. ${co} processes it only to provide the beta, under ${DP_ACT[law] || 'the data protection law of ' + law}. Ask ${a.contact || co} to delete it any time.`]);
    if (perk && clauseOn(b, 'perk')) out.push(['Perk', `${perk}${b.airtime_amount > 0 ? ', paid by Hentity on ' + co + '’s behalf' : ''} once you submit feedback.`]);
    out.push(['No voting conditions', 'Nothing here depends on upvotes, reviews or ratings on Hentity or anywhere else.']);
    if (clauseOn(b, 'software')) out.push(['Beta software', 'The beta may have bugs or lose data. Keep your own records while testing. It is provided as is.']);
    out.push(['Leaving', 'You can leave at any time. Your access ends the same day and this agreement’s confidentiality still applies.']);
    out.push(['Governing law', `This agreement is governed by the laws of ${law}.`]);
    return { parties: `${co}${a.rc ? ' (' + a.rc + ')' : ''}${a.city ? ', ' + a.city : ''}, and ${tester || 'the tester named below'}`, sections: out };
  }
  function agreementShort(b, productName) {
    const perk = perkText(b), pn = productName || 'The maker';
    return [
      clauseOn(b, 'confidentiality') && ['lock', 'Keep the beta private until it launches (max 90 days).'],
      clauseOn(b, 'feedback') && ['chats', `${pn} can use your feedback to improve the app.`],
      ['shield', 'Your data stays yours. Ask and it’s deleted.'],
      perk && clauseOn(b, 'perk') && ['sparkles', `Perk ${b.airtime_amount > 0 ? 'is paid by Hentity' : 'is unlocked'} after you send feedback.`],
      ['upvote', 'You never have to upvote or review anything.'],
      ['arrow-left', 'You can leave any time.']
    ].filter(Boolean);
  }
  function agreementHTML(b, productName, tester, signed) {
    const t = agreementText(b, productName, tester);
    return `<p class="st-label">Beta tester agreement</p><p style="font-size:16px;font-weight:600;line-height:22px;margin-top:12px">${esc(t.parties)}</p>
      ${t.sections.map((s, i) => `<h4>${i + 1}. ${esc(s[0])}</h4><p>${esc(s[1])}</p>`).join('')}
      ${signed ? `<div class="row gap-24" style="margin-top:24px;flex-wrap:wrap"><div style="border-top:1px solid var(--color-border-default);padding-top:8px;min-width:200px"><p class="t-label">For ${esc((b.agreement || {}).legal_name || productName)}</p><p class="t-caption c-3" style="font-weight:400">${esc((b.agreement || {}).signer || 'Authorised on Hentity')}</p></div><div style="border-top:1px solid var(--color-border-default);padding-top:8px;min-width:200px"><p class="t-label" style="font-family:cursive;font-size:18px">${esc(signed.name)}</p><p class="t-caption c-3" style="font-weight:400">Signed on Hentity · ${esc(signed.when)}</p></div></div>` : ''}`;
  }
  // Question types for the application form
  const QTYPES = { short: ['Short answer', 'text'], choice: ['Single choice', 'check'], multi: ['Multiple choice', 'list'], email: ['Email', 'mail'], file: ['File upload', 'paperclip'], voice: ['Voice note', 'mic'] };
  const lagosTime = d => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) + ' WAT';
  const betaUrl = (b, src) => location.origin + '/b/' + b.slug + (src ? '?s=' + encodeURIComponent(src) : '');
  // Device from the browser (best effort; the tester can change it)
  function detectDevice() {
    const ua = navigator.userAgent || '';
    let os = '', device = '';
    const and = ua.match(/Android (\d+)/); if (and) { os = 'Android ' + (+and[1] >= 14 ? '14' : and[1] <= 11 ? '11 or older' : and[1]); const m = ua.match(/Android [^;]+; ([^;)]+?)(?: Build|\))/); device = m && !/^K$/.test(m[1]) ? m[1].trim() : 'Android phone'; }
    else if (/iPhone|iPad/.test(ua)) { const v = ua.match(/OS (\d+)_/); os = v && +v[1] >= 17 ? 'iOS 17+' : 'iOS 16 or older'; device = /iPad/.test(ua) ? 'iPad' : 'iPhone'; }
    else if (/Windows/.test(ua)) { os = 'Windows'; device = 'Laptop / PC'; }
    else if (/Mac OS X/.test(ua)) { os = 'macOS'; device = 'Mac'; }
    else if (/CrOS/.test(ua)) { os = 'ChromeOS'; device = 'Chromebook'; }
    else if (/Linux/.test(ua)) { os = 'Linux'; device = 'Laptop / PC'; }
    return { os, device };
  }

  const copy = t => { try { navigator.clipboard.writeText(t).catch(() => {}); } catch (e) {} };
  window.B = { copy, LAWS, CLAUSES, clauseOn, agreementText, agreementShort, agreementHTML, QTYPES, lagosTime, betaUrl, detectDevice, NETWORKS, FEE, naira, perkText, budget, COUNTRIES, PLATFORMS, TIMES, ACCESS, phase, canApply, pill, card, closesIn, who, countryText, filled, match, platformOf, fmtDay };
})();
