/* Auth screens: brand panel (Figma "Auth brand panel" 23:3), mobile top bar, and shared validation. */
(function () {
  const { icon, logo, qs, store } = window.H;
  const LAUNCHES = [
    { n: 'Ledgerline', t: 'Bookkeeping that reads your mobile money statements', c: '#ff5b14', v: 482, voted: true },
    { n: 'Swahili Speech Kit', t: 'Speech-to-text API tuned for Swahili and Sheng', c: '#2563eb', v: 391 },
    { n: 'Ward Health', t: 'Clinic queues and records that work offline', c: '#16a34a', v: 344 }
  ];
  function brand() {
    return `<aside class="brand" aria-label="Live on Hentity today">
      <a class="logo logo--lg logo--inverse" href="/" aria-label="Hentity home" style="--logo-knock:#000">${logo()}</a>
      <div class="brand__pitch">
        <p class="t-eyebrow c-accent">Live on Hentity today</p>
        <p class="brand__title">Discover what’s being built in Africa.</p>
        <div class="brand__stack">${LAUNCHES.map(l => `
          <a class="mini" href="/products/${l.n.toLowerCase().replace(/\s+/g, '-')}">
            <span class="plogo plogo--32" style="background:${l.c}">${l.n[0]}</span>
            <span class="mini__text"><span>${l.n}</span><span>${l.t}</span></span>
            <span class="mini__votes${l.voted ? ' is-voted' : ''}">${icon('upvote', 'ic-12')}<span class="t-count">${l.v}</span></span>
          </a>`).join('')}
        </div>
      </div>
      <div class="brand__proof">
        <div><p class="stat__n">1,240</p><p class="stat__l">products</p></div>
        <div><p class="stat__n">38</p><p class="stat__l">countries</p></div>
        <div><p class="stat__n">9,800</p><p class="stat__l">makers</p></div>
      </div>
    </aside>`;
  }
  function mobileBar(back) {
    return `<div class="auth__mobilebar">
      <a class="logo" href="/" aria-label="Hentity home">${logo()}</a>
      <a class="nav__icon" href="${back || '/'}" aria-label="Close">${icon('x', 'ic-20')}</a>
    </div>`;
  }
  const b = qs('[data-brand]'); if (b) b.outerHTML = brand();
  const m = qs('[data-mobilebar]'); if (m) m.outerHTML = mobileBar(m.dataset.back);

  // password reveal buttons
  document.querySelectorAll('[data-reveal]').forEach(btn => {
    btn.innerHTML = icon('eye');
    btn.addEventListener('click', () => {
      const inp = btn.parentElement.querySelector('input');
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });

  const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  function accounts() { return store.get('accounts', { 'ada@ledgerline.app': { name: 'Ada Okafor', username: 'ada', password: 'hentity2026' } }); }
  function startSession(email) {
    const a = accounts()[email] || {};
    store.set('session', { email, at: Date.now() });
    if (a.name) store.set('profile', Object.assign({}, store.get('profile', {}), { name: a.name, username: a.username, email }));
  }
  window.Auth = { emailOk, accounts, startSession };
})();
