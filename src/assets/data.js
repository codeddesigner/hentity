/* Demo content for Hentity (week 46, Nov 9–15 2026). Mirrors the products and people in the Figma file. */
(function () {
  const P = [
    { slug: 'ledgerline', n: 'Ledgerline', t: 'Bookkeeping that reads your mobile money statements', c: '#000000', cat: 'Fintech', cc: 'NG', city: 'Lagos', rails: 'Paystack · USSD', votes: 1106, comments: 84, verified: true, stage: 'Pre-seed', countries: ['NG', 'GH', 'KE'], pay: 'Paystack · USSD · Card', cur: 'NGN · GHS · KES', lang: 'English · Pidgin · Swahili', plat: 'Web · Android · USSD', makers: ['ada', 'ifeanyi', 'sade'], followers: 612, company: 'Ledgerline Technologies Ltd', team: 6, founded: 2024,
      about: 'Launched by Ada Okafor, Ifeanyi Duru and Sade Balogun in Fintech and SaaS. Small businesses in Lagos run on mobile money, but their records live in screenshots and WhatsApp threads. Ledgerline imports MTN MoMo, OPay and bank statements, categorises every transaction, and produces a monthly P&L you can send to a lender.' },
    { slug: 'swahili-speech-kit', n: 'Swahili Speech Kit', t: 'Speech-to-text API tuned for Swahili and Sheng', c: '#2563eb', cat: 'AI', cc: 'KE', city: 'Nairobi', rails: 'M-Pesa · Card', votes: 948, comments: 61, verified: true, stage: 'Seed' },
    { slug: 'ward-health', n: 'Ward Health', t: 'Clinic queues and patient records that keep working offline', c: '#16a34a', cat: 'Health', cc: 'RW', city: 'Kigali', rails: 'MTN MoMo', votes: 812, comments: 40, verified: true, stage: 'Seed' },
    { slug: 'harbor-kyc', n: 'Harbor KYC', t: 'Identity checks across 14 African ID systems', c: '#0f766e', cat: 'Infrastructure', cc: 'ZA', city: 'Cape Town', rails: 'Card · EFT', votes: 0, comments: 3, verified: true, promoted: true, stage: 'Series A+' },
    { slug: 'previewly', n: 'Previewly', t: 'Deploy previews for every pull request, billed in naira', c: '#7c3aed', cat: 'Dev Tools', cc: 'NG', city: 'Lagos', rails: 'Paystack · Card', votes: 603, comments: 41, stage: 'Seed' },
    { slug: 'farmcast', n: 'Farmcast', t: 'Hyperlocal rain forecasts over SMS for smallholder farmers', c: '#ea580c', cat: 'Agriculture', cc: 'GH', city: 'Accra', rails: 'MTN MoMo · USSD', votes: 540, comments: 27, verified: true, stage: 'Pre-seed' },
    { slug: 'souk-os', n: 'Souk OS', t: 'Inventory and WhatsApp orders for market traders', c: '#db2777', cat: 'Commerce', cc: 'MA', city: 'Casablanca', rails: 'CMI · Cash', votes: 388, comments: 12, stage: 'Bootstrapped' },
    { slug: 'kobo-ledger', n: 'Kobo Ledger', t: 'Savings circles with reminders', c: '#b45309', cat: 'Fintech', cc: 'GH', city: 'Kumasi', rails: 'MTN MoMo', votes: 301, comments: 18, stage: 'Bootstrapped' },
    { slug: 'invoicely-ng', n: 'Invoicely NG', t: 'VAT-ready invoices from WhatsApp', c: '#16a34a', cat: 'Fintech', cc: 'NG', city: 'Abuja', rails: 'Paystack · Transfer', votes: 284, comments: 22, verified: true, stage: 'Bootstrapped' },
    { slug: 'kasuwa', n: 'Kasuwa', t: 'Wholesale ordering for Kano market traders, in Hausa', c: '#b45309', cat: 'Commerce', cc: 'NG', city: 'Kano', rails: 'USSD · Cash', votes: 262, comments: 15, stage: 'Pre-seed', lang: 'Hausa' },
    { slug: 'tutor9ja', n: 'Tutor9ja', t: 'Live maths tutoring over WhatsApp voice notes', c: '#db2777', cat: 'Education', cc: 'NG', city: 'Ibadan', rails: 'Paystack · Card', votes: 233, comments: 19, stage: 'Seed' },
    { slug: 'pesa-pipe', n: 'PesaPipe', t: 'Payroll for casual workers, paid out to M-Pesa', c: '#0891b2', cat: 'Fintech', cc: 'KE', city: 'Mombasa', rails: 'M-Pesa', votes: 207, comments: 9, stage: 'Seed' },
    { slug: 'solarbox', n: 'SolarBox', t: 'Pay-as-you-go solar kits with remote shut-off', c: '#ca8a04', cat: 'Energy & Climate', cc: 'RW', city: 'Musanze', rails: 'MTN MoMo · Airtel', votes: 196, comments: 11, stage: 'Series A+' },
    { slug: 'mtaa-maps', n: 'Mtaa Maps', t: 'Street-level addressing for informal settlements', c: '#ea580c', cat: 'Logistics', cc: 'KE', city: 'Nairobi', verified: true, upcoming: 'NOV 16', votes: 0, comments: 0 },
    { slug: 'sankofa-learn', n: 'Sankofa Learn', t: 'WAEC and JAMB prep that works on 2G', c: '#4f46e5', cat: 'Education', cc: 'GH', city: 'Accra', upcoming: 'NOV 16', votes: 0, comments: 0 },
    { slug: 'ledgerline-for-accountants', n: 'Ledgerline for Accountants', t: 'Client books and VAT returns in one workspace', c: '#7c3aed', cat: 'Fintech', cc: 'NG', city: 'Lagos', votes: 0, comments: 84 },
    { slug: 'momo-parser', n: 'MoMo Parser', t: 'Open-source parser for MTN MoMo and OPay statements', c: '#2563eb', cat: 'Dev Tools', cc: 'NG', city: 'Lagos', votes: 233, comments: 84 }
  ];
  const PEOPLE = {
    ada: { name: 'Ada Okafor', role: 'Founder', city: 'Lagos', cc: 'NG', photo: true },
    ifeanyi: { name: 'Ifeanyi Duru', role: 'Engineering', city: 'Enugu', cc: 'NG' },
    sade: { name: 'Sade Balogun', role: 'Design', city: 'Lagos', cc: 'NG' },
    kofi: { name: 'Kofi Mensah', city: 'Kumasi', cc: 'GH' },
    wanjiru: { name: 'Wanjiru Njeri', city: 'Nairobi', cc: 'KE' },
    thandi: { name: 'Thandi Bhengu', city: 'Johannesburg', cc: 'ZA' },
    chidi: { name: 'Chidi Eze', city: 'Lagos', cc: 'NG' }
  };
  const bySlug = s => P.find(p => p.slug === s);
  const board = () => P.filter(p => !p.upcoming && ['ledgerline', 'swahili-speech-kit', 'ward-health', 'harbor-kyc', 'previewly', 'farmcast', 'souk-os', 'kobo-ledger', 'invoicely-ng', 'kasuwa', 'tutor9ja', 'pesa-pipe', 'solarbox'].includes(p.slug));

  // Votes persist per browser
  const votes = () => H.store.get('votes', { 'swahili-speech-kit': true });
  function voted(slug) { return !!votes()[slug]; }
  function count(p) { return p.votes + (voted(p.slug) && p.slug !== 'swahili-speech-kit' ? 1 : 0) - (!voted(p.slug) && p.slug === 'swahili-speech-kit' ? 1 : 0); }
  function toggleVote(slug) {
    if (!H.session()) { location.href = '/signin?next=' + encodeURIComponent(location.pathname); return null; }
    const v = votes(); v[slug] = !v[slug]; H.store.set('votes', v); return v[slug];
  }
  const fmt = n => n.toLocaleString('en-US');

  function row(p, rank, opts) {
    opts = opts || {};
    const { icon, flag, verified, esc } = H;
    const r = rank && !p.promoted ? `<span class="prow__rank${rank <= 3 ? ' prow__rank--' + rank : ''}" aria-label="Rank ${rank}">${rank}</span>` : (opts.noRank ? '' : '<span class="prow__rank" aria-hidden="true"></span>');
    const up = (p.promoted || !p.votes) ? '<span style="width:56px" class="hide-sm"></span>' : `<button class="upvote${voted(p.slug) ? ' is-voted' : ''}" type="button" data-vote="${p.slug}" aria-pressed="${voted(p.slug)}" aria-label="Upvote ${esc(p.n)}, ${fmt(count(p))} votes">${icon('upvote')}<span class="t-count" data-count>${fmt(count(p))}</span></button>`;
    return `<article class="prow">
      ${p.promoted ? '' : r}
      <a href="/products/${p.slug}" class="plogo" style="background:${p.c}" tabindex="-1" aria-hidden="true">${p.n[0]}</a>
      <div class="prow__info">
        <div class="prow__name"><a href="/products/${p.slug}">${esc(p.n)}</a>${p.verified ? verified() : ''}${p.featured ? '<span class="badge badge--featured">Featured</span>' : ''}${p.promoted ? '<span class="badge">Promoted</span>' : ''}</div>
        <p class="prow__tag">${esc(p.t)}</p>
        <div class="prow__meta">
          <span class="badge">${esc(p.cat)}</span>
          <span class="row hide-sm">${icon('comment', 'ic-14')}${p.comments}</span>
          <span class="row loc">${flag(p.cc)}${esc(p.city)}</span>
          ${p.rails ? `<span class="badge badge--outline hide-sm">${esc(p.rails)}</span>` : ''}
        </div>
      </div>
      ${up}
    </article>`;
  }
  // Delegated upvote handling
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-vote]'); if (!b) return;
    const slug = b.dataset.vote; const on = toggleVote(slug); if (on === null) return;
    const p = bySlug(slug);
    document.querySelectorAll(`[data-vote="${slug}"]`).forEach(x => {
      x.classList.toggle('is-voted', on); x.setAttribute('aria-pressed', on);
      const c = x.querySelector('[data-count]'); if (c) c.textContent = (x.dataset.prefix || '') + fmt(count(p));
    });
  });

  window.D = { P, PEOPLE, bySlug, board, row, voted, count, fmt };
})();
