#!/usr/bin/env python3
"""Tiny static build: copies src/ to public/, expanding <!--#head--> with src/partials/head.html."""
import pathlib, shutil, re
ROOT = pathlib.Path(__file__).parent
SRC, OUT = ROOT / 'src', ROOT / 'public'
head = (SRC / 'partials/head.html').read_text()
if OUT.exists(): shutil.rmtree(OUT)
for p in SRC.rglob('*'):
    rel = p.relative_to(SRC)
    if rel.parts[0] == 'partials' or p.is_dir(): continue
    dst = OUT / rel; dst.parent.mkdir(parents=True, exist_ok=True)
    if p.suffix == '.html':
        dst.write_text(p.read_text().replace('<!--#head-->', head.strip()))
    else:
        shutil.copy2(p, dst)
import json
print('built', sum(1 for _ in OUT.rglob('*.html')), 'pages')
