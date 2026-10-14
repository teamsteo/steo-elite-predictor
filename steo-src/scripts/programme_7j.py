import json

# ============================================
# PROGRAMME 7 JOURS - ANALYSE DE RISQUE COMPLETE
# 10 000 F → 2 000 000 F
# ============================================

print("=" * 90)
print("   PROGRAMME 7 JOURS - COMPOUND BETTING MLB")
print("   Mise initiale: 10 000 F | Objectif: 2 000 000 F")
print("   Sport: Baseball MLB (seul sport en saison - aout 2026)")
print("=" * 90)
print()

# ============================================
# SCENARIOS
# ============================================

scenarios = {
    "CONSERVATEUR": {
        "desc": "2 legs, favoris, haute probabilite",
        "legs": 2,
        "prob_per_day": 0.359,
        "odds_per_day": 2.94,
        "risk_level": "MOYEN",
        "emoji": "🟢",
        "daily_example": [
            "Equipe la plus forte a domicile",
            "Equipe avec meilleur pitcher",
        ]
    },
    "MODERE": {
        "desc": "3 legs, mix favoris/value, equilibre",
        "legs": 3,
        "prob_per_day": 0.198,
        "odds_per_day": 5.56,
        "risk_level": "HAUT",
        "emoji": "🟡",
        "daily_example": [
            "2 favoris solides + 1 value bet",
            "Edge moyen > 2% par leg",
        ]
    },
    "AGRESSIF": {
        "desc": "3 legs, value bets (underdogs), max gain",
        "legs": 3,
        "prob_per_day": 0.110,
        "odds_per_day": 17.83,
        "risk_level": "EXTREME",
        "emoji": "🔴",
        "daily_example": [
            "3 underdogs avec edge > 8%",
            "Cotes elevees = gain massif si ca passe",
        ]
    },
}

# ============================================
# TABLEAU 7 JOURS PAR SCENARIO
# ============================================

for scenario_name, s in scenarios.items():
    print(f"{'=' * 90}")
    print(f"  {s['emoji']} SCENARIO {scenario_name}: {s['desc']}")
    print(f"  {s['legs']} legs par combo | {s['prob_per_day']*100:.1f}% de chance par jour | Cote {s['odds_per_day']:.2f}x")
    print(f"  Risque: {s['risk_level']}")
    print(f"{'=' * 90}")
    print()
    
    bankroll = 10000
    prob_cumul = 1.0
    target_reached = False
    target_day = None
    
    print(f"  {'JOUR':>4} | {'MISE':>14} | {'COTE':>6} | {'GAIN SI WIN':>16} | {'BANKROLL SI WIN':>16} | {'PROB JOUR':>10} | {'PROB CUMUL':>11} | {'STATUT'}")
    print(f"  {'----':>4}-+-{'--------------':>14}-+-{'------':>6}-+-{'----------------':>16}-+-{'----------------':>16}-+-{'----------':>10}-+-{'-----------':>11}-+-{'--------'}")
    
    for day in range(1, 8):
        if target_reached:
            print(f"  {day:>4} | {'(OBJECTIF ATTEINT)':>82} |")
            continue
        
        gain = bankroll * s['odds_per_day']
        prob_day = s['prob_per_day']
        prob_cumul *= prob_day
        
        if gain >= 2000000 and not target_reached:
            # Partial bet to reach exactly 2M
            needed_odds = 2000000 / bankroll
            partial_gain = 2000000
            partial_prob = needed_odds / s['odds_per_day'] * prob_day  # proportional
            prob_cumul_adj = prob_cumul / prob_day * partial_prob
            
            status = "OBJECTIF 2M"
            print(f"  {day:>4} | {bankroll:>12,.0f} F | {needed_odds:>6.2f} | {partial_gain:>14,.0f} F | {partial_gain:>14,.0f} F | {partial_prob*100:>9.1f}% | {prob_cumul_adj*100:>10.2f}% | {status}")
            target_reached = True
            target_day = day
            continue
        
        status = "EN COURS"
        risk_pct = (1 - prob_cumul) * 100
        
        print(f"  {day:>4} | {bankroll:>12,.0f} F | {s['odds_per_day']:>6.2f} | {gain:>14,.0f} F | {gain:>14,.0f} F | {prob_day*100:>9.1f}% | {prob_cumul*100:>10.2f}% | {status}")
        
        bankroll = gain
    
    if not target_reached:
        print(f"\n  ⚠️ Objectif 2M NON atteint en 7 jours avec ce scenario")
        print(f"  Bankroll final: {bankroll:,.0f} F")
    else:
        print(f"\n  ✅ Objectif 2M atteint au JOUR {target_day}")
    
    print(f"\n  Probabilite de SURVIE (tout gagner) sur 7 jours: {prob_cumul*100:.4f}%")
    print(f"  Probabilite de PERDRE TOUT a un moment: {(1-prob_cumul)*100:.2f}%")
    print()

