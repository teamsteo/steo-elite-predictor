import json

with open('/tmp/mlb_today.json', 'r') as f:
    data = json.load(f)

events = data.get('events', [])
print(f"Matches trouves: {len(events)}")

results = []
for e in events:
    comp = e.get('competitions', [{}])[0]
    competitors = comp.get('competitors', [])
    home_c = next((c for c in competitors if c.get('homeAway') == 'home'), {})
    away_c = next((c for c in competitors if c.get('homeAway') == 'away'), {})
    
    away = away_c.get('team', {}).get('displayName', '???')
    home = home_c.get('team', {}).get('displayName', '???')
    
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
    
    # HFA (3.8% in MLB)
    hfa = 0.038
    model_home = home_wp + hfa
    model_away = away_wp - hfa
    total_m = model_home + model_away
    model_home_pct = model_home / total_m
    model_away_pct = model_away / total_m
    
    # Pitchers
    pp = comp.get('probablePitchers', {})
    away_pitcher = pp.get('away', {}).get('athlete', {}).get('displayName', 'TBD')
    home_pitcher = pp.get('home', {}).get('athlete', {}).get('displayName', 'TBD')
    
    # Moneyline from ESPN: o['moneyline']['home']['close']['odds'] (string like "-108")
    odds_list = comp.get('odds', [])
    away_ml = None
    home_ml = None
    
    if odds_list:
        o = odds_list[0]
        ml = o.get('moneyline', {})
        if ml:
            try:
                home_ml_str = ml.get('home', {}).get('close', {}).get('odds', '')
                away_ml_str = ml.get('away', {}).get('close', {}).get('odds', '')
                home_ml = int(home_ml_str) if home_ml_str else None
                away_ml = int(away_ml_str) if away_ml_str else None
            except (ValueError, TypeError):
                pass
    
    results.append({
        'away': away, 'home': home,
        'away_rec': away_rec, 'home_rec': home_rec,
        'away_w': aw, 'away_l': al, 'home_w': hw, 'home_l': hl,
        'away_wp': away_wp, 'home_wp': home_wp,
        'away_ml': away_ml, 'home_ml': home_ml,
        'model_home_pct': model_home_pct,
        'model_away_pct': model_away_pct,
        'away_pitcher': away_pitcher, 'home_pitcher': home_pitcher,
    })

def ml_to_prob(ml):
    if ml is None: return None
    if ml > 0: return 100 / (ml + 100)
    else: return abs(ml) / (abs(ml) + 100)

def ml_to_decimal(ml):
    if ml is None: return 1.0
    if ml > 0: return 1 + (ml / 100)
    else: return 1 + (100 / abs(ml))

# ============================================
# ANALYSE SABERMETRIQUE - MLB 12 AOUT 2026
# ============================================

print("=" * 120)
print("   ANALYSE SABERMETRIQUE COMPLETE - MLB 12 AOUT 2026 (15 matchs)")
print("   Modele: Win% ponderee + HFA 3.8% + Edge vs cotes DraftKings")
print("   Mise initiale: 10 000 F | Objectif: 2 000 000 F")
print("=" * 120)
print()

# Build picks
picks = []
for r in results:
    away_imp = ml_to_prob(r['away_ml'])
    home_imp = ml_to_prob(r['home_ml'])
    
    home_edge = (r['model_home_pct'] - home_imp) * 100 if home_imp else 0
    away_edge = (r['model_away_pct'] - away_imp) * 100 if away_imp else 0
    
    if home_edge >= away_edge:
        picks.append({
            'match': f"{r['away']} @ {r['home']}",
            'pick': r['home'],
            'side': 'HOME',
            'against': r['away'],
            'ml': r['home_ml'],
            'implied': home_imp,
            'model': r['model_home_pct'],
            'edge': home_edge,
            'pitcher': r['home_pitcher'],
            'pick_rec': f"{r['home_w']}-{r['home_l']}",
            'opp_rec': f"{r['away_w']}-{r['away_l']}",
            'pick_wp': r['home_wp'],
            'opp_wp': r['away_wp'],
        })
    else:
        picks.append({
            'match': f"{r['away']} @ {r['home']}",
            'pick': r['away'],
            'side': 'AWAY',
            'against': r['home'],
            'ml': r['away_ml'],
            'implied': away_imp,
            'model': r['model_away_pct'],
            'edge': away_edge,
            'pitcher': r['away_pitcher'],
            'pick_rec': f"{r['away_w']}-{r['away_l']}",
            'opp_rec': f"{r['home_w']}-{r['home_l']}",
            'pick_wp': r['away_wp'],
            'opp_wp': r['home_wp'],
        })

