#!/usr/bin/env python3
"""
Rendements par championnat football — POLITIQUE VN (décision utilisateur)
═══════════════════════════════════════════════════════════════════════════
Deux pronostics par match : V (risqué) et VN (fiable, Victoire ou Nul).
Le bilan suit le VN : un NUL = GAGNÉ pour un prono home/away.
On ne perd que si l'équipe prédite S'INCLINE.

Évaluation recalculée depuis les données brutes (actualResult / scores),
indépendante du champ resultMatch stocké (ancienne politique 1X2 strict).

Méthode: 1 unité par pari sur le côté prédit (home→oddsHome, away→oddsAway)
Gain du nul à la cote 1X2 enregistrée (police utilisateur assumée).
ROI = (profit total / paris réglés) × 100
"""
import json
import subprocess
from collections import defaultdict

PROD = 'https://my-project-zeta-five-85.vercel.app/api/history'
OUT_JSON = '/home/z/my-project/download/rendements_par_championnat_VN.json'
OUT_CSV = '/home/z/my-project/download/rendements_par_championnat_VN.csv'

subprocess.run(['curl', '-s', PROD, '-o', '/tmp/history.json'], check=True)
d = json.load(open('/tmp/history.json'))
ps = d['predictions'] if isinstance(d, dict) else d

foot = [p for p in ps if p.get('sport') == 'football']
print(f"Total pronostics football: {len(foot)}")

dates = sorted(p['matchDate'] for p in foot if p.get('matchDate'))
print(f"Période: {dates[0][:10]} → {dates[-1][:10]}")


def actual_of(p):
    """Résultat réel: actualResult prioritaire, sinon dérivé des scores."""
    a = (p.get('actualResult') or '').lower()
    if a in ('home', 'away', 'draw'):
        return a
    hs, as_ = p.get('homeScore'), p.get('awayScore')
    if hs is not None and as_ is not None:
        try:
            hs, as_ = int(hs), int(as_)
            if hs > as_:
                return 'home'
            if hs < as_:
                return 'away'
            return 'draw'
        except (ValueError, TypeError):
            return None
    return None


def vn_won(predicted, actual):
    """Politique VN: nul = gagné pour home/away. Perdu seulement si l'équipe prédite s'incline."""
    if predicted == actual:
        return True
    return actual == 'draw' and predicted in ('home', 'away')


leagues = defaultdict(lambda: {'settled': 0, 'wins': 0, 'pending': 0, 'no_odds': 0,
                               'draws': 0, 'draws_won': 0, 'losses': 0,
                               'profit': 0.0, 'odds_sum': 0.0, 'bets_with_odds': 0,
                               'conf': defaultdict(lambda: [0, 0])})

n_draw_total = 0
for p in foot:
    lg = p.get('league') or 'Inconnue'
    L = leagues[lg]
    pred = (p.get('predictedResult') or '').lower()
    if p.get('status') != 'completed':
        L['pending'] += 1
        continue
    actual = actual_of(p)
    if pred not in ('home', 'away', 'draw') or actual is None:
        L['pending'] += 1
        continue
    L['settled'] += 1
    if actual == 'draw':
        n_draw_total += 1
        L['draws'] += 1
        if pred in ('home', 'away'):
            L['draws_won'] += 1
    won = vn_won(pred, actual)
    if won:
        L['wins'] += 1
    else:
        L['losses'] += 1
    conf = p.get('confidence') or 'medium'
    L['conf'][conf][0] += 1
    L['conf'][conf][1] += 1 if won else 0
    odds = p.get('oddsHome') if pred == 'home' else p.get('oddsAway') if pred == 'away' else None
    if odds and odds > 1:
        L['bets_with_odds'] += 1
        L['odds_sum'] += odds
        L['profit'] += (odds - 1) if won else -1
    else:
        L['no_odds'] += 1

print(f"\nNuls parmi les réglés: {n_draw_total} (tous comptés GAGNÉS pour prono home/away — politique VN)")

print(f"\n{'Ligue':<24} {'Par.':>5} {'Réglés':>7} {'V':>4} {'Nuls✓':>6} {'%réuss':>7} {'%ROI':>7} {'P/L (u)':>9} {'Cote moy':>9}")
print("-" * 95)

rows = []
for lg, L in leagues.items():
    if L['settled'] == 0:
        continue
    hr = L['wins'] / L['settled'] * 100
    roi = L['profit'] / L['settled'] * 100
    avg_odds = L['odds_sum'] / L['bets_with_odds'] if L['bets_with_odds'] else 0
    rows.append((lg, L, hr, roi, avg_odds))

