// Shared bits for Funding (/funding, /funding/:id). Funders take applications on their own sites;
// Hentity matches, helps founders get ready, reminds them and tracks what they saved and applied to.
(function () {
  const { esc, icon, store, toast } = H;
  const CN = { NG: 'Nigeria', KE: 'Kenya', GH: 'Ghana', ZA: 'South Africa', RW: 'Rwanda', EG: 'Egypt', MA: 'Morocco', SN: 'Senegal', ET: 'Ethiopia', UG: 'Uganda', TZ: 'Tanzania', CI: 'Côte d’Ivoire', CM: 'Cameroon', TN: 'Tunisia' };
  const TEAM = { women: 'Women-founded', mixed: 'Mixed founding team', men: 'Men-founded', unstated: 'Team not stated' };
  const KIND = { grant: 'Grant', prize: 'Prize', competition: 'Competition', vc: 'VC fund', angel: 'Angel network', accelerator: 'Accelerator', micro_vc: 'Micro-VC' };
  const TRACK = { saved: ['Saved', 'warning'], applied: ['Applied', 'info'] };
  const initials = n => (n || '?').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  // Funder logo over its initials; if the image fails to load the initials show through
  const logo = (o, sz) => `<span class="fu-logo" style="width:${sz}px;height:${sz}px;background:${esc(o.color || '#111')};font-size:${Math.round(sz * .36)}px;position:relative;overflow:hidden">${esc(initials(o.name))}${o.logo_url ? `<img src="${esc(o.logo_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#fff;padding:${Math.round(sz * .12)}px;box-sizing:border-box;border:1px solid var(--color-border-default);border-radius:inherit">` : ''}</span>`;
  const daysLeft = d => d ? Math.ceil((new Date(d + 'T23:59:59') - new Date()) / 864e5) : null;
  const fmtDate = (d, year) => d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', Object.assign({ day: 'numeric', month: 'short' }, year ? { year: 'numeric' } : {})) : '';
  const left = d => d <= 0 ? 'closes today' : d + ' day' + (d === 1 ? '' : 's') + ' left';
  // "Deadline 16 Nov · 9 days left" (red under 10 days), or "Rolling" / the round note when there's no date
  const deadlineChip = (o, long) => {
    const d = daysLeft(o.deadline);
    if (d == null) return `<span class="fu-chip">${icon('clock', 'ic-12')}${esc(o.round_note ? o.round_note.split('·')[0].trim() : 'Rolling deadline')}</span>`;
    const txt = long ? `Submission deadline: ${fmtDate(o.deadline, true)}${o.deadline_note ? ', ' + o.deadline_note : ''} · ${left(d)}` : `Deadline ${fmtDate(o.deadline)} · ${left(d)}`;
    return `<span class="fu-chip ${d < 10 ? 'fu-chip--red' : 'fu-chip--amber'}">${icon('clock', 'ic-12')}${esc(txt)}</span>`;
  };
  const deadlineText = o => o.deadline ? (o.closed || daysLeft(o.deadline) < 0 ? 'Closed ' : 'Deadline ') + fmtDate(o.deadline) : (o.round_note ? o.round_note.split('·')[0].trim() : 'Rolling');
  const howLabel = o => o.deadline ? 'Applications open' : o.apply_url && o.apply_url !== o.website ? 'Online form' : 'Form on their site';
  const fit = o => { const r = o.total ? o.meets / o.total : 0; return r >= 1 ? ['Strong match', 'success'] : r >= .6 ? ['Good match', 'info'] : ['Partial match', '']; };
  const dots = o => `<span class="fu-dots" aria-hidden="true">${Array.from({ length: o.total }, (_, i) => `<i${i < o.meets ? ' class="on"' : ''}></i>`).join('')}</span>`;
  const productLine = p => [(p.categories || [])[0], p.stage, [p.city, CN[p.country] || p.country].filter(Boolean).join(', '), p.team ? TEAM[p.team] : 'Founding team not set'].filter(Boolean).join(' · ');
  const host = u => { try { const x = new URL(u); return (x.host.replace(/^www\./, '') + x.pathname).replace(/\/$/, ''); } catch (e) { return u || ''; } };
  const applyUrl = o => o.apply_url || o.website;
  const isOpen = o => !!o.deadline || !o.round_note;   // closed rounds carry a round note and no date

  const pickPid = list => { const want = H.params().get('p') || store.get('fundingPid', ''); return (list.find(p => p.id === want) || list[0] || {}).id; };
  const setPid = id => store.set('fundingPid', id);
  const pickFile = accept => new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept || '.pdf,.pptx,.ppt,.xlsx,.xls,.csv,.png,.jpg,.jpeg'; i.onchange = () => res(i.files[0] || null); i.click(); });
  const copy = (text, what) => navigator.clipboard.writeText(text).then(() => toast((what || 'Text') + ' copied'), () => toast('Couldn’t copy', 'error'));

  function sheet(html, opts = {}) {
    const sc = document.createElement('div'); sc.className = 'scrim fu-scrim'; sc.style.zIndex = 95;
    sc.innerHTML = `<div class="modal fu-sheet" role="dialog" aria-modal="true" aria-label="${esc(opts.label || 'Dialog')}" style="max-width:${opts.w || 520}px"><span class="fu-grab" aria-hidden="true"></span>${html}</div>`;
    document.body.append(sc); document.body.style.overflow = 'hidden';
    const close = () => { sc.remove(); document.body.style.overflow = ''; };
    sc.addEventListener('click', e => { if (e.target === sc || e.target.closest('[data-x]')) close(); });
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
    return { el: sc.firstElementChild, close };
  }

  // The checked link to the funder's own application page
  const linkBox = o => `<div class="fu-link">${icon('globe', 'ic-18')}<a class="grow" style="min-width:0" href="${esc(applyUrl(o))}" target="_blank" rel="noopener"><span class="t-label truncate" style="display:block">${esc(host(applyUrl(o)))}</span><span class="t-caption c-3" style="font-weight:400">${o.checked_at ? 'Link checked by Hentity on ' + fmtDate(o.checked_at) : 'Official page'}</span></a><button class="nav__icon" type="button" data-copylink="${esc(applyUrl(o))}" aria-label="Copy link">${icon('copy', 'ic-16')}</button></div>`;

  // What funders usually ask for, from the product page, Studio and files the team uploaded
  function readyItems(o, p, kind) {
    const dr = p.dataroom || {}, f = k => dr[k] && dr[k].file;
    const up = k => f(k) ? `Uploaded to ${p.name} · v${dr[k].version || 1}` : 'Not uploaded yet';
    const beta = p.testers > 0 ? `Studio · ${p.testers} tester${p.testers === 1 ? '' : 's'}${p.beta_rating ? ' · ' + p.beta_rating + ' avg' : ''}` : 'No beta test yet · optional';
    const all = {
      pitch: { k: 'pitch', ic: 'sparkles', t: 'One-line pitch', s: p.tagline ? 'From your product page' : 'Add a tagline to your product page', ok: !!p.tagline, act: p.tagline ? 'copy' : 'edit' },
      traction: { k: 'traction', ic: 'bar-chart', t: 'Traction', s: dr.traction && dr.traction.text ? dr.traction.text : 'Users, revenue or growth in a line', ok: !!(dr.traction && dr.traction.text), act: dr.traction && dr.traction.text ? 'copy' : 'write' },
      deck: { k: 'deck', ic: 'file-text', t: 'Pitch deck', s: up('deck'), ok: !!f('deck'), act: f('deck') ? 'download' : 'upload' },
      beta: { k: 'beta', ic: 'flask', t: 'Beta results summary', s: beta, ok: p.testers > 0, opt: true, act: p.testers > 0 ? 'download' : 'studio' },
      financials: { k: 'financials', ic: 'bar-chart', t: 'Financials (last 6 months)', s: up('financials'), ok: !!f('financials'), act: f('financials') ? 'download' : 'upload' },
      incorporation: { k: 'incorporation', ic: 'file-text', t: 'Incorporation certificate', s: up('incorporation'), ok: !!f('incorporation'), act: f('incorporation') ? 'download' : 'upload' },
      link: { k: 'link', ic: 'package', t: 'Product page link', s: 'hentity.com/products/' + p.slug, ok: true, act: 'copylink' }
    };
    const keys = kind === 'equity' ? ['deck', 'traction', 'link'] : ['pitch', 'traction', 'deck', 'beta', 'financials'].concat(o.needs_incorporation ? ['incorporation'] : []);
    return keys.map(k => all[k]);
  }
  const ACT = { copy: ['copy', 'Copy'], copylink: ['copy', 'Copy'], download: ['download', 'Download'], upload: ['upload', 'Add'], write: ['plus', 'Add'], edit: ['plus', 'Add'], studio: ['flask', 'Studio'] };
  function readyList(o, p, kind, marks) {
    return readyItems(o, p, kind).map(i => `<div class="fu-ready">${marks ? (i.ok ? `<span class="fu-ok">${icon('check', 'ic-12')}</span>` : i.opt ? '<span class="fu-todo"></span>' : `<span class="fu-no">${icon('alert-circle', 'ic-12')}</span>`) : `<span class="fu-ib">${icon(i.ic, 'ic-16')}</span>`}
      <div style="min-width:0" class="grow"><p class="t-label">${esc(i.t)}</p><p class="t-caption ${!i.ok && !i.opt ? 'fu-red' : 'c-3'} truncate" style="font-weight:400">${esc(i.s)}</p></div>
      ${i.ok && ['download'].includes(i.act) ? `<button class="nav__icon" type="button" data-rd="replace" data-k="${i.k}" aria-label="Replace ${esc(i.t)}" title="Replace">${icon('upload', 'ic-14')}</button>` : ''}
      ${i.ok && i.k === 'traction' ? `<button class="nav__icon" type="button" data-rd="write" data-k="traction" aria-label="Edit traction" title="Edit">${icon('edit', 'ic-14')}</button>` : ''}
      <button class="btn btn--ghost btn--sm fu-ract" type="button" data-rd="${i.act}" data-k="${i.k}">${icon(ACT[i.act][0], 'ic-14')}${ACT[i.act][1]}</button></div>`).join('');
  }
  // Wire the "Get ready" buttons. ctx: { o, p, pid, reload }
  function bindReady(el, ctx) {
    el.addEventListener('click', async e => {
      const cl = e.target.closest('[data-copylink]'); if (cl) { copy(cl.dataset.copylink, 'Link'); return; }
      const b = e.target.closest('[data-rd]'); if (!b) return;
      const { p, pid } = ctx, k = b.dataset.k, a = b.dataset.rd, dr = p.dataroom || {};
      if (a === 'copy') { copy(k === 'pitch' ? p.tagline : (dr.traction || {}).text || '', k === 'pitch' ? 'Pitch' : 'Traction'); return; }
      if (a === 'copylink') { copy('https://hentity.com/products/' + p.slug, 'Link'); return; }
      if (a === 'edit') { location.href = `/products/${p.slug}/edit`; return; }
      if (a === 'studio') { location.href = '/studio'; return; }
      if (a === 'write') { writeTraction(pid, (dr.traction || {}).text || '', ctx.reload); return; }
      if (a === 'upload' || a === 'replace') {
        const f = await pickFile(k === 'deck' ? '.pdf,.pptx,.ppt' : undefined); if (!f) return;
        const lab = b.innerHTML; b.disabled = true; b.textContent = 'Uploading…';
        try { await API.dataroomUpload(pid, k, f); toast('Uploaded'); ctx.reload && ctx.reload(); } catch (er) { H.fail(er); b.disabled = false; b.innerHTML = lab; }
        return;
      }
      if (a === 'download' && k === 'beta') {
        const txt = `${p.name}: beta results\n\nTesters: ${p.testers}${p.beta_rating ? `\nAverage ease rating: ${p.beta_rating} / 5` : ''}${p.comments ? `\nComments on Hentity: ${p.comments}` : ''}\n\nProduct page: https://hentity.com/products/${p.slug}\nFrom Hentity Studio, ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}\n`;
        const u = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); const l = document.createElement('a'); l.href = u; l.download = p.slug + '-beta-results.txt'; l.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); return;
      }
      if (a === 'download') {
        try { const rows = await API.dataroom(pid); const r = rows.find(x => x.kind === k && x.path); if (!r) throw new Error('File not found'); window.open(await API.dataroomLink(r.path, 0.02), '_blank', 'noopener'); } catch (er) { H.fail(er); }
      }
    });
  }
  function writeTraction(pid, cur, done) {
    const sh = sheet(`<p class="t-h4">Traction</p><p class="t-body-sm c-2" style="margin-top:6px">Users, revenue, growth or pilots, in a line. You can copy it into any application.</p>
      <textarea class="input" id="wt" rows="3" maxlength="300" style="margin-top:12px" placeholder="400 farmers · 61% weekly active">${esc(cur)}</textarea>
      <div class="row gap-8" style="justify-content:flex-end;margin-top:12px"><button class="btn btn--ghost btn--sm" type="button" data-x>Cancel</button><button class="btn btn--primary btn--sm" type="button" id="ws">Save</button></div>`, { label: 'Traction' });
    const t = sh.el.querySelector('#wt'); t.focus();
    sh.el.querySelector('#ws').onclick = async () => { try { await API.dataroomText(pid, 'traction', t.value.trim()); sh.close(); toast('Saved'); done && done(); } catch (e) { H.fail(e); } };
  }

  // Investor sheet: checked link, what to have ready, Save and Apply on site
  function investorSheet(o, p, pid, onChange) {
    const f = fit(o), saved = o.track;
    const html = () => `<div class="row gap-12" style="align-items:flex-start">${logo(o, 40)}<div class="grow" style="min-width:0"><p class="t-label">${esc(o.name)}</p><p class="t-caption c-3" style="font-weight:400">${esc(KIND[o.kind])} · ${esc(o.amount_text || 'Cheque not disclosed')} · ${esc(o.stages.join(', ') || 'Any stage')}</p></div><span class="badge ${f[1] ? 'badge--' + f[1] : ''}">${f[0]}</span></div>
      ${o.description ? `<p class="t-body-sm c-2" style="margin-top:14px">${esc(o.description)}</p>` : ''}
      <p class="t-body-sm c-2" style="margin:14px 0 10px">${esc(o.org || o.name)} takes applications on its own site.${o.deadline ? ` Deadline ${fmtDate(o.deadline)}.` : ''}</p>
      ${linkBox(o)}
      <p class="t-label" style="margin:18px 0 2px">Have these ready</p>
      <div class="fu-readyl">${readyList(o, p, 'equity', false)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:18px"><button class="btn btn--secondary" type="button" id="isave">${icon('bookmark', 'ic-16')}${o.track ? (o.track.status === 'applied' ? 'Applied' : 'Saved') : 'Save'}</button>
        <a class="btn btn--accent" href="${esc(applyUrl(o))}" target="_blank" rel="noopener">${icon('arrow-up-right', 'ic-16')}Apply on site</a></div>
      <p class="t-caption c-3" style="font-weight:400;margin-top:10px;text-align:center"><a class="link" href="/funding/${o.id}?p=${pid}">Full details</a>${o.track && o.track.status !== 'applied' ? ' · <button class="link" type="button" id="iapplied">I’ve applied</button>' : ''}</p>`;
    const sh = sheet(html(), { label: o.name, w: 480 });
    const reload = async () => { try { const x = await API.fundingOpp(o.id, pid); Object.assign(o, { track: x.track }); p = x.product; sh.el.innerHTML = '<span class="fu-grab" aria-hidden="true"></span>' + html(); onChange && onChange(); } catch (e) { H.fail(e); } };
    bindReady(sh.el, { o, get p() { return p; }, pid, reload });
    sh.el.addEventListener('click', async e => {
      if (e.target.closest('#isave')) { try { if (o.track) await API.fundingUntrack(o.id); else await API.fundingTrack(o.id, pid, { status: 'saved' }); toast(o.track ? 'Removed' : 'Saved'); await reload(); } catch (er) { H.fail(er); } }
      if (e.target.closest('#iapplied')) { try { await API.fundingTrack(o.id, pid, { status: 'applied', applied_at: new Date().toISOString() }); toast('Marked as applied'); await reload(); } catch (er) { H.fail(er); } }
    });
    return sh;
  }

  window.FU = { CN, TEAM, KIND, TRACK, initials, logo, daysLeft, fmtDate, deadlineChip, deadlineText, howLabel, fit, dots, productLine, host, applyUrl, isOpen, pickPid, setPid, pickFile, copy, sheet, linkBox, readyItems, readyList, bindReady, writeTraction, investorSheet };
})();
