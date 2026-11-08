/* Data room — shared bits for /data-room (owner) and /r/:token (viewer).
   Figma: 302:3757 Choose stage · 304:3901 Seed room · 105:1630 Room · 228:3074 Lock & share · 229:3260 Analytics · 228:3543 Viewer */
(function () {
  const STAGES = {
    ff: { key: 'ff', name: 'Friends & family', short: 'Friends & family', tag: 'Idea or first version', tagCls: 'dr-tag--y', who: 'Raising from people who know you', round: '$5k–$50k',
      bullets: ['One-pager and short deck', 'Why you, and proof of the problem', 'How you’ll spend the money', 'A simple agreement for the money'], title: 'Friends & family room', lead: 'What friends, family and first angels want to see.' },
    seed: { key: 'seed', name: 'Pre-seed & seed', short: 'Pre-seed & seed', tag: 'Product live, early users', tagCls: 'dr-tag--b', who: 'Raising from angels, accelerators and seed funds', round: '$100k–$2M',
      bullets: ['Deck, demo and traction numbers', 'Financial model, burn and runway', 'Cap table and earlier SAFEs', 'CAC documents, IP and founder agreements'], title: 'Seed data room', lead: 'What angels, accelerators and seed funds expect to see.' },
    growth: { key: 'growth', name: 'Growth', short: 'Growth', tag: 'Series A and beyond', tagCls: 'dr-tag--g', who: 'Raising from VCs who run full due diligence', round: '$2M+',
      bullets: ['Everything in seed, plus:', 'Management accounts and monthly KPIs', 'Board minutes and material contracts', 'Licences, tax filings and data protection'], title: 'Growth data room', lead: 'What VCs ask for in full due diligence.' }
  };
  const FOLDERS = [['pitch', 'Pitch'], ['traction', 'Traction'], ['financials', 'Financials'], ['team', 'Team & company'], ['legal', 'Legal'], ['other', 'Other files']];
  // [key, name, hint, folder, ff, seed, growth]  R = required, O = optional, '' = not in that room
  const ITEMS = [
    ['deck', 'Pitch deck', 'Locked, with slide-by-slide analytics', 'pitch', 'R', 'R', 'R'],
    ['onepager', 'One-pager', 'Investors forward this to partners', 'pitch', 'R', 'R', 'O'],
    ['demo', 'Demo video', 'Shows the product works', 'pitch', '', 'R', 'R'],
    ['problem', 'Proof of the problem', 'Customer interviews, or your Validate report', 'traction', 'R', '', ''],
    ['traction', 'Traction: users, revenue, growth', 'Your numbers, month by month', 'traction', 'O', 'R', 'R'],
    ['beta', 'Beta or pilot results', 'What testers did and said', 'traction', '', 'R', 'R'],
    ['refs', 'Customer references', 'Two or three customers investors can call', 'traction', '', 'O', 'R'],
    ['kpis', 'Monthly KPI pack', 'Retention, CAC, LTV', 'traction', '', '', 'R'],
    ['model', 'Financial model (18–24 months)', 'Investors check your assumptions', 'financials', '', 'R', 'R'],
    ['burn', 'Burn and runway', 'How long the money lasts', 'financials', '', 'R', 'R'],
    ['usefunds', 'How you’ll use the money', 'Where each naira or dollar goes', 'financials', 'R', 'R', 'R'],
    ['mgmt', 'Management accounts (24 months)', 'Monthly P&L, balance sheet and cash flow', 'financials', '', '', 'R'],
    ['audited', 'Audited accounts', 'Last full financial year', 'financials', '', '', 'R'],
    ['bank', 'Bank statements (12 months)', 'Matches the management accounts', 'financials', '', '', 'R'],
    ['cap', 'Cap table', 'Who owns what, including the option pool', 'team', 'O', 'R', 'R'],
    ['cac', 'Company registration and status report', 'Proof the company exists and is in good standing', 'team', 'O', 'R', 'R'],
    ['founders', 'Founder agreement and IP assignment', 'The company, not a founder, owns the code', 'team', '', 'R', 'R'],
    ['esop', 'Employee option plan', 'Pool size and vesting', 'team', '', '', 'R'],
    ['staff', 'Employment contracts', 'Key hires and their terms', 'team', '', '', 'R'],
    ['board', 'Board minutes and resolutions', 'Decisions since the last round', 'team', '', '', 'R'],
    ['agreement', 'Agreement for the money', 'A SAFE, note or simple letter for the round', 'legal', 'R', '', ''],
    ['safes', 'Earlier SAFEs and notes', 'Everything already signed', 'legal', '', 'R', 'R'],
    ['shareholders', 'Shareholders’ agreement', 'Rights of each investor', 'legal', '', '', 'R'],
    ['articles', 'Articles of association', 'The company’s rulebook', 'legal', '', '', 'R'],
    ['contracts', 'Material contracts', 'Big customers, suppliers and partners', 'legal', '', '', 'R'],
    ['licences', 'Licences (e.g. CBN) and permits', 'What you need to operate', 'legal', '', 'O', 'R'],
    ['tax', 'Tax filings', 'Company tax and VAT returns', 'legal', '', '', 'R'],
    ['ip', 'Trademarks and IP', 'Registrations and assignments', 'legal', '', '', 'R'],
    ['privacy', 'Data protection', 'Privacy policy and NDPA / POPIA compliance', 'legal', '', '', 'R']
  ];
  const col = { ff: 4, seed: 5, growth: 6 };
  const itemsFor = stage => ITEMS.filter(i => i[col[stage]]).map(i => ({ key: i[0], name: i[1], hint: i[2], folder: i[3], need: i[col[stage]] }));
  const stageCount = stage => itemsFor(stage).length;
  const folderName = k => (FOLDERS.find(f => f[0] === k) || [k, 'Other files'])[1];
  const itemName = k => (ITEMS.find(i => i[0] === k) || [k, ''])[1];

  // ---- pdf.js, loaded only when a PDF is shown
  let pdfjs;
  function loadPdf() {
    if (pdfjs) return pdfjs;
    pdfjs = new Promise((ok, no) => {
      const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; ok(window.pdfjsLib); };
      s.onerror = () => { pdfjs = null; no(new Error('Couldn’t load the PDF viewer. Check your connection and try again.')); };
      document.head.append(s);
    });
    return pdfjs;
  }
  async function pdfDoc(src) { const lib = await loadPdf(); const data = src instanceof Blob ? new Uint8Array(await src.arrayBuffer()) : src; return lib.getDocument(typeof data === 'string' ? { url: data } : { data }).promise; }
  async function pdfPages(file) { try { const d = await pdfDoc(file); const n = d.numPages; d.destroy(); return n; } catch (e) { return null; } }
  // Draw one page into a canvas, optionally stamped with a watermark (the viewer's email and the date)
  async function renderPage(doc, n, canvas, width, mark) {
    const page = await doc.getPage(n); const v0 = page.getViewport({ scale: 1 });
    const dpr = Math.min(2, window.devicePixelRatio || 1), scale = width / v0.width, vp = page.getViewport({ scale: scale * dpr });
    canvas.width = vp.width; canvas.height = vp.height; canvas.style.width = width + 'px'; canvas.style.height = (vp.height / dpr) + 'px';
    const ctx = canvas.getContext('2d'); await page.render({ canvasContext: ctx, viewport: vp }).promise;
    if (mark) {
      ctx.save(); ctx.globalAlpha = .13; ctx.fillStyle = '#000'; ctx.font = `${Math.round(16 * dpr)}px Inter, Arial, sans-serif`; ctx.translate(vp.width / 2, vp.height / 2); ctx.rotate(-Math.PI / 7);
      const step = 220 * dpr; for (let y = -vp.height; y < vp.height; y += 90 * dpr) for (let x = -vp.width; x < vp.width; x += step) ctx.fillText(mark, x + ((y / (90 * dpr)) % 2 ? step / 2 : 0), y);
      ctx.restore();
    }
    return canvas;
  }

  const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round((n || 0) / 1024)) + ' KB';
  const kind = f => /pdf/i.test(f.mime) || /\.pdf$/i.test(f.name) ? 'pdf' : /^image\//.test(f.mime) ? 'image' : /^video\//.test(f.mime) ? 'video' : 'file';
  const kindLabel = f => ({ pdf: 'PDF', image: 'Image', video: 'Video' }[kind(f)] || (f.name.split('.').pop() || 'File').toUpperCase());
  const secs = s => { s = Math.round(s || 0); return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`; };
  const day = t => t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  const linkUrl = l => `${location.origin}/r/${l.token}`;
  const device = () => (/Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop');

  window.DR = { STAGES, FOLDERS, ITEMS, itemsFor, stageCount, folderName, itemName, loadPdf, pdfDoc, pdfPages, renderPage, kb, kind, kindLabel, secs, day, linkUrl, device };
})();