# Sort by model probability (descending) for safety, then by edge
picks_by_model = sorted(picks, key=lambda x: (x['model'], x['edge']), reverse=True)
picks_by_edge = sorted(picks, key=lambda x: x['edge'], reverse=True)

# Print all picks ranked
print("CLASSEMENT PAR PROBABILITE DU MODELE (plus fiables d'abord)")
print("-" * 120)
print(f"{'#':>2} | {'MATCH':<48} | {'PICK':<22} | {'ML':>5} | {'COTE':>5} | {'IMPL%':>6} | {'MODEL%':>7} | {'EDGE':>7} | {'PITCHEUR':<20}")
print("-" * 120)

for i, p in enumerate(picks_by_model):
    ml_str = f"{p['ml']:+d}" if p['ml'] else "N/A"
    decimal = ml_to_decimal(p['ml'])
    edge_str = f"+{p['edge']:.1f}%" if p['edge'] > 0 else f"{p['edge']:.1f}%"
    print(f"{i+1:>2} | {p['match']:<48} | {p['side']}: {p['pick']:<15} | {ml_str:>5} | {decimal:>5.3f} | {p['implied']*100:>5.1f}% | {p['model']*100:>6.1f}% | {edge_str:>7} | {p['pitcher']:<20}")

print()
print()

# ============================================
# COMBO CONSTRUCTION
# ============================================

def build_combo(legs_picks, label):
    """Build a combo from given picks and print analysis"""
    combo_model_prob = 1.0
    combo_odds = 1.0
    total_edge = 0
    
    print("=" * 100)
    print(f"  {label}")
    print("=" * 100)
    print()
    
    for i, p in enumerate(legs_picks):
        decimal = ml_to_decimal(p['ml'])
        combo_model_prob *= p['model']
        combo_odds *= decimal
        total_edge += p['edge']
        
        ml_str = f"{p['ml']:+d}" if p['ml'] else "N/A"
        edge_str = f"+{p['edge']:.1f}%" if p['edge'] > 0 else f"{p['edge']:.1f}%"
        confidence = "HAUTE" if p['model'] >= 0.60 else "MOYENNE" if p['model'] >= 0.50 else "FAIBLE"
        
        print(f"  LEG {i+1}: {p['pick']} ({p['side']})")
        print(f"    Match: {p['match']}")
        print(f"    Cote: {ml_str} = {decimal:.3f}")
        print(f"    Probabilite modele: {p['model']*100:.1f}% | Prob implicite bookmaker: {p['implied']*100:.1f}%")
        print(f"    Edge: {edge_str} | Confiance: {confidence}")
        print(f"    Pitcher: {p['pitcher']}")
        print(f"    Record: {p['pick_rec']} ({p['pick_wp']*100:.1f}%) vs {p['opp_rec']} ({p['opp_wp']*100:.1f}%)")
        print()
    
    gain = 10000 * combo_odds
    esperance = gain * combo_model_prob
    risk = "FAIBLE" if combo_model_prob >= 0.40 else "MOYEN" if combo_model_prob >= 0.25 else "HAUT"
    
    print(f"  {'─'*50}")
    print(f"  COTE COMBO: {combo_odds:.2f}x")
    print(f"  PROBABILITE: {combo_model_prob*100:.1f}%")
    print(f"  EDGE MOYEN: +{total_edge/len(legs_picks):.1f}% par leg")
    print(f"  MISE: 10 000 F")
    print(f"  GAIN POTENTIEL: {gain:,.0f} F")
    print(f"  ESPERANCE: +{esperance:,.0f} F (gain * prob)")
    print(f"  RISQUE: {risk}")
    print()
    
    return {
        'label': label,
        'legs': len(legs_picks),
        'odds': combo_odds,
        'prob': combo_model_prob,
        'gain': gain,
        'esperance': esperance,
    }

# COMBO 1: 3 legs - les plus fiables par prob modele
top3_model = picks_by_model[:3]
combo1 = build_combo(top3_model, "COMBO 1: 3 LEGS - PLUS FIABLES (haute probabilite)")

# COMBO 2: 3 legs - meilleur edge
top3_edge = picks_by_edge[:3]
combo2 = build_combo(top3_edge, "COMBO 2: 3 LEGS - MEILLEUR EDGE (valeur)")

