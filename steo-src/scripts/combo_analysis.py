import json

with open('/tmp/mlb_today.json', 'r') as f:
    data = json.load(f)

events = data.get('leagues', [{}])[0].get('events', [])

results = []
for e in events:
    comp = e.get('competitions', [{}])[0]
    home_c = next((c for c in comp.get('competitors', []) if c.get('homeAway') == 'home'), {})
    away_c = next((c for c in comp.get('competitors', []) if c.get('homeAway') == 'away'), {})
    odds = comp.get('odds', [{}])[0] if comp.get('odds') else {}
    
    away = away_c.get('team', {}).get('displayName', '')
    home = home_c.get('team', {}).get('displayName', '')
    
    # Records
    away_rec = away_c.get('records', [{}])[0].get('summary', 'N/A')
    home_rec = home_c.get('records', [{}])[0].get('summary', 'N/A')
    
    def parse_rec(r):
        try:
            parts = r.split('-')
            return int(parts[0]), int(parts[1])
        except:
            return 0, 0
    
    aw, al = parse_rec(away_rec)
    hw, hl = parse_rec(home_rec)
    away_wp = aw / (aw + al) if (aw + al) > 0 else 0.5
    home_wp = hw / (hw + hl) if (hw + hl) > 0 else 0.5
    
    # Pythagorean expectation (using run differential proxy)
    # MLB average: ~0.54 home win rate
    # Adjust with HFA
    hfa = 0.038  # ~3.8% home field advantage in MLB
    model_home = home_wp + hfa
    model_away = away_wp - hfa
    total = model_home + model_away
    model_home_pct = model_home / total
    model_away_pct = model_away / total
    
    # Pitchers
    prob_pitchers = comp.get('probablePitchers', {})
    away_pitcher = prob_pitchers.get('away', {}).get('athlete', {}).get('displayName', 'TBD')
    home_pitcher = prob_pitchers.get('home', {}).get('athlete', {}).get('displayName', 'TBD')
    
    # Moneyline odds
    away_ml_raw = odds.get('awayTeamOdds', {}).get('value')
    home_ml_raw = odds.get('homeTeamOdds', {}).get('value')
    
    def ml_to_prob(ml):
        if ml is None: return None
        if ml > 0:
            return 100 / (ml + 100)
        else:
            return abs(ml) / (abs(ml) + 100)
    
    away_imp = ml_to_prob(away_ml_raw)
    home_imp = ml_to_prob(home_ml_raw)
    
    home_edge = (model_home_pct - home_imp) * 100 if home_imp else 0
    away_edge = (model_away_pct - away_imp) * 100 if away_imp else 0
    
    # Fair odds (no vig)
    if home_imp and away_imp:
        total_imp = home_imp + away_imp
        fair_home = home_imp / total_imp
        fair_away = away_imp / total_imp
        # Vig percentage
        vig = (total_imp - 1.0) * 100
    else:
        fair_home = home_imp
        fair_away = away_imp
        vig = 0
    
    results.append({
        'away': away, 'home': home,
        'away_rec': away_rec, 'home_rec': home_rec,
        'away_w': aw, 'away_l': al, 'home_w': hw, 'home_l': hl,
        'away_wp': away_wp, 'home_wp': home_wp,
        'away_ml': away_ml_raw, 'home_ml': home_ml_raw,
        'away_imp': away_imp, 'home_imp': home_imp,
        'fair_home': fair_home, 'fair_away': fair_away,
        'vig': vig,
        'model_home_pct': model_home_pct,
        'model_away_pct': model_away_pct,
        'home_edge': home_edge, 'away_edge': away_edge,
        'away_pitcher': away_pitcher, 'home_pitcher': home_pitcher,
    })

# ============================================
# ANALYSE COMPLETE - 15 MATCHS MLB 12 AOUT 2026
# ============================================

print("=" * 110)
print("   ANALYSE SABERMETRIQUE COMPLETE - MLB 12 AOUT 2026")
print("   Modele: Win% + HFA (3.8%) + Ajustement vig")
print("=" * 110)
print()

