#!/usr/bin/env python3
"""Tiny static build: copies src/ to public/, expanding <!--#head--> with src/partials/head.html
and adding SEO tags (canonical, Open Graph, Twitter, robots) to every page from its <title> and description."""
import pathlib, shutil, re, html, datetime
ROOT = pathlib.Path(__file__).parent
SRC, OUT = ROOT / 'src', ROOT / 'public'
SITE = 'https://hentity.com'
head = (SRC / 'partials/head.html').read_text()

# Signed-in or transactional pages that should never appear in search results
NOINDEX = {'me', 'my-products', 'notifications', 'saved', 'submit', 'under-review', 'changes-requested', 'scheduled',
           'launch-week', 'launch-recap', 'welcome',
           'admin', '404', 'maker', 'product', 'article'}  # templates: real URLs are server-rendered by api/ssr.js

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
            f'<meta property="og:image" content="{SITE}/og.png">',
            '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">',
            '<meta name="twitter:card" content="summary_large_image">',
            f'<meta name="twitter:title" content="{html.escape(title)}">',
            f'<meta name="twitter:description" content="{html.escape(desc)}">',
            f'<meta name="twitter:image" content="{SITE}/og.png">',
        ]
    return page.replace('</head>', '\n'.join(tags) + '\n</head>', 1), (None if private else path)

# Cache busting: every /assets/* reference gets ?v=<content hash>, so a changed file has a new URL and
# browsers can't keep running a stale copy (Cloudflare tells browsers to keep scripts for hours).
import hashlib
ASSET_V = {f.name: hashlib.sha256(f.read_bytes()).hexdigest()[:10] for f in (SRC / 'assets').iterdir() if f.is_file()}
def bust(page: str) -> str:
    return re.sub(r'((?:src|href)=")/assets/([\w.-]+)"', lambda m: f'{m.group(1)}/assets/{m.group(2)}?v={ASSET_V[m.group(2)]}"' if m.group(2) in ASSET_V else m.group(0), page)

if OUT.exists(): shutil.rmtree(OUT)
public_paths = []
for p in sorted(SRC.rglob('*')):
    rel = p.relative_to(SRC)
    if rel.parts[0] == 'partials' or p.is_dir(): continue
    dst = OUT / rel; dst.parent.mkdir(parents=True, exist_ok=True)
    if p.suffix == '.html':
        page, path = seo(bust(p.read_text().replace('<!--#head-->', head.strip())), rel)
        dst.write_text(page)
        if path and path not in ('/signin', '/signup'): public_paths.append(path)
    else:
        shutil.copy2(p, dst)
# Static page list for the sitemap function (dynamic URLs are added at request time)
(ROOT / 'api').mkdir(exist_ok=True)
(ROOT / 'api' / '_static-paths.json').write_text(__import__('json').dumps(sorted(public_paths)))
print('built', sum(1 for _ in OUT.rglob('*.html')), 'pages ·', len(public_paths), 'indexable')
