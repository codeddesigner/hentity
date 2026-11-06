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
    if (/Signups not allowed|User not found/i.test(m)) return ['No account uses this email', 'Check the address, or create an account with your work email.'];
    if (/expired|invalid.*(otp|token)|Token has expired/i.test(m)) return ['That code didn’t work', 'Codes expire after an hour and only work once. Use the newest one, or send a new code.'];
    if (/For security purposes|after \d+ seconds/i.test(m)) return ['Wait a moment', 'You can request another code in a minute.'];
    if (/rate limit|too many/i.test(m)) return ['Too many attempts', 'Wait a few minutes, then request a new code.'];
    if (/WORK_EMAIL_REQUIRED|Database error saving new user|Error updating user/i.test(m)) return ['Use your work email', 'Hentity accounts need a company email address. Personal inboxes like Gmail, Yahoo or Outlook.com aren’t accepted'];
    if (/already registered|already been registered/i.test(m)) return ['This email already has an account', 'Sign in instead — we’ll email you a code.'];
    return ['Something went wrong', m];
  }
  // Code step: replaces a form with a 6-digit code entry. opts: { email, title, resend(), verified(), back() }
  function codeStep(form, opts) {
    const wrap = document.createElement('form'); wrap.className = 'auth__form reveal'; wrap.noValidate = true; wrap.id = 'code-form';
    wrap.innerHTML = `<div class="icon-badge">${icon('mail')}</div>
      <div class="auth__heading"><h1 class="t-h2">${H.esc(opts.title || 'Check your email')}</h1><p class="c-2">We sent a 6-digit code to <b style="color:var(--color-text-primary)">${H.esc(opts.email)}</b>. Enter it below to continue.</p></div>
      <div class="alert alert--error" id="code-err" role="alert" hidden>${icon('alert-circle')}<div><p class="alert__title" id="code-err-t"></p><p class="alert__body" id="code-err-b"></p></div></div>
      <div class="field" id="f-code"><label class="field__label" for="code">Code</label><input class="input mono" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="••••••" style="letter-spacing:.4em;font-size:22px;text-align:center"></div>
      <button class="btn btn--primary btn--block" type="submit" id="code-go" disabled>Continue</button>
      <div class="auth__row"><button class="link" type="button" id="code-resend" disabled>Resend code</button><button class="link" type="button" id="code-back">Use a different email</button></div>
      <p class="t-caption c-3" style="font-weight:400;text-align:center">Can’t find it? Check spam, or search your inbox for “Hentity”.</p>`;
    form.replaceWith(wrap);
    const inp = wrap.querySelector('#code'), go = wrap.querySelector('#code-go'), rs = wrap.querySelector('#code-resend');
    inp.focus();
    let t; const cool = () => { let n = 60; rs.disabled = true; clearInterval(t); const tick = () => { rs.textContent = n > 0 ? `Resend code (0:${String(n).padStart(2, '0')})` : 'Resend code'; rs.disabled = n > 0; n--; if (n < -1) clearInterval(t); }; tick(); t = setInterval(tick, 1000); };
    cool();
    const showErr = ([a, b]) => { wrap.querySelector('#code-err-t').textContent = a; wrap.querySelector('#code-err-b').textContent = b; wrap.querySelector('#code-err').hidden = false; wrap.querySelector('#f-code').classList.add('is-error'); };
    inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 8); go.disabled = inp.value.length < 6; wrap.querySelector('#code-err').hidden = true; wrap.querySelector('#f-code').classList.remove('is-error'); if (inp.value.length === 6 && !inp.dataset.auto) { inp.dataset.auto = 1; wrap.requestSubmit(); } });
    wrap.addEventListener('submit', async e => {
      e.preventDefault(); if (inp.value.length < 6) return;
      go.disabled = true; go.innerHTML = icon('clock', 'spin') + 'Checking';
      try { await API.auth.verifyCode(opts.email, inp.value); await opts.verified(); }
      catch (ex) { showErr(friendly(ex.message)); inp.select(); delete inp.dataset.auto; go.disabled = false; go.textContent = 'Continue'; }
    });
    rs.addEventListener('click', async () => { try { await opts.resend(); H.toast('New code sent'); cool(); } catch (ex) { showErr(friendly(ex.message)); } });
    wrap.querySelector('#code-back').addEventListener('click', () => { clearInterval(t); opts.back ? opts.back() : location.reload(); });
    return wrap;
  }
  window.Auth = { emailOk, next, friendly, codeStep };
})();
