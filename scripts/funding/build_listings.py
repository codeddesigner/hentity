import re, glob, sys, json, hashlib, datetime
import os
D = os.path.dirname(os.path.abspath(__file__)) + '/'
TODAY = datetime.date(2026, 11, 7)
EXISTING = [l.strip() for l in open(D + 'existing.txt') if l.strip()]

CC = {'nigeria':'NG','kenya':'KE','ghana':'GH','south africa':'ZA','rwanda':'RW','egypt':'EG','morocco':'MA','senegal':'SN','ethiopia':'ET',
 'uganda':'UG','tanzania':'TZ',"côte d'ivoire":'CI','cote d\'ivoire':'CI','ivory coast':'CI','cameroon':'CM','tunisia':'TN','zambia':'ZM','zimbabwe':'ZW',
 'sierra leone':'SL','liberia':'LR','gambia':'GM','the gambia':'GM','benin':'BJ','togo':'TG','burkina faso':'BF','mali':'ML','niger':'NE','guinea':'GN',
 'malawi':'MW','mozambique':'MZ','botswana':'BW','namibia':'NA','lesotho':'LS','eswatini':'SZ','madagascar':'MG','mauritius':'MU','algeria':'DZ',
 'libya':'LY','sudan':'SD','south sudan':'SS','somalia':'SO','djibouti':'DJ','eritrea':'ER','burundi':'BI','drc':'CD','dr congo':'CD','congo':'CG',
 'gabon':'GA','chad':'TD','angola':'AO','cabo verde':'CV','cape verde':'CV','seychelles':'SC','comoros':'KM','mauritania':'MR','guinea-bissau':'GW',
 'equatorial guinea':'GQ','central african republic':'CF','são tomé and príncipe':'ST'}
NAME = {}
CATS = ['Fintech','SaaS','Apps','AI','Commerce','Productivity','Dev Tools','Health','Education','Agriculture','Logistics','Infrastructure','Energy & Climate']
KW = [(r'fintech|payment|financ|bank|insur|lending|credit|embedded|microfin|wealth|crypto|blockchain|bitcoin', 'Fintech'),
      (r'saas|software|b2b|enterprise|cloud', 'SaaS'), (r'\bai\b|artificial|machine learning|deep tech', 'AI'),
      (r'commerce|retail|marketplace|consumer|fashion|beauty', 'Commerce'), (r'health|medic|medtech|pharma|hospital|diagnos|life.?science|biotech', 'Health'),
      (r'edtech|educat|learning', 'Education'), (r'agri|agtech|food|farm|livestock|dairy|fisher', 'Agriculture'),
      (r'logistic|mobility|supply|transport|delivery|automotive', 'Logistics'),
      (r'energy|climate|solar|clean|renew|off-grid|green|circular|environment|ocean|blue econom|water|e-mobility', 'Energy & Climate'),
      (r'infra|isp|data center|telecom', 'Infrastructure'), (r'\bapps?\b|mobile|gaming|games|media|creative', 'Apps'), (r'dev tools|developer', 'Dev Tools')]
PAL = ['#111827','#1E3A8A','#0F766E','#065F46','#7C2D12','#6D28D9','#9D174D','#0E7490','#B45309','#374151','#155E75','#3F6212','#831843','#1D4ED8','#047857','#92400E']

for k, v in CC.items():
    NAME.setdefault(v, k.title().replace("D'I", "d'I"))
NAME.update({'CI': "Côte d'Ivoire", 'GM': 'The Gambia', 'CD': 'DR Congo'})
def norm(n):
    n = n.lower().replace('’', "'")
    n = re.sub(r'\(.*?\)', ' ', n)
    n = re.sub(r"[^a-z0-9 ]", ' ', n)
    stop = {'the','capital','ventures','venture','partners','partnership','management','managers','fund','vc','group','holdings','investments','investment',
            'program','programme','2025','2026','2027','cohort','limited','ltd','llc','co','africa','african','for','of','and','s','initiative','accelerator'}
    w = [x for x in n.split() if x not in stop]
    return ' '.join(w) or n.strip()

def stages(s):
    s = s.lower(); out = []
    def add(x):
        if x not in out: out.append(x)
    if 'idea' in s: add('Idea')
    if re.search(r'pre.?seed|angel', s): add('Pre-seed')
    if re.search(r'(?<!pre-)(?<!pre )\bseed|late-seed', s.replace('pre-seed', '').replace('pre seed', '')): add('Seed')
    if 'series a' in s: add('Series A')
    if re.search(r'series [b-e]|growth|late|private equity|scale|pe\b|buy-and-build|series b and beyond', s): add('Growth')
    if re.search(r'seed to series [b-c]', s): add('Series A')
    order = ['Idea','Pre-seed','Seed','Series A','Growth']
    return [x for x in order if x in out]

