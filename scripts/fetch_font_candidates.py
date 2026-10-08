#!/usr/bin/env python3
"""Re-télécharge les polices candidates en parsant les blocs @font-face (style/weight)."""
import urllib.request, re, os

OUT = '/home/z/my-project/scripts/betclic_analysis/fonts'
os.makedirs(OUT, exist_ok=True)
UA = {'User-Agent': 'Mozilla/5.0 (Linux; U; Android 4.0.3)'}

FAMILIES = {
    'roboto': 'Roboto',
    'inter': 'Inter',
    'figtree': 'Figtree',
    'dmsans': 'DM+Sans',
}
WANT = {('normal', '400'), ('normal', '500'), ('normal', '700'), ('italic', '700')}

def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=30).read()

for key, fam in FAMILIES.items():
    css = fetch(f'https://fonts.googleapis.com/css2?family={fam}:ital,wght@0,400;0,500;0,700;1,700&display=swap').decode()
    # blocs: /* comment */ @font-face { ... font-style: normal; font-weight: 400; ... url(...ttf) ... }
    blocks = re.findall(r'@font-face\s*\{([^}]+)\}', css)
    got = 0
    for b in blocks:
        style = re.search(r'font-style:\s*(\w+)', b)
        weight = re.search(r'font-weight:\s*(\d+)', b)
        url = re.search(r'url\((https://[^)]+\.ttf)\)', b)
        if not (style and weight and url):
            continue
        s, w = style.group(1), weight.group(1)
        if (s, w) in WANT:
            suffix = f'{"i" if s == "italic" else ""}{w}'
            data = fetch(url.group(1))
            open(os.path.join(OUT, f'{key}-{suffix}.ttf'), 'wb').write(data)
            print(f'✅ {key}-{suffix}.ttf ({len(data)//1024} Ko)')
            got += 1
    if got != 4:
        print(f'⚠️ {key}: {got}/4 variantes')