# Sort by max absolute edge
ranked = []
for r in results:
    # Best pick for each game
    if r['home_edge'] >= r['away_edge']:
        ranked.append({
            'pick': f"HOME: {r['home']}",
            'opponent': r['away'],
            'side': 'home',
            'team': r['home'],
            'ml': r['home_ml'],
            'implied': r['home_imp'],
            'model': r['model_home_pct'],
            'edge': r['home_edge'],
            'pitcher': r['home_pitcher'],
            'rec': r['home_rec'],
            'opp_rec': r['away_rec'],
        })
    else:
        ranked.append({
            'pick': f"AWAY: {r['away']}",
            'opponent': r['home'],
            'side': 'away',
            'team': r['away'],
            'ml': r['away_ml'],
            'implied': r['away_imp'],
            'model': r['model_away_pct'],
            'edge': r['away_edge'],
            'pitcher': r['away_pitcher'],
            'rec': r['away_rec'],
            'opp_rec': r['home_rec'],
        })

ranked.sort(key=lambda x: x['edge'], reverse=True)

print(f"{'#':>2} | {'PICK (cote)':<50} | {'IMPLIQUE':>8} | {'MODELE':>8} | {'EDGE':>7} | {'PITCHEUR':<22} | {'RECORD vs ADVERSAIRE'}")
print("-" * 110)

for i, r in enumerate(ranked):
    ml_str = f"{r['ml']:+d}" if r['ml'] else "N/A"
    edge_str = f"+{r['edge']:.1f}%" if r['edge'] > 0 else f"{r['edge']:.1f}%"
    pick_display = f"{r['pick']:<25} ({ml_str})"
    print(f"{i+1:>2} | {pick_display:<50} | {r['implied']*100:>6.1f}% | {r['model']*100:>6.1f}% | {edge_str:>7} | {r['pitcher']:<22} | {r['rec']} vs {r['opp_rec']}")

print()
print("=" * 110)
print("   COMBO RECOMMANDES")
print("=" * 110)
print()

# ============================================
# COMBO 1: 3 LEGS - PLUS HAUT EDGE
# ============================================
print("COMBO 1: 3 LEGS - HAUTE CONFIANCE")
print("-" * 80)

# Pick top 3 by edge
top3 = ranked[:3]
combo_prob = 1.0
combo_odds = 1.0
total_edge = 0

print(f"Mise: 10 000 F")
print()

for i, r in enumerate(top3):
    ml_decimal = (r['ml'] + 100) / 100 if r['ml'] > 0 else 100 / (abs(r['ml']) + 100) * 100 / 100 if r['ml'] else 1.0
    # Correct decimal odds calculation
    if r['ml'] > 0:
        ml_decimal = 1 + (r['ml'] / 100)
    else:
        ml_decimal = 1 + (100 / abs(r['ml']))
    
    combo_prob *= r['model']
    combo_odds *= ml_decimal
    total_edge += r['edge']
    
    print(f"  LEG {i+1}: {r['pick']} (cote {r['ml']:+d} = {ml_decimal:.3f})")
    print(f"         Probabilite modele: {r['model']*100:.1f}% | Prob implicite: {r['implied']*100:.1f}% | Edge: +{r['edge']:.1f}%")
    print(f"         Pitcher: {r['pitcher']} | Record: {r['rec']}")
    print()

combo_odds_r3 = round(combo_odds, 3)
gain_potentiel = 10000 * combo_odds_r3

print(f"  COTE COMBO: {combo_odds_r3:.2f}")
print(f"  PROBABILITE COMBO: {combo_prob*100:.1f}%")
print(f"  EDGE MOYEN: +{total_edge/3:.1f}%")
print(f"  GAIN POTENTIEL: {gain_potentiel:,.0f} F")
print(f"  ESPERANCE MATHEMATIQUE: {gain_potentiel * combo_prob:,.0f} F")
print()

# ============================================
# COMBO 2: 4 LEGS - EQUILIBRE RISQUE/GAIN
# ============================================
print("=" * 80)
print("COMBO 2: 4 LEGS - EQUILIBRE RISQUE/GAIN")
print("-" * 80)

top4 = ranked[:4]
combo_prob_4 = 1.0
combo_odds_4 = 1.0

print(f"Mise: 10 000 F")
print()

for i, r in enumerate(top4):
    if r['ml'] > 0:
        ml_decimal = 1 + (r['ml'] / 100)
    else:
        ml_decimal = 1 + (100 / abs(r['ml']))
    
    combo_prob_4 *= r['model']
    combo_odds_4 *= ml_decimal
    
    print(f"  LEG {i+1}: {r['pick']} (cote {r['ml']:+d} = {ml_decimal:.3f})")
    print(f"         Prob modele: {r['model']*100:.1f}% | Edge: +{r['edge']:.1f}%")