rows.sort(key=lambda r: -r[3])
for lg, L, hr, roi, avg_odds in rows:
    flag = ' ⭐' if L['settled'] >= 5 and roi > 0 else ''
    print(f"{lg:<24} {L['settled']+L['pending']:>5} {L['settled']:>7} {L['wins']:>4} {L['draws_won']:>6} {hr:>6.1f}% {roi:>+6.1f}% {L['profit']:>+9.2f} {avg_odds:>9.2f}{flag}")

tot = sum(L['settled'] for _, L, _, _, _ in rows)
wins = sum(L['wins'] for _, L, _, _, _ in rows)
draws_won = sum(L['draws_won'] for _, L, _, _, _ in rows)
profit = sum(L['profit'] for _, L, _, _, _ in rows)
print("-" * 95)
print(f"{'GLOBAL (VN)':<24} {'':>5} {tot:>7} {wins:>4} {draws_won:>6} {wins/tot*100:>6.1f}% {profit/tot*100:>+6.1f}% {profit:>+9.2f}")

print("\n─── Classement significatif (≥5 paris réglés, tri ROI — politique VN) ───")
sig = [(lg, L, hr, roi, avg_odds) for lg, L, hr, roi, avg_odds in rows if L['settled'] >= 5]
sig.sort(key=lambda r: -r[3])
for i, (lg, L, hr, roi, avg_odds) in enumerate(sig, 1):
    print(f"{i:>2}. {lg:<24} {L['wins']}/{L['settled']} ({hr:.0f}%) | ROI {roi:+.1f}% | {L['profit']:+.2f}u | cote moy {avg_odds:.2f}")

# ── Comparaison ancienne politique (nul=perdu) vs VN ──
# VN: nul gagné → +(odds-1). Ancien: nul perdu → -1. Écart par nul gagné: odds.
print("\n─── Impact politique VN vs ancienne (nul=perdu) ───")
old_wins = wins - draws_won
odds_of_draws_won = 0.0
for p in foot:
    if p.get('status') != 'completed':
        continue
    pred = (p.get('predictedResult') or '').lower()
    if (p.get('actualResult') or '').lower() == 'draw' and pred in ('home', 'away'):
        odds = p.get('oddsHome') if pred == 'home' else p.get('oddsAway')
        if odds and odds > 1:
            odds_of_draws_won += odds
old_profit = profit - odds_of_draws_won
print(f"VN :   {wins}/{tot} ({wins/tot*100:.1f}%) | profit {profit:+.2f}u | ROI {profit/tot*100:+.1f}%")
if tot > 0:
    print(f"Ancien: {old_wins}/{tot} ({old_wins/tot*100:.1f}%) | profit {old_profit:+.2f}u | ROI {old_profit/tot*100:+.1f}%")
    print(f"(43 nuls reclassés perdus → gagnés: écart {odds_of_draws_won:.2f}u)")

# ── Livrables ──
out = []
for lg, L, hr, roi, avg_odds in rows:
    out.append({
        'league': lg, 'total': L['settled'] + L['pending'], 'settled': L['settled'],
        'wins': L['wins'], 'draws_won': L['draws_won'], 'losses': L['losses'],
        'hit_rate_vn': round(hr, 1), 'roi_vn': round(roi, 1),
        'profit_units': round(L['profit'], 2),
        'avg_odds': round(avg_odds, 2) if avg_odds else None,
        'pending': L['pending'], 'no_odds': L['no_odds'],
        'confidence_breakdown': {k: {'n': v[0], 'wins': v[1]} for k, v in L['conf'].items()},
    })
json.dump(out, open(OUT_JSON, 'w'), ensure_ascii=False, indent=1)

with open(OUT_CSV, 'w') as f:
    f.write('league,total,settled,wins,draws_won,losses,hit_rate_vn_pct,roi_vn_pct,profit_units,avg_odds,pending,no_odds\n')
    for o in out:
        f.write(f"{o['league']},{o['total']},{o['settled']},{o['wins']},{o['draws_won']},{o['losses']},"
                f"{o['hit_rate_vn']},{o['roi_vn']},{o['profit_units']},{o['avg_odds'] or ''},{o['pending']},{o['no_odds']}\n")

print(f"\n→ {OUT_JSON}")
print(f"→ {OUT_CSV}")
