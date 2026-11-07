#!/usr/bin/env python3
"""Tiny static build: copies src/ to public/, expanding <!--#head--> with src/partials/head.html
and adding SEO tags (canonical, Open Graph, Twitter, robots) to every page from its <title> and description."""
import pathlib, shutil, re, html, datetime, os
ROOT = pathlib.Path(__file__).parent
SRC, OUT = ROOT / 'src', ROOT / 'public'
SITE = 'https://hentity.com'
head = (SRC / 'partials/head.html').read_text()

# Signed-in or transactional pages that should never appear in search results
NOINDEX = {'me', 'my-products', 'notifications', 'saved', 'submit', 'under-review', 'changes-requested', 'scheduled',
           'launch-week', 'launch-recap', 'welcome',
           'admin', '404', 'maker', 'product', 'article', 'beta', 'beta-new', 'beta-manage', 'beta-apply', 'studio', 'betas', 'directory-index'}  # templates: real URLs are server-rendered by api/ssr.js

def seo(page: str, rel: pathlib.Path) -> str:
    name = rel.with_suffix('').as_posix()
    path = '/' if name == 'index' else '/' + name
    t = re.search(r'<title>(.*?)</title>', page, re.S)
    d = re.search(r'<meta name="description" content="(.*?)">', page, re.S)
    title = html.unescape(t.group(1).strip()) if t else 'Hentity'
    desc = html.unescape(d.group(1)) if d else 'Discover the best new products built by African makers. A fresh launch board every Monday.'
    tags = []
    if not d:
        tags.append(f'<meta name="description" content="{html.escape(desc)}">')
    private = name in NOINDEX or name.startswith('settings/')
    if private or 'name="robots"' in page:
        if 'name="robots"' not in page:
            tags.append('<meta name="robots" content="noindex, follow">')
    elif 'rel="canonical"' not in page:
        tags.append(f'<link rel="canonical" href="{SITE}{path}">')
    if 'property="og:title"' not in page:
        tags += [
            f'<meta property="og:title" content="{html.escape(title)}">',
            f'<meta property="og:description" content="{html.escape(desc)}">',
            f'<meta property="og:url" content="{SITE}{path}">',
            '<meta property="og:type" content="website">',
            f'<meta property="og:image" content="{SITE}/og.png?v={OG_V}">',
            '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">',
            '<meta name="twitter:card" content="summary_large_image">',
            f'<meta name="twitter:title" content="{html.escape(title)}">',
            f'<meta name="twitter:description" content="{html.escape(desc)}">',
            f'<meta name="twitter:image" content="{SITE}/og.png?v={OG_V}">',
        ]
    return page.replace('</head>', '\n'.join(tags) + '\n</head>', 1), (None if private else path)

# Cache busting: every /assets/* reference gets ?v=<content hash>, so a changed file has a new URL and
# browsers can't keep running a stale copy (Cloudflare tells browsers to keep scripts for hours).
import hashlib, json
# Serve the Supabase library from our own domain when it's installed (Vercel runs `npm install` from
# package.json before this script). Saves a separate connection to jsDelivr on every first visit.
SB_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js'
SB_LOCAL = ROOT / 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'
if SB_LOCAL.exists():
    (SRC / 'assets' / 'supabase.js').write_bytes(SB_LOCAL.read_bytes())
    head = head.replace(f'<script src="{SB_CDN}"></script>', '<script src="/assets/supabase.js"></script>').replace('<link rel="preconnect" href="https://cdn.jsdelivr.net">\n', '')
    print('supabase-js served from /assets/supabase.js')
OG_V = hashlib.sha256((SRC / 'og.png').read_bytes()).hexdigest()[:10]
ASSET_V = {f.name: hashlib.sha256(f.read_bytes()).hexdigest()[:10] for f in (SRC / 'assets').iterdir() if f.is_file()}
def bust(page: str) -> str:
    return re.sub(r'((?:src|href)=")/assets/([\w.-]+)"', lambda m: f'{m.group(1)}/assets/{m.group(2)}?v={ASSET_V[m.group(2)]}"' if m.group(2) in ASSET_V else m.group(0), page)