print()
print(f"  COTE COMBO: {combo_odds_4:.2f}")
print(f"  PROBABILITE: {combo_prob_4*100:.1f}%")
print(f"  GAIN POTENTIEL: {10000 * combo_odds_4:,.0f} F")
print()

# ============================================
# COMBO 3: 2 LEGS - MAX SECURITE (objectif x10 = 100 000F)
# ============================================
print("=" * 80)
print("COMBO 3: 2 LEGS - MAX SECURITE (objectif x10)")
print("-" * 80)

# Pick the top 2 with best edge AND highest probability
safe_picks = sorted(ranked, key=lambda x: (x['model'], x['edge']), reverse=True)[:2]
combo_prob_2 = 1.0
combo_odds_2 = 1.0

print(f"Mise: 10 000 F")
print()

for i, r in enumerate(safe_picks):
    if r['ml'] > 0:
        ml_decimal = 1 + (r['ml'] / 100)
    else:
        ml_decimal = 1 + (100 / abs(r['ml']))
    
    combo_prob_2 *= r['model']
    combo_odds_2 *= ml_decimal
    
    print(f"  LEG {i+1}: {r['pick']} (cote {r['ml']:+d} = {ml_decimal:.3f})")
    print(f"         Prob modele: {r['model']*100:.1f}% | Edge: +{r['edge']:.1f}% | Pitcher: {r['pitcher']}")

print()
print(f"  COTE COMBO: {combo_odds_2:.2f}")
print(f"  PROBABILITE: {combo_prob_2*100:.1f}%")
print(f"  GAIN POTENTIEL: {10000 * combo_odds_2:,.0f} F")
print()

# ============================================
# TABLEAU RECAPITULATIF
# ============================================
print("=" * 110)
print("   RECAPITULATIF COMPARATIF")
print("=" * 110)
print()
print(f"{'COMBO':<25} | {'LEGS':>4} | {'COTE':>7} | {'PROB%':>6} | {'GAIN POTENTIEL':>18} | {'ESPERANCE':>15} | {'RISQUE':>8}")
print("-" * 110)

combos = [
    ("2 Legs (Max Securite)", 2, combo_odds_2, combo_prob_2),
    ("3 Legs (Haute Confiance)", 3, combo_odds_r3, combo_prob),
    ("4 Legs (Equilibre)", 4, combo_odds_4, combo_prob_4),
]

for name, legs, odds, prob in combos:
    gain = 10000 * odds
    esperance = gain * prob
    risque = "FAIBLE" if prob > 0.4 else "MOYEN" if prob > 0.25 else "ELEVE"
    print(f"{name:<25} | {legs:>4} | {odds:>7.2f} | {prob*100:>5.1f}% | {gain:>15,.0f} F | {esperance:>13,.0f} F | {risque:>8}")

print()
print("MISE INITIALE: 10 000 F")
print("OBJECTIF: 2 000 000 F (x200)")
print()

# Strategy to reach 2M
print("=" * 110)
print("   STRATEGIE POUR ATTEINDRE 2 000 000 F")
print("=" * 110)
print()

# Simulate compound betting with Combo 2 (3 legs, ~34% prob)
prob_combo3 = combo_prob
odds_combo3 = combo_odds_r3

print(f"Strategie: Recombiner les gains avec le Combo 3 ({prob_combo3*100:.1f}% prob, cote {odds_combo3:.2f})")
print()

bankroll = 10000
target = 2000000
step = 0
total_prob = 1.0

while bankroll < target and step < 15:
    step += 1
    new_bankroll = bankroll * odds_combo3
    if new_bankroll > target:
        # Calculate needed odds
        needed_odds = target / bankroll
        print(f"  Etape {step}: {bankroll:,.0f} F x cote {needed_odds:.2f} = {target:,.0f} F OBJECTIF ATTEINT")
        total_prob *= (target / bankroll) / odds_combo3  # approximate
        break
    total_prob *= prob_combo3
    print(f"  Etape {step}: {bankroll:,.0f} F x {odds_combo3:.2f} = {new_bankroll:,.0f} F (prob cumulee: {total_prob*100:.2f}%)")
    bankroll = new_bankroll

print()
print(f"  Probabilite globale d'atteindre 2M en {step} etapes: {total_prob*100:.2f}%")
print(f"  Si echec a une etape: perte totale de la bankroll")
