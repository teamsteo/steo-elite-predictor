#!/usr/bin/env python3
"""
Auto-validation du moteur Tennis V3 (proxy):
pour chaque match récent du seed (2026-04-27 → 2026-09-21, résultats RÉELS),
le pick = joueur avec le meilleur rating Elo seed. Comparaison au vainqueur réel.
Caveat: rating statique au 24/09 (pas de cotes dans le seed → pas de ROI ici),
c'est un test de pouvoir prédictif du cœur du modèle, pas du pipeline complet.
"""
import gzip, json
from collections import defaultdict

d = json.load(gzip.open('/home/z/my-project/src/lib/tennis-v3/seed/tennis-seed.json.gz'))
ratings = d['ratings']
rm = d['recentMatches']

tot = defaultdict(lambda: [0, 0])  # cle -> [correct, total]

for m in rm:
    w, l = m.get('w'), m.get('l')
    rw, rl = ratings.get(w), ratings.get(l)
    if not rw or not rl:
        continue
    surface = (m.get('surface') or 'Hard').lower()
    series = m.get('series') or 'Other'
    bo5 = m.get('bo5', False)
    # écart Elo relatif (les Elo peuvent être sur des échelles différentes → prob logistique)
    diff = rw['elo'] - rl['elo'] if 'elo' in rw else (rw.get('overall', 0) - rl.get('overall', 0))
    pick_correct = diff > 0  # favori rating
    key_all = 'ALL'
    for key in (key_all, f'surface:{surface}', f'series:{series}', 'bo5' if bo5 else 'bo3'):
        tot[key][1] += 1
        if pick_correct:
            tot[key][0] += 1

print(f"Matchs évalués (joueurs connus du seed): {tot['ALL'][1]} / {len(rm)}")
print()
print(f"{'Segment':<28} {'Réussite favori-rating':>24}")
print('-' * 55)
for key in sorted(tot.keys(), key=lambda k: -tot[k][1]):
    c, t = tot[key]
    if t < 30 and key != 'ALL':
        continue
    print(f"{key:<28} {c}/{t} ({c/t*100:.1f}%)".replace('.', ','))

# Elo moyen des favoris vs outsiders — distribution de l'écart
import statistics
diffs = []
for m in rm:
    rw, rl = ratings.get(m.get('w')), ratings.get(m.get('l'))
    if rw and rl:
        a = rw['elo'] if 'elo' in rw else rw.get('overall', 0)
        b = rl['elo'] if 'elo' in rl else rl.get('overall', 0)
        diffs.append(abs(a - b))
print()
print(f"écart Elo médian: {statistics.median(diffs):.0f} | moyen: {statistics.mean(diffs):.0f}")