def cats(s):
    if not s or s == '-': return []
    if re.fullmatch(r'\s*(sector[- ]agnostic|generalist|tech|technology|it|scale-ups|multi-sector|impact|social impact|tech-enabled)[^|]*', s.lower()) and not re.search('fintech|health|agri|energy|climate', s.lower()):
        return []
    out = []
    for rx, c in KW:
        if re.search(rx, s.lower()) and c not in out: out.append(c)
    return [c for c in CATS if c in out]

def money_max(s):
    s = s.replace(',', '')
    vals = []
    for m in re.finditer(r'[\$€£]\s?([\d.]+)\s?([kKmMbB]?)', s):
        v = float(m.group(1)); u = m.group(2).lower()
        v *= {'k':1e3,'m':1e6,'b':1e9}.get(u, 1)
        vals.append(v)
    return int(max(vals)) if vals else None

def q(v):
    if v is None: return 'null'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, int): return str(v)
    return "'" + str(v).replace("'", "''") + "'"
def arr(a):
    if not a: return "'{}'"
    return "'{" + ','.join('"%s"' % x if (' ' in x or '&' in x or ',' in x) else x for x in a) + "}'"
def color(n): return PAL[int(hashlib.md5(n.encode()).hexdigest(), 16) % len(PAL)]
def url(d):
    d = d.strip()
    if d.startswith('http'): return d
    return 'https://' + d + ('' if '/' in d else '/')

TYPE = {'vc': ('equity','vc','VC fund'), 'angel': ('equity','angel','Angel network'), 'accelerator': ('equity','accelerator','Accelerator'),
        'dfi': ('equity','vc','Development finance institution'), 'cvc': ('equity','vc','Corporate investor'), 'grant': ('grant','grant','Grant funder')}
rows, skipped = [], []
for f in sorted(glob.glob(D + 'inv*.txt')):
    for line in open(f):
        line = line.strip()
        if not line or line.startswith('#'): continue
        p = line.split('|')
        if len(p) != 8: skipped.append(('badcols', f, line)); continue
        name, hq, typ, st, sec, rounds, dom, src = [x.strip() for x in p]
        if dom.startswith('?') or dom in ('-', ''): skipped.append(('nodomain', name)); continue
        mode, kind, label = TYPE[typ]
        stg = stages(st)
        mx = money_max(rounds) if rounds != '-' else None
        if kind == 'vc' and mx and mx <= 1_000_000 and typ == 'vc' and '–' in rounds: kind = 'micro_vc'
        note = '' if typ == 'accelerator' else {'dfi': 'Development finance · debt and equity', 'cvc': 'Corporate investor', 'grant': 'Grants and catalytic funding'}.get(typ, 'Typical cheque' if rounds != '-' else 'Cheque size not disclosed')
        secs = sec.strip(' .')
        def nat(l): return l[0] if len(l) == 1 else ', '.join(l[:-1]) + ' and ' + l[-1]
        foc = (' Focus: ' + secs + '.') if secs and secs != '-' else ''
        lead = {'accelerator': 'Accelerator', 'grant': 'Grant funder', 'angel': 'Angel network', 'dfi': 'Development finance institution', 'cvc': 'Corporate investor'}.get(typ, 'VC fund')
        desc = (f"Pan-African {lead if lead.startswith('VC') else lead[0].lower() + lead[1:]}." if hq.lower() in ('africa', 'pan-african') else f"{lead} based in {hq}.") + (f" Backs {nat(stg)} startups." if stg else '') + foc
        rows.append(dict(mode=mode, kind=kind, name=name, org=name, color=color(name), website=url(dom), apply_url=url(dom),
            amount_text=rounds if rounds != '-' else 'Not disclosed', amount_note=note, amount_usd=mx, categories=cats(secs), stages=stg,
            countries=[], region_label='', women_only=bool(re.search(r'women|female', name.lower() + secs.lower())) and 'women' in name.lower(),
            needs_incorporation=False, needs_live=bool(stg) and not ({'Idea','Pre-seed'} & set(stg)), deadline=None, deadline_note='', round_note='',
            description=desc, source_url=src, file=f.split('/')[-1]))

