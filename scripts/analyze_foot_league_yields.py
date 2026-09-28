#!/usr/bin/env python3
"""
Analyse des rendements par championnat de football
Source: /api/history (pronostics sauvegardés, 209 entrées, sport=football)
Méthode: 1 unité par pari sur le côté prédit (home→oddsHome, away→oddsAway)
ROI = (profit total / paris réglés) × 100
"""
import json
import subprocess
from collections import defaultdict

# Récupérer l'historique frais
subprocess.run(['curl', '-s', 'https://my-project-zeta-five-85.vercel.app/api/history',
                '-o', '/tmp/history.json'], check=True)
d = json.load(open('/tmp/history.json'))
ps = d['predictions']

foot = [p for p in ps if p.get('sport') == 'football']
print(f"Total pronostics football: {len(foot)}")

# Période couverte
dates = sorted(p['matchDate'] for p in foot if p.get('matchDate'))
print(f"Période: {dates[0][:10]} → {dates[-1][:10]}")

leagues = defaultdict(lambda: {'settled': 0, 'wins': 0, 'pending': 0, 'no_odds': 0,
                               'profit': 0.0, 'odds_sum': 0.0, 'bets_with_odds': 0,
                               'conf': defaultdict(lambda: [0, 0])})

for p in foot:
    lg = p.get('league') or 'Inconnue'
    L = leagues[lg]
    if p.get('status') != 'completed' or p.get('resultMatch') is None:
        L['pending'] += 1
        continue
    L['settled'] += 1
    won = p.get('resultMatch') is True
    if won:
        L['wins'] += 1
    conf = p.get('confidence') or 'medium'
    L['conf'][conf][0] += 1
    L['conf'][conf][1] += 1 if won else 0
    # Cote du côté prédit
    side = p.get('predictedResult')
    odds = None
    if side == 'home':
        odds = p.get('oddsHome')
    elif side == 'away':
        odds = p.get('oddsAway')
    if odds and odds > 1:
        L['bets_with_odds'] += 1
        L['odds_sum'] += odds
        L['profit'] += (odds - 1) if won else -1
    else:
        L['no_odds'] += 1

print(f"\n{'Ligue':<22} {'Par.':>5} {'Réglés':>7} {'V':>4} {'%réuss':>7} {'%ROI':>7} {'P/L (u)':>9} {'Cote moy':>9}")
print("-" * 85)

rows = []
for lg, L in leagues.items():
    if L['settled'] == 0:
        continue
    hr = L['wins'] / L['settled'] * 100
    roi = L['profit'] / L['settled'] * 100 if L['settled'] else 0
    avg_odds = L['odds_sum'] / L['bets_with_odds'] if L['bets_with_odds'] else 0
    rows.append((lg, L, hr, roi, avg_odds))

# Tri par ROI décroissant
rows.sort(key=lambda r: -r[3])
for lg, L, hr, roi, avg_odds in rows:
    flag = ' ⭐' if L['settled'] >= 5 and roi > 0 else ''
    print(f"{lg:<22} {L['settled']+L['pending']:>5} {L['settled']:>7} {L['wins']:>4} {hr:>6.1f}% {roi:>+6.1f}% {L['profit']:>+9.2f} {avg_odds:>9.2f}{flag}")

# Global
tot = sum(L['settled'] for _, L, _, _, _ in rows)
wins = sum(L['wins'] for _, L, _, _, _ in rows)
profit = sum(L['profit'] for _, L, _, _, _ in rows)
print("-" * 85)
print(f"{'GLOBAL':<22} {'':>5} {tot:>7} {wins:>4} {wins/tot*100:>6.1f}% {profit/tot*100:>+6.1f}% {profit:>+9.2f}")

# Significativité : ligues avec >= 5 réglés
print("\n─── Classement significatif (≥5 paris réglés, tri ROI) ───")
sig = [(lg, L, hr, roi, avg_odds) for lg, L, hr, roi, avg_odds in rows if L['settled'] >= 5]
sig.sort(key=lambda r: -r[3])
for i, (lg, L, hr, roi, avg_odds) in enumerate(sig, 1):
    print(f"{i:>2}. {lg:<22} {L['wins']}/{L['settled']} ({hr:.0f}%) | ROI {roi:+.1f}% | {L['profit']:+.2f}u | cote moy {avg_odds:.2f}")

# Sauvegarder le résultat pour livraison
out = []
for lg, L, hr, roi, avg_odds in rows:
    out.append({
        'league': lg, 'total': L['settled'] + L['pending'], 'settled': L['settled'],
        'wins': L['wins'], 'hit_rate': round(hr, 1), 'roi': round(roi, 1),
        'profit_units': round(L['profit'], 2),
        'avg_odds': round(avg_odds, 2) if avg_odds else None,
        'pending': L['pending'],
        'confidence_breakdown': {k: {'n': v[0], 'wins': v[1]} for k, v in L['conf'].items()},
    })
json.dump(out, open('/tmp/league_yields.json', 'w'), ensure_ascii=False, indent=1)
print("\n→ /tmp/league_yields.json sauvegardé")
