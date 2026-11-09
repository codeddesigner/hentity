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
  // Tiers come from the server (funding_fit): best (the 12 strongest), good, possible, ineligible, closed
  const TIER = { best: ['Best match', 'success'], good: ['Good fit', 'info'], possible: ['Possible fit', ''], ineligible: ['Not eligible', 'error'], closed: ['Closed now', ''] };
  const fit = o => TIER[o.tier] || (o.status === 'closed' ? TIER.closed : o.eligible === false ? TIER.ineligible : TIER.possible);
  // One line on why: what fits, or the rule that rules it out
  const why = (o, name) => o.tier === 'closed' ? (o.round_note || 'This round has closed') : o.eligible === false ? 'Not eligible: ' + (o.miss || 'a rule doesn’t fit') : (o.why || []).length ? 'Fits on ' + o.why.join(' · ') : o.status === 'unknown' ? 'Dates not announced yet' : 'Open to any sector, stage and country';
  const dots = o => `<span class="fu-dots" aria-hidden="true">${Array.from({ length: o.total }, (_, i) => `<i${i < o.meets ? ' class="on"' : ''}></i>`).join('')}</span>`;
  const productLine = p => [(p.categories || [])[0], p.stage, [p.city, (window.H && H.COUNTRY[p.country]) || CN[p.country] || p.country].filter(Boolean).join(', '), p.team ? TEAM[p.team] : 'Founding team not set'].filter(Boolean).join(' · ');
  const host = u => { try { const x = new URL(u); return (x.host.replace(/^www\./, '') + x.pathname).replace(/\/$/, ''); } catch (e) { return u || ''; } };
  const applyUrl = o => o.apply_url || o.website;
  const isOpen = o => o.status ? ['open', 'rolling'].includes(o.status) : (!!o.deadline || !o.round_note);   // closed rounds carry a round note and no date

  // Public, readable URL for a listing: /funding/<name>-<id> (the id alone still works)
  const slug = n => String(n || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, 'and').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70).replace(/-$/, '');
  const path = o => '/funding/' + (slug(o.name) ? slug(o.name) + '-' : '') + o.id;
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const idFrom = seg => ((seg || '').match(UUID) || [seg || ''])[0];
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

  // ---------------------------------------------------------------- deck → matching signals
  // The deck is read here, in the founder's browser (pdf.js, served from our own assets). Only the
  // signals the founder reviews are saved: sectors, keywords, stage, raise, markets. Never the file.
  const SECTOR_WORDS = {
    Fintech: ['fintech', 'payments', 'payment', 'lending', 'loans', 'loan', 'credit', 'wallet', 'remittance', 'remittances', 'banking', 'neobank', 'insurance', 'insurtech', 'savings', 'merchant payments', 'bnpl', 'crypto', 'stablecoin', 'microfinance', 'cross-border'],
    Health: ['health', 'healthcare', 'healthtech', 'clinic', 'clinics', 'hospital', 'hospitals', 'patients', 'pharmacy', 'pharmacies', 'telemedicine', 'diagnostics', 'medical', 'maternal', 'doctors'],
    Education: ['education', 'edtech', 'students', 'learning', 'school', 'schools', 'teachers', 'courses', 'tutoring', 'curriculum', 'upskilling', 'learners'],
    Agriculture: ['agriculture', 'agritech', 'farmers', 'farm', 'farming', 'crops', 'harvest', 'livestock', 'food security', 'smallholder', 'agribusiness', 'irrigation'],
    Logistics: ['logistics', 'delivery', 'deliveries', 'shipping', 'freight', 'fleet', 'last-mile', 'last mile', 'courier', 'supply chain', 'trucking', 'warehousing', 'mobility'],
    Commerce: ['e-commerce', 'ecommerce', 'marketplace', 'retail', 'retailers', 'merchants', 'informal retail', 'fmcg', 'social commerce', 'distribution', 'shoppers'],
    'Energy & Climate': ['solar', 'energy', 'climate', 'carbon', 'renewable', 'clean energy', 'emissions', 'electric vehicles', 'battery', 'batteries', 'off-grid', 'recycling', 'waste', 'cleantech', 'climate tech', 'water'],
    AI: ['artificial intelligence', 'machine learning', 'llm', 'llms', 'computer vision', 'nlp', 'generative ai', 'ai-powered', 'ai agents', 'deep learning'],
    SaaS: ['saas', 'software', 'subscription', 'b2b software', 'dashboard', 'erp', 'crm', 'workflow'],
    Proptech: ['real estate', 'property', 'properties', 'housing', 'rent', 'rental', 'landlords', 'landlord', 'mortgage', 'proptech', 'tenants', 'construction'],
    'Dev Tools': ['developers', 'developer', 'sdk', 'apis', 'devtools', 'open source'],
    Infrastructure: ['infrastructure', 'cloud', 'connectivity', 'data center', 'broadband', 'identity', 'kyc']
  };
  const COUNTRY_NAMES = { Nigeria: 'NG', Kenya: 'KE', Ghana: 'GH', 'South Africa': 'ZA', Rwanda: 'RW', Egypt: 'EG', Morocco: 'MA', Senegal: 'SN', Ethiopia: 'ET', Uganda: 'UG', Tanzania: 'TZ', 'Côte d’Ivoire': 'CI', "Cote d'Ivoire": 'CI', 'Ivory Coast': 'CI', Cameroon: 'CM', Tunisia: 'TN', Algeria: 'DZ', Benin: 'BJ', Togo: 'TG', Zambia: 'ZM', Zimbabwe: 'ZW' };
  const STOP = new Set(('the and for with that this from your our are you was were will have has had not but can all any its into out about more most also than then they them their there what when where which who how why per via over under each other such only own same some just very new one two three four five ten year years month months day days week weeks today million billion thousand usd ngn kes percent '
    + 'market markets team problem solution solutions revenue revenues growth customers customer users user product products traction competition competitors business model models startup startups company companies opportunity vision mission funding round raise raising ask use uses using platform service services africa african pitch deck slide slides contact thank thanks www com http https email phone total size sizes plan plans strategy launch launched based help helps make makes made first next build built across world global local data time key core value people need needs access better best leading largest').split(' '));
  const esc_re = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function readDeck(raw) {
    const text = ' ' + raw.replace(/\s+/g, ' ') + ' ', low = text.toLowerCase();
    const count = w => (low.match(new RegExp('(^|[^a-z])' + esc_re(w) + '(?=[^a-z]|$)', 'g')) || []).length;
    // Sectors: how often each sector's words come up
    const hits = Object.entries(SECTOR_WORDS).map(([s, ws]) => [s, ws.reduce((n, w) => n + count(w), 0), ws.filter(w => count(w) > 0)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
    const sectors = hits.filter((x, i) => x[1] >= 3 || (i < 2 && x[1] >= 2)).slice(0, 3).map(x => x[0]);
    // Stage
    const stage = /series[ -]a\b/i.test(text) && /(raising|round|seeking)[^.]{0,40}series[ -]a/i.test(text) ? 'Series A' : /pre[- ]?seed/i.test(text) ? 'Pre-seed' : /\bseed (round|stage|funding|raise)\b|raising[^.]{0,30}\bseed\b/i.test(text) ? 'Seed' : /\b(idea stage|pre-product|prototype stage)\b/i.test(text) ? 'Idea' : '';
    // Raise: "raising $750k", "seeking USD 1.2M", "the ask: $500,000"
    let raise_usd = null;
    const m = text.match(/(raising|raise of|seeking|looking for|the ask|our ask|ask:|round of|round size)[^$\d]{0,30}(?:\$|usd|us\$)\s?([\d.,]+)\s?(k|m|mn|million|thousand)?/i);
    if (m) { const v = parseFloat(m[2].replace(/,/g, '')); const u = (m[3] || '').toLowerCase(); raise_usd = Math.round(v * (u === 'k' || u === 'thousand' ? 1e3 : u.startsWith('m') ? 1e6 : 1)); if (!(raise_usd >= 1000 && raise_usd < 1e9)) raise_usd = null; }
    // Markets
    const countries = Object.entries(COUNTRY_NAMES).filter(([n]) => new RegExp('\\b' + esc_re(n) + '\\b', 'i').test(text)).map(x => x[1]).filter((v, i, a) => a.indexOf(v) === i).slice(0, 8);
    const women = /\b(female|woman|women)[- ](founder|founded|led|ceo|co-?founder)s?\b|\bfounded by (a )?wom[ae]n\b/i.test(text) ? true : null;
    // Keywords: the sector words found first (they're what funders write too), then frequent specific terms
    const domain = hits.flatMap(x => x[2]).filter(w => w.length >= 3);
    const freq = {};
    (low.match(/[a-z][a-z-]{3,24}/g) || []).forEach(w => { if (!STOP.has(w) && !/^-|-$/.test(w)) freq[w] = (freq[w] || 0) + 1; });
    const common = Object.entries(freq).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).map(x => x[0]);
    const all = [...new Set(domain.concat(common))];
    const keywords = all.filter(w => !all.includes(w + 's') || /ss$/.test(w)).slice(0, 24);   // "payment" and "payments": keep one
    return { sectors, stage, raise_usd, countries, women, keywords, chars: raw.length };
  }
  async function pdfText(file, onPage) {
    const pdfjs = await import('/assets/pdfjs-6.2.108/pdf.min.js');
    pdfjs.GlobalWorkerOptions.workerSrc = '/assets/pdfjs-6.2.108/pdf.worker.min.js';
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const n = Math.min(doc.numPages, 40); let out = '';
    for (let i = 1; i <= n; i++) { onPage && onPage(i, n); const pg = await doc.getPage(i); const c = await pg.getTextContent(); out += c.items.map(x => x.str).join(' ') + '\n'; }
    doc.destroy && doc.destroy();
    return out;
  }
  const money = v => v >= 1e6 ? '$' + (Math.round(v / 1e5) / 10) + 'M' : '$' + Math.round(v / 1e3) + 'k';
  const SECTORS_ALL = CATS_ALL.filter(c => !['Apps', 'Productivity'].includes(c));
  function deckSheet(p, pid, onSaved) {
    const d = p.deck || null;
    let R = d ? { sectors: d.sectors || [], stage: d.stage || '', raise_usd: d.raise_usd, countries: d.countries || [], women: d.women, keywords: d.keywords || [], deck_name: d.deck_name, source: d.source, summary: d.summary } : null;
    const sh = sheet('', { label: 'Sharpen your matches', w: 560 });
    const head = `<div class="row between gap-12"><div><p class="t-h4">Sharpen your matches</p><p class="t-body-sm c-2" style="margin-top:4px">Add your pitch deck and we’ll match on what ${esc(p.name)} actually does: sector, stage, how much you’re raising and where you operate.</p></div><button class="nav__icon" type="button" data-x aria-label="Close">${icon('x')}</button></div>`;
    const priv = `<p class="fu-priv">${icon('lock', 'ic-14')}<span>Your deck is read on this device and never uploaded. Hentity keeps only what you confirm below, and only your team can see it.</span></p>`;
    const pick = () => {
      sh.el.innerHTML = `<span class="fu-grab" aria-hidden="true"></span>${head}
        <label class="fu-drop" id="dk-drop">${icon('upload', 'ic-20')}<span class="t-label">Choose your deck</span><span class="t-caption c-3" style="font-weight:400">PDF, up to 40 pages. Export from Slides, Keynote or PowerPoint as PDF.</span><input type="file" accept="application/pdf,.pdf" class="sr-only" id="dk-file"></label>
        <details class="fu-or"><summary>No deck to hand? Describe ${esc(p.name)} instead</summary><textarea class="input" id="dk-text" rows="5" maxlength="600" placeholder="What you do, who for, where you operate, your stage and how much you’re raising">${esc(d && d.source === 'text' ? d.summary || '' : '')}</textarea><button class="btn btn--secondary btn--sm" type="button" id="dk-read" style="margin-top:8px">Use this description</button></details>
        ${priv}`;
      const drop = sh.el.querySelector('#dk-drop');
      ['dragover', 'dragenter'].forEach(k => drop.addEventListener(k, e => { e.preventDefault(); drop.classList.add('is-over'); }));
      ['dragleave', 'drop'].forEach(k => drop.addEventListener(k, () => drop.classList.remove('is-over')));
      drop.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) fromFile(f); });
      sh.el.querySelector('#dk-file').addEventListener('change', e => { const f = e.target.files[0]; if (f) fromFile(f); });
      sh.el.querySelector('#dk-read').addEventListener('click', () => { const t = sh.el.querySelector('#dk-text').value.trim(); if (t.length < 40) return toast('Add a few sentences first'); R = Object.assign(readDeck(t), { source: 'text', summary: t, deck_name: null }); review(true); });
    };
    async function fromFile(f) {
      if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) return toast('Export your deck as a PDF first', 'error');
      if (f.size > 40 * 1024 * 1024) return toast('That PDF is over 40 MB', 'error');
      sh.el.querySelector('#dk-drop').innerHTML = `<span class="spinner" aria-hidden="true"></span><span class="t-label" id="dk-prog">Reading ${esc(f.name)}…</span><span class="t-caption c-3" style="font-weight:400">On your device. Nothing is uploaded.</span>`;
      try {
        const txt = await pdfText(f, (i, n) => { const el = sh.el.querySelector('#dk-prog'); if (el) el.textContent = `Reading page ${i} of ${n}…`; });
        if (txt.replace(/\s/g, '').length < 200) { pick(); sh.el.querySelector('.fu-or').open = true; toast('This PDF is mostly images, so there’s no text to read. Describe your startup instead.', 'error'); return; }
        R = Object.assign(readDeck(txt), { source: 'deck', summary: null, deck_name: f.name.slice(0, 120) }); review(true);
      } catch (e) { console.warn(e); pick(); toast('Couldn’t read that PDF. Try exporting it again, or describe your startup instead.', 'error'); }
    }
    function review(fresh) {
      const opt = (k, v, l, on) => `<label class="chip fu-pick"><input type="checkbox" class="sr-only" data-k="${k}" value="${esc(v)}"${on ? ' checked' : ''}>${icon('check')}${esc(l)}</label>`;
      const ccs = [...new Set(R.countries.concat(p.country ? [p.country] : []))];
      sh.el.innerHTML = `<span class="fu-grab" aria-hidden="true"></span><div class="row between gap-12"><div><p class="t-h4">${fresh ? 'Here’s what we read' : 'What we match on'}</p><p class="t-body-sm c-2" style="margin-top:4px">${R.source === 'deck' && R.deck_name ? `From ${esc(R.deck_name)}. ` : R.source === 'text' ? 'From your description. ' : ''}Fix anything that’s off, then save.</p></div><button class="nav__icon" type="button" data-x aria-label="Close">${icon('x')}</button></div>
        <div class="fu-rev">
          <p class="fu-rl">Sectors <span>Pick up to 3</span></p><div class="row wrap gap-6">${SECTORS_ALL.map(c => opt('sector', c, c, R.sectors.includes(c))).join('')}</div>
          <div class="fu-rg"><label class="field"><span class="field__label">Stage</span><select class="input" id="dk-stage"><option value="">Not sure</option>${STAGES_ALL.map(s => `<option${R.stage === s ? ' selected' : ''}>${s}</option>`).join('')}</select></label>
            <label class="field"><span class="field__label">Raising (USD)</span><input class="input" id="dk-raise" inputmode="numeric" placeholder="e.g. 500000" value="${R.raise_usd || ''}"></label></div>
          <p class="fu-rl">Where you operate <span>Your product’s country is always included</span></p><div class="row wrap gap-6">${Object.entries(CN).map(([k, n]) => opt('cc', k, n, ccs.includes(k))).join('')}</div>
          <label class="check" style="margin-top:14px"><input type="checkbox" id="dk-women"${R.women ? ' checked' : ''}><span class="check__box">${icon('check')}</span>A woman is a founder (unlocks women-founder funds)</label>
          <p class="fu-rl">Keywords we match against funders <span>Tap to remove</span></p><div class="row wrap gap-6" id="dk-kw">${R.keywords.length ? R.keywords.map(k => `<button class="chip" type="button" data-kw="${esc(k)}">${esc(k)}${icon('x', 'ic-12')}</button>`).join('') : '<span class="t-caption c-3" style="font-weight:400">None found. Matching uses your sectors.</span>'}</div>
        </div>
        ${priv}
        <div class="row gap-8" style="margin-top:14px;justify-content:flex-end">${d ? `<button class="btn btn--ghost btn--sm" type="button" id="dk-del" style="margin-right:auto">Remove</button>` : ''}<button class="btn btn--secondary btn--sm" type="button" id="dk-again">${R.source === 'text' ? 'Use a deck' : 'Use another deck'}</button><button class="btn btn--primary btn--sm" type="button" id="dk-save">Save and rematch</button></div>`;
      sh.el.querySelectorAll('[data-k="sector"]').forEach(i => i.addEventListener('change', () => { if (sh.el.querySelectorAll('[data-k="sector"]:checked').length > 3) { i.checked = false; toast('Pick up to 3 sectors'); } }));
    }
    sh.el.addEventListener('click', async e => {
      const kw = e.target.closest('[data-kw]'); if (kw) { R.keywords = R.keywords.filter(k => k !== kw.dataset.kw); kw.remove(); return; }
      if (e.target.closest('#dk-again')) { pick(); return; }
      if (e.target.closest('#dk-del')) { try { await API.fundingProfileRemove(pid); toast('Deck details removed'); sh.close(); onSaved && onSaved(); } catch (er) { H.fail(er); } return; }
      const sv = e.target.closest('#dk-save'); if (!sv) return;
      const raise = +String(sh.el.querySelector('#dk-raise').value).replace(/[^\d.]/g, '') || null;
      const row = { sectors: [...sh.el.querySelectorAll('[data-k="sector"]:checked')].map(i => i.value), stage: sh.el.querySelector('#dk-stage').value || null, raise_usd: raise,
        countries: [...sh.el.querySelectorAll('[data-k="cc"]:checked')].map(i => i.value), women: sh.el.querySelector('#dk-women').checked ? true : null,
        keywords: R.keywords.slice(0, 30), source: R.source || 'deck', deck_name: R.deck_name || null, summary: R.source === 'text' ? (R.summary || '').slice(0, 600) : null };
      sv.disabled = true;
      try { await API.fundingProfileSave(pid, row); toast('Saved. Matches updated.'); sh.close(); onSaved && onSaved(); } catch (er) { H.fail(er); sv.disabled = false; }
    });
    R ? review(false) : pick();
    return sh;
  }
  const deckLine = d => d ? [d.source === 'deck' ? (d.deck_name || 'Your deck') : 'Your description', (d.sectors || []).join(', '), d.stage, d.raise_usd ? 'raising ' + money(d.raise_usd) : ''].filter(Boolean).join(' · ') : '';

  // ---- members suggest a grant or investor (o = null), or a fix to a listing (o). An admin approves before anything changes.
  const ST_LABEL = { pending: ['Waiting for review', ''], approved: ['Added', 'badge--success'], rejected: ['Not added', ''], duplicate: ['Already listed', ''] };
  async function suggestSheet(o, mode) {
    if (!API.uid) { location.href = '/signin?next=' + encodeURIComponent(location.pathname + location.search); return; }
    const fix = !!o, today = new Date().toISOString().slice(0, 10);
    const mine = fix ? [] : await API.fundingSuggestions().catch(() => []);
    const t = (k, l, ph, type, req) => `<label class="field" style="margin-bottom:12px"><span class="field__label">${l}${req ? '' : ' <span class="c-3" style="font-weight:400">(optional)</span>'}</span><input class="input" name="${k}" type="${type || 'text'}"${ph ? ` placeholder="${esc(ph)}"` : ''}${req ? ' required' : ''}></label>`;
    const ISSUES = [['deadline', 'Deadline changed'], ['amount', 'Amount changed'], ['link', 'Link is broken'], ['closed', 'Not running any more'], ['other', 'Something else']];
    const body = fix
      ? `<p class="t-body-sm c-2" style="margin:4px 0 14px">Tell us what’s changed on <b style="font-weight:500">${esc(o.name)}</b>. An admin checks it against the funder’s site before updating the listing.</p>
        <div class="field" style="margin-bottom:12px"><span class="field__label">What’s wrong?</span><div class="row wrap gap-6" style="margin-top:6px" id="iss">${ISSUES.map(([k, l]) => `<label class="chip fs-pick" style="cursor:pointer"><input type="checkbox" class="sr-only" value="${k}">${icon('check')}${l}</label>`).join('')}</div></div>
        <div id="fx-deadline" hidden>${t('deadline', 'New deadline', '', 'date')}</div><div id="fx-amount" hidden>${t('amount_text', 'New amount', 'e.g. Up to $50,000')}</div><div id="fx-link" hidden>${t('apply_url', 'Working link', 'https://')}</div>
        <label class="field" style="margin-bottom:12px"><span class="field__label">Details</span><textarea class="input" name="note" rows="3" placeholder="What changed, and where you saw it" required></textarea></label>
        ${t('source_url', 'Where you saw it', 'https://')}`
      : `<p class="t-body-sm c-2" style="margin:4px 0 14px">Know a grant, prize or investor backing African startups that we don’t list? Share it. An admin checks it before it goes live, and the listing shows you shared it.</p>
        <div class="field" style="margin-bottom:12px"><span class="field__label">What is it?</span><div class="row wrap gap-6" style="margin-top:6px">${[['grant', 'Grant, prize or competition'], ['equity', 'Investor or accelerator']].map(([v, l]) => `<label class="chip fs-pick" style="cursor:pointer"><input type="radio" class="sr-only" name="mode" value="${v}"${(mode || 'grant') === v ? ' checked' : ''}>${icon('check')}${l}</label>`).join('')}</div></div>
        ${t('name', 'Name', 'e.g. Tony Elumelu Foundation Entrepreneurship Programme', '', true)}${t('org', 'Who runs it', 'e.g. Tony Elumelu Foundation')}
        ${t('apply_url', 'Link to apply or learn more', 'https://', 'url', true)}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px">${t('amount_text', 'Amount', 'e.g. $5,000 non-dilutive')}${t('deadline', 'Deadline', '', 'date')}</div>
        ${t('countries', 'Countries it’s open to', 'e.g. All of Africa, or NG, KE, GH')}
        <label class="field" style="margin-bottom:12px"><span class="field__label">Anything founders should know <span class="c-3" style="font-weight:400">(optional)</span></span><textarea class="input" name="note" rows="3" placeholder="Who it’s for, stage, what you get"></textarea></label>`;
    const S = sheet(`<div class="row between gap-12"><p class="t-h4">${fix ? 'Suggest a fix' : 'Suggest an opportunity'}</p><button class="nav__icon" type="button" data-x aria-label="Close">${icon('x')}</button></div>
      <style>.fs-pick .ic{display:none}.fs-pick:has(input:checked){background:var(--color-text-primary);color:var(--color-bg-canvas);border-color:transparent}.fs-pick:has(input:checked) .ic{display:inline-block}.fs-pick:has(input:focus-visible){outline:2px solid var(--color-accent-default);outline-offset:2px}</style><form id="fsug" style="max-height:70vh;overflow:auto;margin:8px -4px 0;padding:0 4px">${body}
        <div class="row gap-8" style="margin-top:4px"><button class="btn btn--primary" type="submit">${icon('send')}${fix ? 'Send fix' : 'Send for review'}</button><button class="btn btn--ghost" type="button" data-x>Cancel</button></div>
        ${mine.length ? `<p class="t-label" style="margin:22px 0 8px;padding-top:16px;border-top:1px solid var(--color-border-default)">Your suggestions</p>${mine.slice(0, 8).map(m => `<div class="row between gap-12 t-body-sm" style="padding:6px 0"><span class="truncate">${m.status === 'approved' && m.result_opp ? `<a class="link" href="/funding/${m.result_opp}">${esc(m.name || 'Fix')}</a>` : esc(m.name || 'Fix')}${m.kind === 'fix' ? ' <span class="c-3">(fix)</span>' : ''}</span><span class="badge ${ST_LABEL[m.status][1]}">${ST_LABEL[m.status][0]}</span></div>`).join('')}` : ''}</form>`, { label: fix ? 'Suggest a fix' : 'Suggest an opportunity', w: 540 });
    const f = S.el.querySelector('#fsug');
    f.addEventListener('change', e => { const c = e.target.closest('#iss input'); if (c) { const on = c.checked; ['deadline', 'amount', 'link'].includes(c.value) && (f.querySelector('#fx-' + c.value).hidden = !on); } });
    f.querySelector('[name=deadline]') && (f.querySelector('[name=deadline]').min = today);
    f.onsubmit = async e => {
      e.preventDefault();
      const g = n => (f.querySelector(`[name="${n}"]`) || {}).value ? f.querySelector(`[name="${n}"]`).value.trim() : '';
      let data = {}, note = g('note');
      if (fix) {
        const iss = [...f.querySelectorAll('#iss input:checked')].map(i => i.value);
        if (!iss.length && note.length < 5) return H.toast('Pick what’s wrong or add details', 'error');
        data = { deadline: iss.includes('deadline') ? g('deadline') : '', amount_text: iss.includes('amount') ? g('amount_text') : '', apply_url: iss.includes('link') ? g('apply_url') : '', source_url: g('source_url') };
        note = [iss.map(k => ISSUES.find(x => x[0] === k)[1]).join(', '), note].filter(Boolean).join('. ');
      } else {
        const md = (f.querySelector('[name=mode]:checked') || {}).value || 'grant';
        const cc = g('countries'), codes = cc.toUpperCase().split(/[\s,;]+/).filter(x => /^[A-Z]{2}$/.test(x));
        data = { mode: md, name: g('name'), org: g('org'), apply_url: g('apply_url'), amount_text: g('amount_text'), deadline: g('deadline'), countries: codes.length && !/africa/i.test(cc) ? codes : [], description: '' };
        if (cc && !codes.length) note = [note, 'Open to: ' + cc].filter(Boolean).join('\n');
      }
      const b = f.querySelector('[type=submit]'); b.disabled = true;
      try {
        await API.fundingSuggest(fix ? 'fix' : 'new', fix ? o.id : null, data, note);
        S.el.innerHTML = `<div style="text-align:center;padding:16px 8px"><span class="icon-badge" style="margin:0 auto 12px;background:#e3f9ee;color:#127a45">${icon('check')}</span><p class="t-h4">Thanks for sharing</p>
          <p class="t-body-sm c-2" style="margin:8px auto 18px;max-width:380px">${fix ? 'An admin will check it and update the listing.' : 'An admin will check the details on the funder’s site. You’ll get a notification when it’s live.'}</p><button class="btn btn--secondary" type="button" data-x>Done</button></div>`;
      } catch (er) { H.fail(er); b.disabled = false; }
    };
  }
  async function creditLine(o, el) {
    try { const c = await API.fundingCredit(o.id); if (c && c.username && el) el.innerHTML = `Shared by <a class="link" href="/makers/${esc(c.username)}">@${esc(c.username)}</a> · `; } catch (e) {}
  }
  window.FU = { slug, path, idFrom, CN, TEAM, KIND, TRACK, initials, logo, daysLeft, fmtDate, deadlineChip, deadlineText, howLabel, fit, dots, productLine, host, applyUrl, isOpen, pickPid, setPid, copy, sheet, linkBox, bindLink, investorSheet, editSheet, editBtn, why, TIER, readDeck, deckSheet, deckLine, money, suggestSheet, creditLine };
})();