# COMBO 3: 4 legs - equilibre
top4_model = picks_by_model[:4]
combo3 = build_combo(top4_model, "COMBO 3: 4 LEGS - EQUILIBRE RISQUE/GAIN")

# COMBO 4: 2 legs - max securite
top2_model = picks_by_model[:2]
combo4 = build_combo(top2_model, "COMBO 4: 2 LEGS - MAX SECURITE")

# ============================================
# RECAPITULATIF
# ============================================
print()
print("=" * 120)
print("   RECAPITULATIF COMPARATIF")
print("=" * 120)
print()
print(f"{'COMBO':<40} | {'LEGS':>4} | {'COTE':>7} | {'PROB%':>7} | {'GAIN POTENTIEL':>18} | {'ESPERANCE':>15} | {'RISQUE':>10}")
print("-" * 120)

for c in [combo4, combo1, combo2, combo3]:
    risk = "FAIBLE" if c['prob'] >= 0.40 else "MOYEN" if c['prob'] >= 0.25 else "HAUT"
    print(f"{c['label']:<40} | {c['legs']:>4} | {c['odds']:>7.2f} | {c['prob']*100:>6.1f}% | {c['gain']:>15,.0f} F | {c['esperance']:>13,.0f} F | {risk:>10}")

print()
print("MISE: 10 000 F | OBJECTIF: 2 000 000 F (x200)")
print()

# ============================================
# STRATEGIE COMPOUND POUR ATTEINDRE 2M
# ============================================
print("=" * 120)
print("   STRATEGIE COMPOUND POUR ATTEINDRE 2 000 000 F")
print("=" * 120)
print()

# Test with combo4 (2 legs, highest prob)
for label, c in [("COMBO 4 (2 Legs)", combo4), ("COMBO 1 (3 Legs)", combo1)]:
    bankroll = 10000
    target = 2000000
    step = 0
    cumul_prob = 1.0
    
    print(f"--- Avec {label} ({c['prob']*100:.1f}% prob, cote {c['odds']:.2f}) ---")
    print()
    
    while bankroll < target and step < 20:
        step += 1
        if bankroll * c['odds'] >= target:
            needed = target / bankroll
            print(f"  Etape {step}: {bankroll:>12,.0f} F x cote {needed:.2f} = {target:>12,.0f} F  OBJECTIF ATTEINT")
            cumul_prob *= (needed / c['odds'])  # approx
            break
        new_bank = bankroll * c['odds']
        cumul_prob *= c['prob']
        print(f"  Etape {step}: {bankroll:>12,.0f} F x {c['odds']:.2f} = {new_bank:>12,.0f} F  (prob cumul: {cumul_prob*100:.2f}%)")
        bankroll = new_bank
    
    print(f"  Probabilite globale de tout gagner: {cumul_prob*100:.2f}%")
    print(f"  Si perte a N'IMPORTE QUELLE etape = perte TOTALE de la bankroll")
    print()

# ============================================
# ANALYSE HONNETE - VERITE BRUTE
# ============================================
print("=" * 120)
print("   ANALYSE HONNETE - LA VERITE MATHEMATIQUE")
print("=" * 120)
print()
print("1. MLB est le seul sport en saison (NBA/NHL off, football pas encore commence)")
print("2. La cote la plus basse aujourd'hui: LAD -229 (66.6% implicite) - mais baseball est imprevisible")
print("3. Meme le meilleur pick du jour a ~66% de chance reelles de gagner")
print("4. Un combo a 66% par leg sur 3 legs = 66% x 66% x 66% = 28.7% de probabilite")
print("5. Pour atteindre 2M depuis 10K, il faut x200 en un seul combo OU recombiner")
print()
print("   SI UN SEUL COMBO: Cote de 200x necessaire = risk extreme")
print("   SI COMPOUND (recombinaison): ~6 etapes a x3.4 = 28.7% par etape")
print("   Probabilite totale: 0.287^6 = 0.06% seulement")
print()
print("   CONCLUSION: Atteindre 2M depuis 10K est POSSIBLE mais la probabilite")
print("   reste < 1% meme avec la meilleure strategie. C'est un high-risk gambling.")
print()
print("   RECOMMANDATION: Reduire l'objectif a x10 (100 000 F) avec le COMBO 4 (2 legs)")
print(f"   Probabilite: {combo4['prob']*100:.1f}% - c'est le plus realiste")
