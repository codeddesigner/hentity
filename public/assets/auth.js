/* Auth screens: brand panel (Figma "Auth brand panel" 23:3), mobile top bar, and shared validation. */
(function () {
  const { icon, logo, qs, store } = window.H;
  function brand() {
    return `<aside class="brand" aria-label="Live on Hentity today">
      <a class="logo logo--lg logo--inverse" href="/" aria-label="Hentity home" style="--logo-knock:#000">${logo()}</a>
      <div class="brand__pitch">
        <p class="t-eyebrow c-accent reveal">Live on Hentity today</p>
        <p class="brand__title" id="brand-title">Discover what’s being built in Africa.</p>
        <div class="brand__stack" id="brand-stack">${[0, 1, 2].map(() => '<div class="mini" style="height:60px;opacity:.15"></div>').join('')}</div>
      </div>
      <div class="brand__proof" id="brand-proof"></div>
    </aside>`;
  }
  async function fillBrand() {
    const el = qs('#brand-stack'); if (!el) return;
    M.words(qs('#brand-title'));
    try {
      const cur = await API.currentWeek();
      const rows = (await API.board({ week: cur.id, limit: 6 })).filter(p => !p.promoted).slice(0, 3);
      const voted = await API.myVotes(rows.map(p => p.id));
      el.innerHTML = rows.map((l, i) => `<a class="mini reveal" style="--i:${i + 3}" href="/products/${l.slug}">${H.plogo(l, 32)}<span class="mini__text"><span>${H.esc(l.name)}</span><span>${H.esc(l.tagline)}</span></span><span class="mini__votes${voted.has(l.id) ? ' is-voted' : ''}">${icon('upvote', 'ic-12')}<span class="t-count">${l.upvote_count.toLocaleString('en-US')}</span></span></a>`).join('');
      const st = await API.settings('stats') || { products: 1240, countries: 38, makers: 9800 };
      qs('#brand-proof').innerHTML = [['products', st.products], ['countries', st.countries], ['makers', st.makers]].map(([l, n], i) => `<div class="reveal" style="--i:${i + 6}"><p class="stat__n" data-count-to="${n}">0</p><p class="stat__l">${l}</p></div>`).join('');
      M.countUp(qs('#brand-proof'));
    } catch (e) { el.innerHTML = ''; }
  }
  function mobileBar(back) {
    return `<div class="auth__mobilebar">
      <a class="logo" href="/" aria-label="Hentity home">${logo()}</a>
      <a class="nav__icon" href="${back || '/'}" aria-label="Close">${icon('x', 'ic-20')}</a>
    </div>`;
  }
  const b = qs('[data-brand]'); if (b) { b.outerHTML = brand(); fillBrand(); }
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
  const next = () => { const n = H.params().get('next'); return n && n.startsWith('/') && !n.startsWith('//') ? n : '/'; };
  function friendly(m) {
    if (/Invalid login/i.test(m)) return ['Email or password is incorrect', 'Check both and try again. After several attempts sign-in pauses for a few minutes.'];
    if (/Email not confirmed/i.test(m)) return ['Confirm your email first', 'Open the link we sent you. Need a new one? Use “Resend” on the next screen.'];
    if (/rate limit|too many/i.test(m)) return ['Too many attempts', 'Sign-in is paused for a few minutes. Try again shortly, or reset your password.'];
    if (/provider is not enabled/i.test(m)) return ['Google sign-in isn’t switched on yet', 'Use your email and password for now.'];
    if (/already registered|already been registered/i.test(m)) return ['This email already has an account', 'Sign in instead, or reset your password.'];
    return ['Something went wrong', m];
  }
  window.Auth = { emailOk, next, friendly };
})();