GK = {'grant':'grant','prize':'prize','competition':'competition','accelerator':'accelerator','equity':'accelerator'}
for f in sorted(glob.glob(D + 'g*.txt')):
    for line in open(f):
        line = line.rstrip('\n')
        if not line.strip() or line.startswith('#'): continue
        p = line.split('|')
        if len(p) != 12: skipped.append(('badcols', f, line[:80])); continue
        name, org, kind, amount, usd, desc, dl, ctry, cat, women, u, src = [x.strip() for x in p]
        mode = 'equity' if kind == 'equity' else 'grant'
        kind = GK[kind]
        codes = []
        for c in [x.strip() for x in ctry.split(',') if x.strip()]:
            k = c if re.fullmatch(r'[A-Z]{2}', c) else CC.get(c.lower())
            if k: codes.append(k)
            else: skipped.append(('country?', name, c))
        deadline, rn, dn = None, '', ''
        if re.fullmatch(r'\d{4}-\d{2}-\d{2}', dl):
            d = datetime.date.fromisoformat(dl)
            if d >= TODAY: deadline = dl
            else: rn = f"Last round closed {d.day} {d.strftime('%b')} {d.year} · check their site for the next one"
        elif dl == 'rolling': rn = ''
        else: rn = 'Check their site for dates'
        cl = [c.strip() for c in cat.split(',') if c.strip()]
        for c in cl:
            if c not in CATS: skipped.append(('cat?', name, c))
        cl = [c for c in CATS if c in cl]
        u = u if u.startswith('http') else ''
        if not u: skipped.append(('nourl', name)); continue
        rows.append(dict(mode=mode, kind=kind, name=name, org=org or name, color=color(name), website=u, apply_url=u,
            amount_text=amount, amount_note='', amount_usd=int(usd) if usd.isdigit() and int(usd) > 0 else None, categories=cl,
            stages=['Idea','Pre-seed','Seed'] if mode == 'grant' and kind in ('competition','prize') else [], countries=codes,
            region_label=(', '.join(NAME.get(c, c) for c in codes) if codes and len(codes) <= 3 else ('Selected African countries' if codes else '')),
            women_only=women == '1', needs_incorporation=False, needs_live=False, deadline=deadline, deadline_note=dn, round_note=rn,
            description=desc, source_url=src, file=f.split('/')[-1]))

# ---- dedupe
ex = {norm(n): n for n in EXISTING}
seen, out, dups = {}, [], []
ALLOW = set(x.strip() for x in open(D + 'keep_pairs.txt')) if __import__('os').path.exists(D + 'keep_pairs.txt') else set()
DROP = set(x.strip() for x in open(D + 'drop.txt')) if __import__('os').path.exists(D + 'drop.txt') else set()
for r in rows:
    if r['name'] in DROP: dups.append(('dropped', r['name'])); continue
    k = norm(r['name'])
    hit = ex.get(k) or seen.get(k)
    if not hit:
        for kk, nn in list(ex.items()) + list(seen.items()):
            if len(k) >= 6 and len(kk) >= 6 and (k.startswith(kk + ' ') or kk.startswith(k + ' ')) and (r['name'] + '||' + nn) not in ALLOW:
                dups.append(('fuzzy?', r['name'], nn)); break
    if hit: dups.append(('dup', r['name'], hit)); continue
    seen[k] = r['name']; out.append(r)

if '--report' in sys.argv:
    for s in skipped: print('SKIP', s)
    for d in dups: print('DUP', d)
    from collections import Counter
    print(len(out), Counter((r['mode'], r['kind']) for r in out))
    print('open grants', sum(1 for r in out if r['deadline']))
    sys.exit()

cols = ['mode','kind','name','org','color','website','apply_url','amount_text','amount_note','amount_usd','categories','stages','countries','region_label',
        'women_only','needs_incorporation','needs_live','deadline','deadline_note','round_note','description','source_url']
def val(r):
    return '(' + ','.join(arr(r[c]) if c in ('categories','stages','countries') else q(r[c]) for c in cols) + ",'2026-11-07')"
head = 'insert into public.funding_opps (' + ', '.join(cols) + ', checked_at) values\n'
tail = '\non conflict (name) do nothing;\n'
out.sort(key=lambda r: (r['mode'] != 'grant', r['deadline'] is None, r['deadline'] or '', r['name'].lower()))
open(D + 'all.sql', 'w').write('-- %d funding listings gathered from public sources on 7 Nov 2026 (investor databases, opportunity roundups, funder pages).\n-- Every row keeps the page it was taken from in source_url.\n' % len(out) + head + ',\n'.join(val(r) for r in out) + tail)
B = 80
for i in range(0, len(out), B):
    open(D + 'batch_%02d.sql' % (i // B), 'w').write(head + ',\n'.join(val(r) for r in out[i:i+B]) + tail)
print('wrote', len(out))
