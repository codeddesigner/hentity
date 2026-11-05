/* Motion helpers: staged reveals, scroll reveals, word-by-word headlines, count-ups, FLIP reorders, upvote bursts. */
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Stage children in order: el.children get .reveal with --i
  function stagger(root, sel) {
    if (!root) return;
    const items = sel ? root.querySelectorAll(sel) : root.children;
    [...items].forEach((el, i) => { el.style.setProperty('--i', i); el.classList.add('reveal'); });
  }
  // Scroll-in reveal for anything with [data-scroll-reveal]
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px' }) : null;
  function scroll(root) {
    (root || document).querySelectorAll('[data-scroll-reveal]:not(.scroll-reveal)').forEach((el, i) => {
      el.classList.add('scroll-reveal'); el.style.setProperty('--i', i % 6);
      if (io && !reduce) io.observe(el); else el.classList.add('is-in');
    });
  }
  // Split a headline into words that rise in
  function words(el) {
    if (!el || reduce) return;
    const text = el.textContent;
    el.setAttribute('aria-label', text);
    el.classList.add('words');
    el.innerHTML = text.split(/(\s+)/).map((w, i) => /\s+/.test(w) ? w : `<span class="w" aria-hidden="true" style="--i:${i / 2}">${w}</span>`).join('');
  }
  // Count up numbers: [data-count-to="1106"]
  function countUp(root) {
    (root || document).querySelectorAll('[data-count-to]').forEach(el => {
      const to = +el.dataset.countTo; const fmt = n => (el.dataset.prefix || '') + Math.round(n).toLocaleString('en-US') + (el.dataset.suffix || '');
      if (reduce || !isFinite(to)) { el.textContent = fmt(to); return; }
      const start = performance.now(), dur = Math.min(1400, 500 + to / 3);
      const tick = t => { const p = Math.min(1, (t - start) / dur); const e = 1 - Math.pow(1 - p, 4); el.textContent = fmt(to * e); if (p < 1) requestAnimationFrame(tick); };
      const go = () => requestAnimationFrame(tick);
      if (io) { const o = new IntersectionObserver(es => { if (es[0].isIntersecting) { go(); o.disconnect(); } }); o.observe(el); } else go();
    });
  }
  // Animate a number change in place with a vertical roll
  function roll(el, text, down) {
    if (!el) return;
    if (reduce) { el.textContent = text; return; }
    el.innerHTML = `<span class="roll${down ? ' down' : ''}"><span>${text}</span></span>`;
  }
  // Burst of little triangles from an element
  function burst(el) {
    if (reduce || !el) return;
    const b = document.createElement('span'); b.className = 'burst'; b.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * .4, d = 22 + Math.random() * 14;
      const s = document.createElement('i');
      s.style.setProperty('--x', Math.cos(a) * d + 'px'); s.style.setProperty('--y', Math.sin(a) * d + 'px'); s.style.setProperty('--r', (Math.random() * 180 - 90) + 'deg');
      b.appendChild(s);
    }
    el.appendChild(b); setTimeout(() => b.remove(), 700);
    el.classList.remove('just-voted'); void el.offsetWidth; el.classList.add('just-voted');
  }
  // FLIP: call before DOM change, then run the returned fn after
  function flip(container, keyAttr) {
    if (reduce || !container) return () => {};
    const first = new Map();
    container.querySelectorAll(`[${keyAttr}]`).forEach(el => first.set(el.getAttribute(keyAttr), el.getBoundingClientRect().top));
    return () => {
      container.querySelectorAll(`[${keyAttr}]`).forEach(el => {
        const f = first.get(el.getAttribute(keyAttr)); if (f == null) return;
        const dy = f - el.getBoundingClientRect().top; if (!dy) return;
        el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)' });
      });
    };
  }
  window.M = { stagger, scroll, words, countUp, roll, burst, flip, reduce };
})();
