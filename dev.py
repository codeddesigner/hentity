#!/usr/bin/env python3
"""Local preview of public/ with Vercel-style clean URLs and the rewrites from vercel.json."""
import http.server, json, pathlib, re, sys
ROOT = pathlib.Path(__file__).parent
PUB = ROOT / 'public'
RW = [(re.compile('^' + re.sub(r':\w+', '[^/]+', r['source'].replace(':path*', '.*')) + '$'), r['destination']) for r in json.loads((ROOT / 'vercel.json').read_text()).get('rewrites', [])]
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=str(PUB), **k)
    def translate_path(s, path):
        p = path.split('?')[0].split('#')[0]
        for rx, dst in RW:
            if rx.match(p):
                # SSR rewrites serve the static template locally (the function only adds meta tags)
                m = re.match(r'/api/ssr\?type=(\w+)', dst); p = {'home': '/home', 'news': '/news-index', 'beta': '/beta-apply'}.get(m.group(1), '/' + m.group(1)) if m else dst; break
        if p == '/': p = '/index'
        f = PUB / p.lstrip('/')
        if not f.exists() and (PUB / (p.lstrip('/') + '.html')).exists(): return str(PUB / (p.lstrip('/') + '.html'))
        return super().translate_path(p)
    def log_message(s, *a): pass
http.server.ThreadingHTTPServer(('', int(sys.argv[1]) if len(sys.argv) > 1 else 4173), H).serve_forever()