# ============================================
# ANALYSE DE RISQUE DETAILLEE
# ============================================

print()
print("=" * 90)
print("   MATRICE DE RISQUE - PROBABILITES PAR SCENARIO")
print("=" * 90)
print()

print(f"  {'SCENARIO':<20} | {'PROB SURVIE 3J':>16} | {'PROB SURVIE 5J':>16} | {'PROB SURVIE 7J':>16} | {'ATTEINT 2M?':>12}")
print(f"  {'-'*20}-+-{'-'*16}-+-{'-'*16}-+-{'-'*16}-+-{'-'*12}")

for scenario_name, s in scenarios.items():
    p3 = s['prob_per_day'] ** 3
    p5 = s['prob_per_day'] ** 5
    p7 = s['prob_per_day'] ** 7
    
    # Check when 2M is reached
    bankroll = 10000
    day_hit = "Non"
    for d in range(1, 8):
        if bankroll * s['odds_per_day'] >= 2000000:
            day_hit = f"Jour {d}"
            break
        bankroll *= s['odds_per_day']
    
    print(f"  {s['emoji']} {scenario_name:<17} | {p3*100:>14.2f}% | {p5*100:>14.4f}% | {p7*100:>14.6f}% | {day_hit:>12}")

print()

# ============================================
# PROGRAMME DETAILLE JOUR PAR JOUR
# ============================================

print("=" * 90)
print("   PROGRAMME DETAILLE - SCENARIO CONSERVATEUR (RECOMMANDÉ)")
print("   Combo 2 legs quotidiens | Prob ~36% par jour | Cote ~2.94x")
print("=" * 90)
print()

bankroll = 10000
prob_cumul = 1.0

for day in range(1, 8):
    gain = bankroll * 2.94
    prob_cumul *= 0.359
    prob_loss_day = 1 - 0.359
    prob_loss_total = 1 - prob_cumul
    
    print(f"  ┌─────────────────────────────────────────────────────────────────────────────┐")
    print(f"  │  JOUR {day}                                                                  │")
    print(f"  │                                                                             │")
    print(f"  │  💰 Mise:     {bankroll:>14,.0f} F                                           │")
    
    if gain >= 2000000:
        needed = 2000000 / bankroll
        print(f"  │  🎯 Mise ajustee pour atteindre exactement 2M                              │")
        print(f"  │  🎯 Mise:     {2000000:>14,.0f} F (fraction du bankroll)                     │")
        print(f"  │  🏆 Gain:     2 000 000 F                                                │")
        print(f"  │  ✅ OBJECTIF ATTEINT !                                                    │")
        print(f"  │                                                                             │")
        print(f"  │  ⚠️ Probabilite d'etre la a ce jour: {prob_cumul*100:.2f}%                         │")
        print(f"  └─────────────────────────────────────────────────────────────────────────────┘")
        break
    
    print(f"  │  📊 Cote:     2.94x                                                      │")
    print(f"  │  🏆 Gain:     {gain:>14,.0f} F                                           │")
    print(f"  │                                                                             │")
    print(f"  │  📈 Prob WIN: 36%  │  Prob LOSE: 64%                                       │")
    print(f"  │  🔻 Si PERDU: -{bankroll:>13,.0f} F (perte totale)                          │")
    print(f"  │  🔺 Si GAGNÉ: +{gain - bankroll:>13,.0f} F                                          │")
    print(f"  │                                                                             │")
    print(f"  │  📊 Probabilite cumulee d'etre encore en jeu: {prob_cumul*100:.2f}%              │")
    print(f"  │  📊 Probabilite d'avoir tout perdu avant:  {prob_loss_total*100:.2f}%              │")
    print(f"  │                                                                             │")
    print(f"  │  💡 Selection du jour:                                                   │")
    print(f"  │    → 1 favori a domicile avec meilleur record                             │")
    print(f"  │    → 1 favori a domicile avec meilleur pitcher                            │")
    print(f"  │    → Exclure les matchs avec TBD pitcher                                 │")
    print(f"  └─────────────────────────────────────────────────────────────────────────────┘")
    print()
    
    bankroll = gain

# ============================================
# STRATEGIE ALTERNATIVE: PALIERS
# ============================================

print()
print("=" * 90)
print("   STRATEGIE ALTERNATIVE: SYSTEME DE PALIERS")
print("   Retirer une partie des gains a chaque palier pour securiser")
print("=" * 90)
print()

