// Usage: node tests/shot.js '[["/path","out.png",w,h,full,signedIn]]'
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const mock = fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8');
const fixture = fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8');
(async () => {
  const b = await chromium.launch();
  const jobs = JSON.parse(process.argv[2]);
  const outDir = process.env.OUT || '.';
  for (const [p, out, w, h, full, signed, actions] of jobs) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType: 'application/javascript', body: `window.__FIXTURE__=${fixture};\n${mock}` }));
    await ctx.addInitScript(s => { if (s) localStorage.setItem('mock.signedIn', '1'); }, !!signed);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) errs.push(m.text()); });
    page.on('dialog', d => d.accept());
    await page.goto('http://localhost:4173' + p, { waitUntil: 'load' }); await page.waitForTimeout(2000);
    if (actions) for (const a of actions) { if (a[0] === 'click') await page.click(a[1]); if (a[0] === 'fill') await page.fill(a[1], a[2]); if (a[0] === 'wait') await page.waitForTimeout(a[1]); }
    if (full) { await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } scrollTo(0, 0); }); await page.waitForTimeout(700); }
    await page.screenshot({ path: path.join(outDir, out), fullPage: !!full });
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    console.log(out, errs.length ? 'ERR ' + errs.join(' | ') : 'ok', sw > w ? 'OVERFLOW ' + sw : '');
    await ctx.close();
  }
  await b.close();
})();
