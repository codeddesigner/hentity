// Shared bits for Funding (/funding, /funding/:id) and the Data room (/data-room)
(function () {
  const { esc, icon, store } = H;
  const CN = { NG: 'Nigeria', KE: 'Kenya', GH: 'Ghana', ZA: 'South Africa', RW: 'Rwanda', EG: 'Egypt', MA: 'Morocco', SN: 'Senegal', ET: 'Ethiopia', UG: 'Uganda', TZ: 'Tanzania', CI: 'Côte d’Ivoire', CM: 'Cameroon', TN: 'Tunisia' };
  const TEAM = { women: 'Women-founded', mixed: 'Mixed founding team', men: 'Men-founded', unstated: 'Team not stated' };
  const KIND = { grant: 'Grant', prize: 'Prize', competition: 'Competition', vc: 'VC fund', angel: 'Angel network', accelerator: 'Accelerator', micro_vc: 'Micro-VC' };
  const STATUS = { draft: ['Draft', 'warning'], submitted: ['Submitted', 'info'], pitch_sent: ['Pitch sent', 'info'], intro_requested: ['Intro requested', 'warning'], shortlisted: ['Shortlisted', 'success'], accepted: ['Accepted', 'success'], declined: ['Declined', ''], withdrawn: ['Withdrawn', ''] };
  const initials = n => (n || '?').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const logo = (o, sz) => o.logo_url ? `<span class="fu-logo" style="width:${sz}px;height:${sz}px;background:#fff url('${esc(o.logo_url)}') center/cover"></span>`
    : `<span class="fu-logo" style="width:${sz}px;height:${sz}px;background:${esc(o.color || '#111')};font-size:${Math.round(sz * .36)}px">${esc(initials(o.org && o.mode === 'grant' ? o.name : o.name))}</span>`;
  const daysLeft = d => d ? Math.ceil((new Date(d + 'T23:59:59') - new Date()) / 864e5) : null;
  const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  const deadlineChip = o => {
    const d = daysLeft(o.deadline);
    if (d == null) return o.round_note ? `<span class="fu-chip">${icon('clock', 'ic-12')}${esc(o.round_note.split('·')[0].trim())}</span>` : `<span class="fu-chip">${icon('clock', 'ic-12')}Rolling</span>`;
    return `<span class="fu-chip ${d < 10 ? 'fu-chip--red' : 'fu-chip--amber'}">${icon('clock', 'ic-12')}${d <= 0 ? 'Closes today' : d + ' day' + (d === 1 ? '' : 's') + ' left'}</span>`;
  };
  const fit = o => { const r = o.total ? o.meets / o.total : 0; return r >= 1 ? ['Strong match', 'success'] : r >= .6 ? ['Good match', 'info'] : ['Partial match', '']; };
  const dots = o => `<span class="fu-dots" aria-hidden="true">${Array.from({ length: o.total }, (_, i) => `<i${i < o.meets ? ' class="on"' : ''}></i>`).join('')}</span>`;
  const productLine = p => [(p.categories || [])[0], p.stage, [p.city, CN[p.country] || p.country].filter(Boolean).join(', '), p.team ? TEAM[p.team] : 'Founding team not set'].filter(Boolean).join(' · ');

  // Data room readiness (9 things funders ask for)
  function readiness(fx) {
    const dr = fx.dataroom || {};
    const items = [
      ['product', 'Product page', true],
      ['team', 'Founding team', !!fx.team && fx.team !== 'unstated'],
      ['traction', 'Traction', !!(dr.traction && dr.traction.text)],
      ['deck', 'Pitch deck', !!(dr.deck && dr.deck.file)],
      ['beta', 'Beta results', (fx.testers || 0) > 0],
      ['incorporation', 'Incorporation certificate', !!(dr.incorporation && dr.incorporation.file)],
      ['reviews', 'Reviews', (fx.comments || 0) > 0],
      ['financials', 'Financials', !!(dr.financials && dr.financials.file)],
      ['cap_table', 'Cap table', !!(dr.cap_table && dr.cap_table.file)]];
    return { items, ready: items.filter(i => i[2]).length, missing: items.filter(i => !i[2]).map(i => i[1].toLowerCase()) };
  }
  // Remember which product a founder is matching for
  const pickPid = (list) => { const want = H.params().get('p') || store.get('fundingPid', ''); return (list.find(p => p.id === want) || list[0] || {}).id; };
  const setPid = id => store.set('fundingPid', id);
  // Pick a file
  const pickFile = accept => new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept || '.pdf,.pptx,.ppt,.xlsx,.xls,.csv,.png,.jpg,.jpeg'; i.onchange = () => res(i.files[0] || null); i.click(); });
  // A small bottom-sheet / modal
  function sheet(html, opts = {}) {
    const sc = document.createElement('div'); sc.className = 'scrim fu-scrim'; sc.style.zIndex = 95;
    sc.innerHTML = `<div class="modal fu-sheet" role="dialog" aria-modal="true" aria-label="${esc(opts.label || 'Dialog')}" style="max-width:${opts.w || 520}px"><span class="fu-grab" aria-hidden="true"></span>${html}</div>`;
    document.body.append(sc); document.body.style.overflow = 'hidden';
    const close = () => { sc.remove(); document.body.style.overflow = ''; };
    sc.addEventListener('click', e => { if (e.target === sc || e.target.closest('[data-x]')) close(); });
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
    return { el: sc.firstElementChild, close };
  }
  window.FU = { CN, TEAM, KIND, STATUS, initials, logo, daysLeft, fmtDate, deadlineChip, fit, dots, productLine, readiness, pickPid, setPid, pickFile, sheet };
})();