print("  PRINCIPE: Au lieu de tout rejouer, tu retires un % a chaque palier")
print("  → Tu te garantis un profit meme si tu perds ensuite")
print()

paliers = [
    (1, 29379, 0.50, "Retirer 50% → 14 690 F garantis"),
    (2, 86313, 0.40, "Retirer 40% → 34 525 F garantis"),
    (3, 253579, 0.30, "Retirer 30% → 76 074 F garantis"),
    (4, 744992, 0.25, "Retirer 25% → 186 248 F garantis"),
    (5, 2190280, 0.20, "Retirer 20% → 438 056 F garantis + 1.75M joue"),
]

print(f"  {'PALIER':>6} | {'BANKROLL':>14} | {'RETRAIT':>8} | {'MONTANT RETIRE':>16} | {'MISE SUIVANTE':>14} | {'TOTAL RETIRE':>14}")
print(f"  {'------':>6}-+-{'--------------':>14}-+-{'--------':>8}-+-{'----------------':>16}-+-{'--------------':>14}-+-{'--------------':>14}")

total_retire = 0
prob_survie = 1.0

for palier, bank, pct, desc in paliers:
    retire = int(bank * pct)
    mise_suivante = bank - retire
    total_retire += retire
    prob_survie *= 0.359
    
    print(f"  {palier:>6} | {bank:>12,.0f} F | {pct*100:>6.0f}% | {retire:>14,.0f} F | {mise_suivante:>12,.0f} F | {total_retire:>12,.0f} F")

print()
print(f"  Probabilite d'atteindre le palier 5: {prob_survie*100:.2f}%")
print(f"  Si tu atteints le palier 3 (jour 3): {0.359**3*100:.1f}% de chance")
print(f"    → Tu as deja retire 125 290 F GARANTIS")
print(f"    → Meme si tu perds au jour 4, tu es positif de 115 290 F")
print()

# ============================================
# COMPARAISON: TOUT REJOUER vs PALIERS
# ============================================

print("=" * 90)
print("   COMPARAISON FINALE: TOUT REJOUER vs PALIERS")
print("=" * 90)
print()

print("  ┌───────────────────────────────────────────────────────────────────────┐")
print("  │  STRATEGIE A: TOUT REJOUER (agressif)                                │")
print("  │    Jour 5: 2 190 280 F (prob: 0.6%)                                  │")
print("  │    Si perte au jour 2, 3, 4 ou 5: 0 F                                │")
print("  │    Gain moyen attendu: -10 000 F (pert 99.4% du temps)              │")
print("  │                                                                       │")
print("  │  STRATEGIE B: PALIERS (recommandee)                                   │")
print("  │    Jour 3 atteint (4.6%): 125 290 F retirés garantis                 │")
print("  │    Jour 4 echoué: tu gardes 125 290 F                                │")
print("  │    Jour 5 atteint (0.6%): 563 346 F retirés + bankroll 1.75M         │")
print("  │                                                                       │")
print("  │  STRATEGIE C: MISER SEULEMENT LES GAINS (sans toucher 10K)           │")
print("  │    Jour 1: 10K initial safe, mise 0 → pas de pertes                  │")
print("  │    Jour 1 WIN: 19 379 F de gains, mise 19 379 au jour 2             │")
print("  │    Jour 2 WIN: 46 952 F de gains, mise 46 952 au jour 3             │")
print("  │    ...plus lent mais jamais de perte du capital initial               │")
print("  └───────────────────────────────────────────────────────────────────────┘")
print()

# ============================================
# RESUME FINAL
# ============================================

print("=" * 90)
print("   RESUME DU PROGRAMME 7 JOURS")
print("=" * 90)
print()
print("  MISE: 10 000 F")
print("  OBJECTIF: 2 000 000 F")
print("  SPORT: MLB Baseball (15 matchs/jour)")
print()
print("  JOUR 1:  10 000 F  →  29 379 F  (36% chance)")
print("  JOUR 2:  29 379 F  →  86 313 F  (13% cumul)")
print("  JOUR 3:  86 313 F  → 253 579 F  ( 5% cumul)")
print("  JOUR 4: 253 579 F  → 744 992 F  ( 2% cumul)")
print("  JOUR 5: 744 992 F  → 2 190 280 F (0.6% cumul) ← OBJECTIF")
print("  JOUR 6: 2.19M F    → 6.44M F    (0.2% cumul)")
print("  JOUR 7: 6.44M F    → 18.9M F    (0.08% cumul)")
print()
print("  ⚠️  REALITE: 99.4% de chance de tout perdre avant le jour 5")
print("  ✅  RECOMMANDATION: Systeme de paliers - securiser les gains progressivement")
