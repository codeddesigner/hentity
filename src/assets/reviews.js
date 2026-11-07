/* Product reviews: star rating summary, the member's own review, the list with Helpful votes and maker replies.
   Used on /products/:slug. R.mount(el, product) renders into el; R.stars(n) draws a star row anywhere. */
(function () {
  const { esc, icon, toast, avatar } = H;
  const LABEL = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
  const MIN = 20, MAX = 2000, FIRST = 5;
  const STAR = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.4l-4.94 2.6.94-5.5-4-3.9 5.53-.8z"/></svg>';
  // A row of five stars filled to the value (halves and tenths show as a partial fill)
  const stars = (n, cls) => `<span class="rv-stars ${cls || ''}" role="img" aria-label="${(+n || 0).toFixed(1).replace(/\.0$/, '')} out of 5 stars"><span class="rv-stars__bg">${STAR.repeat(5)}</span><span class="rv-stars__fg" style="width:${Math.max(0, Math.min(5, +n || 0)) / 5 * 100}%">${STAR.repeat(5)}</span></span>`;
  const when = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  function mount(el, p) {
    let S = null, sort = 'helpful', only = 0, showAll = false, editing = false, replying = null;
    const signin = () => { location.href = '/signin?next=' + encodeURIComponent(location.pathname + '#reviews'); };

    async function load() {
      // If reviews can't load (e.g. offline), leave the section out rather than show a form that can't post
      try { S = await API.reviews(p.id, sort); } catch (e) { if (!S) { el.hidden = true; return; } }
      el.hidden = false; render();
    }
    const mine = () => (S.reviews || []).find(r => r.mine);

    function summary() {
      const n = S.count || 0, d = S.dist || {}, top = Math.max(1, ...[1, 2, 3, 4, 5].map(k => +d[k] || 0)), me = mine();
      const cta = S.is_maker ? `<p class="t-caption c-3" style="font-weight:400;max-width:28ch">You’re on the ${esc(p.name)} team, so you can reply to reviews but not write one.</p>`
        : me ? `<button class="btn btn--secondary btn--sm" type="button" data-rv-write>${icon('edit', 'ic-14')}Edit your review</button>`
        : `<button class="btn btn--accent btn--sm" type="button" data-rv-write>${icon('star', 'ic-14')}Write a review</button>`;
      if (!n) return `<div class="card rv-empty"><div class="rv-empty__stars">${stars(0, 'rv-stars--lg')}</div><p class="t-h4">No reviews yet</p><p class="t-body-sm c-2" style="margin:6px auto 16px;max-width:42ch">Used ${esc(p.name)}? Tell others what it’s like, what works and what doesn’t.</p>${S.is_maker ? '<p class="t-caption c-3" style="font-weight:400">Share your page with users and ask them to leave one.</p>' : cta}</div>`;
      return `<div class="card rv-sum">
        <div class="rv-sum__avg"><b>${(+S.avg).toFixed(1)}</b>${stars(S.avg, 'rv-stars--md')}<span class="t-caption c-3" style="font-weight:400">${n} review${n === 1 ? '' : 's'}</span></div>
        <div class="rv-sum__bars">${[5, 4, 3, 2, 1].map(k => `<button type="button" class="rv-bar${only === k ? ' is-on' : ''}" data-rv-only="${k}" aria-pressed="${only === k}" aria-label="${k} star: ${+d[k] || 0} review${(+d[k] || 0) === 1 ? '' : 's'}"><span>${k}</span>${STAR}<i><em style="width:${(+d[k] || 0) / top * 100}%"></em></i><span class="n">${+d[k] || 0}</span></button>`).join('')}</div>
        <div class="rv-sum__cta">${cta}</div></div>`;
    }

    function composer() {
      const me = mine() || {}, r = me.rating || 0;
      return `<form class="card rv-form" id="rv-form" novalidate>
        <div class="row between gap-12 wrap"><p class="t-h4">${me.id ? 'Edit your review' : `Review ${esc(p.name)}`}</p><button class="btn btn--ghost btn--sm" type="button" data-rv-cancel>Cancel</button></div>
        <div class="rv-pick" role="radiogroup" aria-label="Your rating">${[1, 2, 3, 4, 5].map(k => `<button type="button" role="radio" aria-checked="${k === r}" aria-label="${k} star${k === 1 ? '' : 's'}, ${LABEL[k]}" data-rv-rate="${k}" class="${k <= r ? 'is-on' : ''}">${STAR}</button>`).join('')}<span class="t-body-sm c-2" id="rv-lab">${r ? LABEL[r] : 'Tap to rate'}</span></div>
        <label class="field"><span class="sr-only">Your review</span><textarea class="input" id="rv-body" rows="4" maxlength="${MAX}" placeholder="What do you use it for? What works well, and what could be better?">${esc(me.body || '')}</textarea>
          <span class="field__hint row between"><span id="rv-hint">At least ${MIN} characters</span><span id="rv-n">${(me.body || '').length} / ${MAX}</span></span></label>
        <div class="row between gap-12 wrap"><p class="t-caption c-3" style="font-weight:400">Shown with your name and photo. Be fair and specific. No promo codes or personal details.</p><button class="btn btn--primary btn--sm" type="submit" id="rv-post">${me.id ? 'Save changes' : 'Post review'}</button></div>
      </form>`;
    }

    function item(r) {
      const u = r.user || {}, long = r.body.length > 420;
      const reply = r.reply ? `<div class="rv-reply"><p class="t-caption"><b>Reply from ${esc(p.name)}</b>${r.reply.by ? ` · ${esc(r.reply.by.name)}` : ''} · ${H.ago(r.reply.at)}</p><p class="t-body-sm c-2" style="white-space:pre-line;margin-top:4px">${esc(r.reply.body)}</p>${S.is_maker ? `<button class="link t-caption" type="button" data-rv-reply="${r.id}" style="margin-top:6px">Edit reply</button>` : ''}</div>` : '';
      const replyForm = replying === r.id ? `<form class="rv-replyform" data-rv-replyform="${r.id}"><textarea class="input" rows="3" maxlength="1000" placeholder="Thank them, answer the question, or say what you’re fixing">${esc((r.reply || {}).body || '')}</textarea><div class="row gap-8" style="justify-content:flex-end">${r.reply ? '<button class="btn btn--ghost btn--sm" type="button" data-rv-unreply>Remove reply</button>' : ''}<button class="btn btn--ghost btn--sm" type="button" data-rv-replycancel>Cancel</button><button class="btn btn--primary btn--sm" type="submit">Post reply</button></div></form>` : '';
      return `<article class="rv" id="rv-${r.id}">
        <div class="rv__head"><a href="/makers/${esc(u.username || '')}" tabindex="-1">${avatar(u, 36)}</a><div style="min-width:0"><p class="row gap-6 wrap"><a class="t-label" href="/makers/${esc(u.username || '')}">${esc(u.name || 'Member')}</a>${u.is_verified ? H.verified('ic-14') : ''}${r.tester ? `<span class="rv-tag">${icon('flask', 'ic-12')}Beta tester</span>` : ''}${r.mine ? '<span class="rv-tag rv-tag--you">You</span>' : ''}</p>${u.headline ? `<p class="t-caption c-3 truncate" style="font-weight:400">${esc(u.headline)}</p>` : ''}</div></div>
        <p class="row gap-8 wrap" style="margin-top:10px">${stars(r.rating)}<span class="t-caption c-3" style="font-weight:400">${when(r.created_at)}${r.edited_at ? ' · edited' : ''}</span></p>
        <p class="rv__body${long ? ' is-clamped' : ''}">${esc(r.body)}</p>${long ? '<button class="link t-caption" type="button" data-rv-more>Read more</button>' : ''}
        <div class="rv__acts">${r.mine ? `<span class="t-caption c-3" style="font-weight:400">${r.helpful ? `${r.helpful} found this helpful` : ''}</span><button class="link t-caption" type="button" data-rv-write>Edit</button><button class="link t-caption" type="button" data-rv-del="${r.id}">Delete</button>`
          : `<button class="rv-help" type="button" data-rv-help="${r.id}" aria-pressed="${!!r.voted}">${icon('check', 'ic-14')}Helpful${r.helpful ? ` · ${r.helpful}` : ''}</button>${S.is_maker && !r.reply && replying !== r.id ? `<button class="link t-caption" type="button" data-rv-reply="${r.id}">Reply</button>` : ''}<button class="link t-caption c-3" type="button" data-rv-report="${r.id}">Report</button>`}</div>
        ${reply}${replyForm}</article>`;
    }

    function render() {
      // The rating line under the product name
      const hero = document.querySelector('#rv-hero');
      if (hero) hero.innerHTML = S.count ? `<a class="rv-hero" href="#reviews">${stars(S.avg, 'rv-stars--sm')}<b>${(+S.avg).toFixed(1)}</b><span>${S.count} review${S.count === 1 ? '' : 's'}</span></a>` : '';
      const list = (S.reviews || []).filter(r => !only || r.rating === only);
      // Your own review sits first so you can find and edit it
      list.sort((a, b) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0));
      const shown = showAll ? list : list.slice(0, FIRST);
      el.innerHTML = `<div class="row between wrap gap-12" style="margin-bottom:16px"><h2 class="t-h3">Reviews · <span id="rv-count">${S.count || 0}</span></h2>
          ${(S.count || 0) > 1 ? `<label class="rv-sort"><span class="sr-only">Sort reviews</span><select id="rv-sort">${[['helpful', 'Most helpful'], ['newest', 'Newest'], ['high', 'Highest rated'], ['low', 'Lowest rated']].map(([k, l]) => `<option value="${k}"${k === sort ? ' selected' : ''}>${l}</option>`).join('')}</select>${icon('chevron-down', 'ic-14')}</label>` : ''}</div>
        ${summary()}
        ${editing ? composer() : ''}
        ${only ? `<p class="row gap-8 t-body-sm c-2" style="margin-top:16px">Showing ${only}-star reviews<button class="link link--accent" type="button" data-rv-only="0">Show all</button></p>` : ''}
        <div class="rv-list">${shown.map(item).join('') || (only ? '<p class="t-body-sm c-2" style="padding:12px 0">No reviews with that rating yet.</p>' : '')}</div>
        ${list.length > FIRST ? `<button class="btn btn--secondary btn--sm btn--block" type="button" data-rv-all style="margin-top:12px">${showAll ? 'Show fewer' : `Show all ${list.length} reviews`}</button>` : ''}`;
      if (editing) bindForm();
    }

    function bindForm() {
      const f = el.querySelector('#rv-form'), ta = f.querySelector('#rv-body'), me = mine() || {};
      let rating = me.rating || 0;
      const paint = k => { f.querySelectorAll('[data-rv-rate]').forEach(b => { const v = +b.dataset.rvRate; b.classList.toggle('is-on', v <= k); b.setAttribute('aria-checked', String(v === rating)); }); f.querySelector('#rv-lab').textContent = k ? LABEL[k] : 'Tap to rate'; };
      f.querySelectorAll('[data-rv-rate]').forEach(b => {
        b.onclick = () => { rating = +b.dataset.rvRate; paint(rating); };
        b.onmouseenter = () => paint(+b.dataset.rvRate); b.onmouseleave = () => paint(rating);
      });
      f.querySelector('.rv-pick').onkeydown = e => { if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return; e.preventDefault(); rating = Math.max(1, Math.min(5, (rating || 0) + (e.key === 'ArrowRight' ? 1 : -1))); paint(rating); f.querySelector(`[data-rv-rate="${rating}"]`).focus(); };
      ta.oninput = () => { const n = ta.value.trim().length; f.querySelector('#rv-n').textContent = ta.value.length + ' / ' + MAX; f.querySelector('#rv-hint').textContent = n < MIN ? `${MIN - n} more character${MIN - n === 1 ? '' : 's'} needed` : 'Looks good'; };
      f.onsubmit = async e => {
        e.preventDefault();
        const body = ta.value.trim();
        if (!rating) { toast('Pick a star rating', 'error'); f.querySelector('[data-rv-rate]').focus(); return; }
        if (body.length < MIN) { toast(`Write at least ${MIN} characters`, 'error'); ta.focus(); return; }
        const b = f.querySelector('#rv-post'); b.disabled = true;
        try { await API.saveReview(p.id, me.id, rating, body); editing = false; toast(me.id ? 'Review updated' : 'Thanks! Your review is live'); await load(); const mineEl = el.querySelector('.rv-list .rv'); mineEl && mineEl.classList.add('flash'); }
        catch (err) { b.disabled = false; H.fail(err); }
      };
      ta.focus();
    }

    el.addEventListener('click', async e => {
      const t = e.target;
      if (t.closest('[data-rv-write]')) { if (!API.uid) return signin(); editing = true; render(); el.querySelector('#rv-form').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      if (t.closest('[data-rv-cancel]')) { editing = false; render(); return; }
      if (t.closest('[data-rv-all]')) { showAll = !showAll; render(); return; }
      const o = t.closest('[data-rv-only]'); if (o) { const k = +o.dataset.rvOnly; only = only === k ? 0 : k; showAll = false; render(); return; }
      const more = t.closest('[data-rv-more]'); if (more) { more.previousElementSibling.classList.remove('is-clamped'); more.remove(); return; }
      const h = t.closest('[data-rv-help]'); if (h) {
        if (!API.uid) return signin();
        const r = S.reviews.find(x => x.id === h.dataset.rvHelp), on = !r.voted;
        r.voted = on; r.helpful += on ? 1 : -1; render();
        try { await API.reviewHelpful(r.id, on); } catch (err) { r.voted = !on; r.helpful += on ? -1 : 1; render(); H.fail(err); }
        return;
      }
      const d = t.closest('[data-rv-del]'); if (d) {
        if (!(await H.confirm('Delete your review?', { body: 'Your rating and text are removed from this page.', ok: 'Delete', danger: true }))) return;
        try { await API.deleteReview(d.dataset.rvDel); toast('Review deleted'); load(); } catch (err) { H.fail(err); }
        return;
      }
      const rp = t.closest('[data-rv-report]'); if (rp) {
        if (!API.uid) return signin();
        const why = await H.ask('Why are you reporting this review?', { placeholder: 'Fake, abusive, off-topic, personal details…', multiline: true, ok: 'Report' }); if (!why) return;
        try { await API.report('review', rp.dataset.rvReport, why); toast('Thanks. A moderator will take a look'); } catch (err) { H.fail(err); }
        return;
      }
      const ry = t.closest('[data-rv-reply]'); if (ry) { replying = ry.dataset.rvReply; render(); const f = el.querySelector(`[data-rv-replyform="${replying}"] textarea`); f && f.focus(); return; }
      if (t.closest('[data-rv-replycancel]')) { replying = null; render(); return; }
      if (t.closest('[data-rv-unreply]')) {
        if (!(await H.confirm('Remove your reply?', { ok: 'Remove' }))) return;
        try { await API.reviewReply(replying, ''); replying = null; toast('Reply removed'); load(); } catch (err) { H.fail(err); }
      }
    });
    el.addEventListener('submit', async e => {
      const f = e.target.closest('[data-rv-replyform]'); if (!f) return; e.preventDefault();
      const txt = f.querySelector('textarea').value.trim(); if (!txt) { f.querySelector('textarea').focus(); return; }
      try { await API.reviewReply(f.dataset.rvReplyform, txt); replying = null; toast('Reply posted'); load(); } catch (err) { H.fail(err); }
    });
    el.addEventListener('change', e => { if (e.target.id === 'rv-sort') { sort = e.target.value; showAll = false; load(); } });

    el.innerHTML = '<div class="skel" style="height:140px;border-radius:16px"></div>';
    load();
    return { reload: load };
  }

  window.R = { mount, stars };
})();
