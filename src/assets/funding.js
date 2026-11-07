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
  const logo = (o, sz) => `<span class="fu-logo" style="width:${sz}px;height:${sz}px;background:${esc(o.color || '#111')};font-size:${Math.round(sz * .36)}px;position:relative;overflow:hidden">${esc(initials(o.name))}${o.logo_url ? `<img src="${esc(o.logo_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#fff;border-radius:inherit">` : ''}</span>`;
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

  // Admins edit a listing right where founders see it. Saves straight to funding_opps (admin-only RLS).
  const CATS_ALL = ['Fintech', 'SaaS', 'Apps', 'AI', 'Commerce', 'Productivity', 'Dev Tools', 'Health', 'Education', 'Agriculture', 'Logistics', 'Infrastructure', 'Energy & Climate', 'Proptech'];
  const STAGES_ALL = ['Idea', 'Pre-seed', 'Seed', 'Series A', 'Growth'];
  const KINDS = [['grant', 'Grant'], ['prize', 'Prize'], ['competition', 'Competition'], ['accelerator', 'Accelerator'], ['vc', 'VC fund'], ['micro_vc', 'Micro-VC'], ['angel', 'Angel network']];
  function editSheet(o, onSaved) {
    const v = o || {}, today = new Date().toISOString().slice(0, 10);
    const t = (k, l, ph, type) => `<label class="field" style="margin-bottom:12px"><span class="field__label">${l}</span><input class="input" name="${k}" type="${type || 'text'}" value="${esc(v[k] == null ? '' : v[k])}"${ph ? ` placeholder="${esc(ph)}"` : ''}></label>`;
    const ta = (k, l, rows) => `<label class="field" style="margin-bottom:12px"><span class="field__label">${l}</span><textarea class="input" name="${k}" rows="${rows || 3}">${esc(v[k] || '')}</textarea></label>`;
    const chk = (k, l) => `<label class="check" style="margin:2px 0 10px"><input type="checkbox" name="${k}"${v[k] ? ' checked' : ''}><span class="check__box">${icon('check')}</span>${l}</label>`;
    const group = (k, l, opts) => `<div class="field" style="margin-bottom:12px"><span class="field__label">${l}</span><div class="row wrap gap-6" style="margin-top:4px">${opts.map(x => `<label class="chip" style="cursor:pointer"><input type="checkbox" name="${k}" value="${esc(x)}"${(v[k] || []).includes(x) ? ' checked' : ''} style="margin-right:6px">${esc(x)}</label>`).join('')}</div></div>`;
    const sel = (k, l, opts) => `<label class="field" style="margin-bottom:12px"><span class="field__label">${l}</span><select class="input" name="${k}">${opts.map(([a, b]) => `<option value="${a}"${v[k] === a ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select></label>`;
    const h = x => `<p class="t-label" style="margin:18px 0 10px;padding-top:14px;border-top:1px solid var(--color-border-default)">${x}</p>`;
    const sh = sheet(`<div class="row between gap-12"><p class="t-h4">Edit listing</p><button class="nav__icon" type="button" data-x aria-label="Close">${icon('x')}</button></div>
      <form id="fu-edit" style="max-height:68vh;overflow:auto;margin:12px -4px 0;padding:0 4px">
        <div class="row gap-12" style="align-items:center;margin-bottom:12px"><span id="fe-logo">${logo(v, 48)}</span><div class="grow" style="min-width:0">${t('logo_url', 'Logo (image link)', 'https://')}</div><label class="btn btn--secondary btn--sm" style="cursor:pointer;margin-top:10px">${icon('upload', 'ic-16')}Upload<input type="file" accept="image/*" class="sr-only" id="fe-up"></label></div>
        ${t('name', 'Name')}${t('org', 'Organisation')}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px">${sel('mode', 'Board', [['grant', 'Grants'], ['equity', 'Equity']])}${sel('kind', 'Type', KINDS)}</div>
        ${ta('description', 'Description', 3)}
        ${h('Links')}${t('apply_url', 'Apply link', 'https://')}${t('website', 'Website', 'https://')}${t('source_url', 'Source', 'https://')}
        ${h('Money')}<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px">${t('amount_text', 'Amount shown')}${t('amount_usd', 'Amount in USD', '', 'number')}</div>${t('amount_note', 'Amount note')}${t('slots_text', 'Slots', 'e.g. 20 grants')}
        ${h('Dates')}<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px">${t('deadline', 'Deadline', '', 'date')}${t('deadline_note', 'Deadline time', '23:59 WAT')}${t('decision_by', 'Results due', '', 'date')}${t('checked_at', 'Checked on', '', 'date')}</div>${t('round_note', 'Round note (when there’s no deadline)', '2026 round closed 8 Sep · opens yearly')}
        ${h('Who can apply')}${group('categories', 'Categories (none = any)', CATS_ALL)}${group('stages', 'Stages (none = any)', STAGES_ALL)}${t('countries', 'Country codes, comma separated (empty = all of Africa)', 'NG, KE')}${t('region_label', 'Region label')}
        ${chk('women_only', 'Women-founded or mixed teams only')}${chk('needs_incorporation', 'Must be incorporated')}${chk('needs_live', 'Product must be live')}
        ${h('Status')}${chk('active', 'Show to founders')}
      </form>
      <div class="row gap-8" style="margin-top:14px;justify-content:flex-end"><a class="btn btn--ghost btn--sm" href="/admin#funding/${esc(v.id || '')}" style="margin-right:auto">More in admin</a><button class="btn btn--secondary btn--sm" type="button" id="fe-checked">${icon('check', 'ic-14')}Save · checked today</button><button class="btn btn--primary btn--sm" type="button" id="fe-save">Save</button></div>`, { label: 'Edit listing', w: 600 });
    const f = sh.el.querySelector('#fu-edit');
    f.elements.countries.value = (v.countries || []).join(', ');
    const preview = () => { sh.el.querySelector('#fe-logo').innerHTML = logo(Object.assign({}, v, { name: f.elements.name.value, logo_url: f.elements.logo_url.value.trim() }), 48); };
    f.elements.logo_url.addEventListener('change', preview);
    sh.el.querySelector('#fe-up').addEventListener('change', async e => { const file = e.target.files[0]; if (!file) return; try { H.toast('Uploading…'); f.elements.logo_url.value = await API.upload(file, 'admin'); preview(); H.toast('Uploaded'); } catch (er) { H.fail(er); } });
    const save = async stamp => {
      const g = n => f.elements[n].value.trim();
      const row = { name: g('name'), org: g('org'), mode: g('mode'), kind: g('kind'), description: g('description'), logo_url: g('logo_url') || null,
        apply_url: g('apply_url'), website: g('website'), source_url: g('source_url'), amount_text: g('amount_text'), amount_note: g('amount_note'), slots_text: g('slots_text'),
        amount_usd: g('amount_usd') === '' ? null : +g('amount_usd'), deadline: g('deadline') || null, deadline_note: g('deadline_note'), decision_by: g('decision_by') || null,
        round_note: g('round_note'), checked_at: stamp ? today : g('checked_at') || null, region_label: g('region_label'),
        countries: g('countries').split(/[\s,]+/).filter(Boolean).map(x => x.toUpperCase().slice(0, 2)),
        categories: [...f.querySelectorAll('input[name="categories"]:checked')].map(i => i.value), stages: [...f.querySelectorAll('input[name="stages"]:checked')].map(i => i.value),
        women_only: f.elements.women_only.checked, needs_incorporation: f.elements.needs_incorporation.checked, needs_live: f.elements.needs_live.checked, active: f.elements.active.checked };
      if (row.name.length < 2) return H.toast('Add a name');
      if (!row.apply_url && !row.website) return H.toast('Add the link where founders apply');
      for (const k of ['apply_url', 'website', 'source_url', 'logo_url']) if (row[k] && !/^https?:\/\//i.test(row[k])) return H.toast('Links must start with https://');
      if (['vc', 'micro_vc', 'angel'].includes(row.kind) && row.mode === 'grant') return H.toast('Investors belong on the Equity board');
      if (row.deadline && row.deadline >= today) row.round_note = '';
      const b = sh.el.querySelector(stamp ? '#fe-checked' : '#fe-save'); b.disabled = true;
      try { await API.admin.saveFundingOpp(v.id, row); H.toast('Listing updated'); sh.close(); onSaved && onSaved(row); } catch (er) { H.fail(er); } finally { b.disabled = false; }
    };
    sh.el.querySelector('#fe-save').onclick = () => save(false);
    sh.el.querySelector('#fe-checked').onclick = () => save(true);
    return sh;
  }
  const editBtn = (o, cls) => window.API && API.isAdmin ? `<button class="nav__icon ${cls || ''}" type="button" data-edit="${esc(o.id)}" aria-label="Edit ${esc(o.name)}" title="Edit listing">${icon('edit', 'ic-16')}</button>` : '';

  // The checked link to the funder's own application page
  const linkBox = o => `<div class="fu-link">${icon('globe', 'ic-18')}<a class="grow" style="min-width:0" href="${esc(applyUrl(o))}" target="_blank" rel="noopener"><span class="t-label truncate" style="display:block">${esc(host(applyUrl(o)))}</span><span class="t-caption c-3" style="font-weight:400">${o.checked_at ? 'Link checked by Hentity on ' + fmtDate(o.checked_at) : 'Official page'}</span></a><button class="nav__icon" type="button" data-copylink="${esc(applyUrl(o))}" aria-label="Copy link">${icon('copy', 'ic-16')}</button></div>`;

  // The copy button in the funder link box
  function bindLink(el) {
    el.addEventListener('click', e => { const cl = e.target.closest('[data-copylink]'); if (cl) copy(cl.dataset.copylink, 'Link'); });
  }

  // Investor sheet: checked link, Save and Apply on site
  function investorSheet(o, p, pid, onChange) {
    const f = fit(o);
    const html = () => { const t = o.track, applied = t && t.status === 'applied';
      return `<div class="row gap-12" style="align-items:flex-start">${logo(o, 40)}<div class="grow" style="min-width:0"><p class="t-label">${esc(o.name)}</p><p class="t-caption c-3" style="font-weight:400">${esc(KIND[o.kind])} · ${esc(o.amount_text || 'Cheque not disclosed')} · ${esc(o.stages.join(', ') || 'Any stage')}</p></div><span class="badge ${f[1] ? 'badge--' + f[1] : ''}">${f[0]}</span></div>
      ${o.description ? `<p class="t-body-sm c-2" style="margin-top:14px">${esc(o.description)}</p>` : ''}
      <p class="t-body-sm c-2" style="margin:12px 0">Applications go through ${esc(o.org || o.name)} directly. Everything they ask for is on their page.${o.deadline ? ` Deadline ${fmtDate(o.deadline)}.` : ''}</p>
      ${linkBox(o)}
      <a class="btn btn--accent btn--block" style="margin-top:12px" href="${esc(applyUrl(o))}" target="_blank" rel="noopener" id="igo">${icon('arrow-up-right', 'ic-16')}Go to application</a>
      <hr style="border:0;border-top:1px solid var(--color-border-default);margin:12px 0">
      <p class="t-label">Keep track</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
        <button class="btn btn--secondary" type="button" id="isave" aria-pressed="${!!t}">${icon('bookmark', 'ic-16')}${t ? 'Saved' : 'Save'}</button>
        <button class="btn btn--secondary" type="button" id="iapplied" aria-pressed="${!!applied}">${icon('check', 'ic-16')}${applied ? 'Applied' : 'I’ve applied'}</button></div>
      <p class="t-caption c-3" style="font-weight:400;margin-top:12px">${applied ? `Marked applied. <button class="link" type="button" id="iunapply">Undo</button>` : 'Mark it applied to move it to “Applied”.'} <a class="link" href="/funding/${o.id}?p=${pid}">Full details</a></p>`; };
    const sh = sheet(html(), { label: o.name, w: 480 });
    const reload = async () => { try { const x = await API.fundingOpp(o.id, pid); Object.assign(o, { track: x.track }); p = x.product; sh.el.innerHTML = '<span class="fu-grab" aria-hidden="true"></span>' + html(); onChange && onChange(); } catch (e) { H.fail(e); } };
    bindLink(sh.el);
    sh.el.addEventListener('click', async e => {
      const act = async (fn, msg) => { try { await fn(); toast(msg); await reload(); } catch (er) { H.fail(er); } };
      if (e.target.closest('#isave')) { if (o.track && o.track.status === 'applied' && !(await H.confirm('Remove this from your tracker?', { body: 'It’s marked as applied, so you’ll stop getting its results reminder.', ok: 'Remove' }))) return; act(() => o.track ? API.fundingUntrack(o.id) : API.fundingTrack(o.id, pid, { status: 'saved', remind: true }), o.track ? 'Removed' : 'Saved'); return; }
      if (e.target.closest('#iapplied')) { if (!o.track || o.track.status !== 'applied') act(() => API.fundingTrack(o.id, pid, { status: 'applied', applied_at: new Date().toISOString() }), 'Marked as applied'); return; }
      if (e.target.closest('#iunapply')) { act(() => API.fundingTrack(o.id, pid, { status: 'saved', applied_at: null }), 'Moved back to saved'); return; }
      if (e.target.closest('#igo') && !o.track) API.fundingTrack(o.id, pid, { status: 'saved', remind: true }).then(reload).catch(() => {});
    });
    return sh;
  }

  window.FU = { CN, TEAM, KIND, TRACK, initials, logo, daysLeft, fmtDate, deadlineChip, deadlineText, howLabel, fit, dots, productLine, host, applyUrl, isOpen, pickPid, setPid, copy, sheet, linkBox, bindLink, investorSheet, editSheet, editBtn };
})();