# The home and news pages are served by api/ssr.js (which embeds their data), so their templates are written
# under other names; a static /index.html or /news.html would otherwise take priority over the rewrite.
SERVED_BY_SSR = {'index.html': 'home.html', 'news.html': 'news-index.html', 'directory.html': 'directory-index.html'}

if OUT.exists(): shutil.rmtree(OUT)
public_paths = []
for p in sorted(SRC.rglob('*')):
    rel = p.relative_to(SRC)
    if rel.parts[0] == 'partials' or p.is_dir(): continue
    dst = OUT / rel; dst.parent.mkdir(parents=True, exist_ok=True)
    if p.suffix == '.html':
        page, path = seo(bust(p.read_text().replace('<!--#head-->', head.strip())), rel)
        if rel.as_posix() in SERVED_BY_SSR: dst = OUT / SERVED_BY_SSR[rel.as_posix()]
        dst.write_text(page)
        if path and path not in ('/signin', '/signup'): public_paths.append(path)
    else:
        shutil.copy2(p, dst)
# Service worker: stamp a build version so each deploy installs a fresh worker and clears old caches
_sw = OUT / 'sw.js'
if _sw.exists():
    _v = hashlib.sha256(json.dumps(ASSET_V, sort_keys=True).encode() + b''.join(f.read_bytes() for f in sorted(OUT.rglob('*.html')))).hexdigest()[:12]
    _sw.write_text(_sw.read_text().replace('__VERSION__', _v))
# Static page list for the sitemap function (dynamic URLs are added at request time)
(ROOT / 'api').mkdir(exist_ok=True)
(ROOT / 'api' / '_static-paths.json').write_text(json.dumps(sorted(public_paths)))
# Column list shared with the server-side preloader, so both sides always ask for the same fields
cols = re.search(r"const PRODUCT_COLS = '([^']+)'", (SRC / 'assets' / 'api.js').read_text()).group(1)
(ROOT / 'api' / '_cols.json').write_text(json.dumps({'PRODUCT_COLS': cols, 'OG_V': OG_V}))
if (SRC / 'assets' / 'supabase.js').exists() and not SB_LOCAL.exists(): (SRC / 'assets' / 'supabase.js').unlink()

# Minify our JS and CSS in public/ with esbuild when it's installed (Vercel installs it from package.json).
# Plain scripts keep their top-level names, so the globals pages share (H, API, F, L, M...) are untouched.
import subprocess
ESB = next((str(p) for p in [ROOT / 'node_modules/.bin/esbuild', pathlib.Path('/opt/npm-tools/node_modules/.bin/esbuild')] if p.exists()), shutil.which('esbuild'))
if ESB and os.environ.get('NO_MINIFY') != '1':
    files = [f for f in (OUT / 'assets').iterdir() if f.suffix in ('.js', '.css') and f.name != 'supabase.js']
    before = sum(f.stat().st_size for f in files)
    for f in files:
        subprocess.run([ESB, str(f), '--minify', '--log-level=error', '--allow-overwrite', '--outfile=' + str(f)], check=True)
    print(f'minified {len(files)} assets: {before // 1024} KB -> {sum(f.stat().st_size for f in files) // 1024} KB')
else:
    print('esbuild not found: assets left unminified')
print('built', sum(1 for _ in OUT.rglob('*.html')), 'pages ·', len(public_paths), 'indexable')

# Guard: a redirect whose source pattern also matches its own destination loops forever (this once broke /admin)
def _pattern(src): return re.compile('^' + re.sub(r'/:\w+\*', r'(?:/.*)?', re.sub(r':\w+(?!\*)', '[^/]+', src)) + '$')
for r in json.loads((ROOT / 'vercel.json').read_text()).get('redirects', []):
    if 'has' not in r and _pattern(r['source']).match(r['destination'].split('?')[0]):
        raise SystemExit(f"vercel.json: redirect {r['source']} -> {r['destination']} loops onto itself")
