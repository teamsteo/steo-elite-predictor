"""
Combo manuel : analyse les 21 matchs fournis par l'utilisateur,
sélectionne le meilleur combo cote ≥10, risque ≤25% par sélection,
et génère le message Telegram prêt à poster.
"""
import json
from datetime import datetime

# 21 matchs avec cotes fournies
MATCHES = [
    # Premier League
    {"home": "Ipswich Town", "away": "Liverpool", "league": "Premier League", "flag": "\U0001d3f4\U000e0067\U000e0063\U000e0074\U000e0068", "date": "Ven. 4 sept. 19:00", "oddsH": 7.50, "oddsD": 4.75, "oddsA": 1.55},
    {"home": "Manchester City", "away": "Coventry City", "league": "Premier League", "flag": "\U0001d3f4\U000e0067\U000e0063\U000e0074\U000e0068", "date": "Sam. 5 sept. 14:00", "oddsH": 1.20, "oddsD": 7.00, "oddsA": 14.00},
    {"home": "Newcastle United", "away": "AFC Bournemouth", "league": "Premier League", "flag": "\U0001d3f4\U000e0067\U000e0063\U000e0074\U000e0068", "date": "Sam. 5 sept. 14:00", "oddsH": 2.20, "oddsD": 3.75, "oddsA": 3.20},
    {"home": "Everton", "away": "Manchester United", "league": "Premier League", "flag": "\U0001d3f4\U000e0067\U000e0063\U000e0074\U000e0068", "date": "Dim. 6 sept. 13:00", "oddsH": 3.10, "oddsD": 3.40, "oddsA": 2.25},
    {"home": "Arsenal", "away": "Chelsea", "league": "Premier League", "flag": "\U0001d3f4\U000e0067\U000e0063\U000e0074\U000e0068", "date": "Dim. 6 sept. 15:30", "oddsH": 1.85, "oddsD": 3.60, "oddsA": 4.10},
    # La Liga
    {"home": "Real Betis", "away": "Real Madrid", "league": "La Liga", "flag": "\U0001f1ea\U0001f1f8", "date": "Ven. 4 sept. 19:00", "oddsH": 4.20, "oddsD": 3.80, "oddsA": 1.80},
    {"home": "Athletic Bilbao", "away": "Atl\u00e9tico Madrid", "league": "La Liga", "flag": "\U0001f1ea\U0001f1f8", "date": "Sam. 5 sept. 14:15", "oddsH": 2.60, "oddsD": 3.20, "oddsA": 2.80},
    {"home": "Villarreal", "away": "Deportivo La Coru\u00f1a", "league": "La Liga", "flag": "\U0001f1ea\U0001f1f8", "date": "Sam. 5 sept. 19:00", "oddsH": 1.65, "oddsD": 3.90, "oddsA": 5.25},
    {"home": "Valencia CF", "away": "FC Barcelona", "league": "La Liga", "flag": "\U0001f1ea\U0001f1f8", "date": "Dim. 6 sept. 14:15", "oddsH": 4.80, "oddsD": 4.00, "oddsA": 1.68},
    # Serie A
    {"home": "Genoa", "away": "Como 1907", "league": "Serie A", "flag": "\U0001f1ee\U0001f1f9", "date": "Ven. 4 sept. 18:45", "oddsH": 2.40, "oddsD": 3.10, "oddsA": 3.10},
    {"home": "Fiorentina", "away": "Torino", "league": "Serie A", "flag": "\U0001f1ee\U0001f1f9", "date": "Sam. 5 sept. 16:00", "oddsH": 2.10, "oddsD": 3.30, "oddsA": 3.60},
    {"home": "Inter Milan", "away": "SSC Napoli", "league": "Serie A", "flag": "\U0001f1ee\U0001f1f9", "date": "Sam. 5 sept. 18:45", "oddsH": 2.05, "oddsD": 3.40, "oddsA": 3.65},
    {"home": "AS Roma", "away": "Atalanta Bergamo", "league": "Serie A", "flag": "\U0001f1ee\U0001f1f9", "date": "Sam. 5 sept. 18:45", "oddsH": 2.45, "oddsD": 3.30, "oddsA": 2.90},
    # Bundesliga
    {"home": "VfB Stuttgart", "away": "FC Cologne", "league": "Bundesliga", "flag": "\U0001f1e9\U0001f1ea", "date": "Ven. 4 sept. 18:30", "oddsH": 1.70, "oddsD": 3.90, "oddsA": 4.60},
    {"home": "TSG Hoffenheim", "away": "Borussia Dortmund", "league": "Bundesliga", "flag": "\U0001f1e9\U0001f1ea", "date": "Sam. 5 sept. 13:30", "oddsH": 3.40, "oddsD": 3.80, "oddsA": 2.00},
    {"home": "Bayer Leverkusen", "away": "Union Berlin", "league": "Bundesliga", "flag": "\U0001f1e9\U0001f1ea", "date": "Sam. 5 sept. 13:30", "oddsH": 1.50, "oddsD": 4.33, "oddsA": 6.00},
    {"home": "Schalke 04", "away": "Bayern Munich", "league": "Bundesliga", "flag": "\U0001f1e9\U0001f1ea", "date": "Sam. 5 sept. 13:30", "oddsH": 8.50, "oddsD": 5.50, "oddsA": 1.33},
    # Ligue 1
    {"home": "Olympique Lyonnais", "away": "AJ Auxerre", "league": "Ligue 1", "flag": "\U0001f1eb\U0001f1f7", "date": "Ven. 4 sept. 17:00", "oddsH": 1.60, "oddsD": 4.10, "oddsA": 5.25},
    {"home": "Paris Saint-Germain", "away": "AS Monaco", "league": "Ligue 1", "flag": "\U0001f1eb\U0001f1f7", "date": "Ven. 4 sept. 19:05", "oddsH": 1.55, "oddsD": 4.50, "oddsA": 5.50},
    {"home": "RC Lens", "away": "FC Lorient", "league": "Ligue 1", "flag": "\U0001f1eb\U0001f1f7", "date": "Sam. 5 sept. 15:00", "oddsH": 1.75, "oddsD": 3.70, "oddsA": 4.50},
    {"home": "OGC Nice", "away": "Le Mans FC", "league": "Ligue 1", "flag": "\U0001f1eb\U0001f1f7", "date": "Sam. 5 sept. 19:00", "oddsH": 1.45, "oddsD": 4.40, "oddsA": 7.00},
]

MAX_RISK = 25  # %
MIN_ODDS = 1.15
MIN_COMBINED_ODDS = 10
MIN_LEGS = 3
MAX_LEGS = 7
MAX_COMBINED_ODDS = 25


def vig_adjusted_prob(oddsH, oddsD, oddsA):
    """Calcule les probas implicites ajust\u00e9es du vig."""
    impH = 1 / oddsH
    impD = 1 / oddsD
    impA = 1 / oddsA
    margin = impH + impD + impA - 1
    adj = 1 + margin
    return impH / adj, impD / adj, impA / adj


def analyze_matches():
    """Analyse tous les matchs et retourne les candidats tri\u00e9s par proba d\u00e9croissante."""
    candidates = []
    for m in MATCHES:
        probH, probD, probA = vig_adjusted_prob(m["oddsH"], m["oddsD"], m["oddsA"])
        
        # Meilleur choix = plus haute proba
        best_prob = max(probH, probD, probA)
        if best_prob == probH:
            result = "1"
            bet_label = f"Victoire {m['home']}"
            sel_odds = m["oddsH"]
        elif best_prob == probA:
            result = "2"
            bet_label = f"Victoire {m['away']}"
            sel_odds = m["oddsA"]
        else:
            result = "X"
            bet_label = "Match Nul"
            sel_odds = m["oddsD"]
        
        risk = round((1 - best_prob) * 100, 1)
        
        candidates.append({
            **m,
            "probH": round(probH * 100, 1),
            "probD": round(probD * 100, 1),
            "probA": round(probA * 100, 1),
            "bestProb": round(best_prob * 100, 1),
            "risk": risk,
            "result": result,
            "betLabel": bet_label,
            "selOdds": sel_odds,
        })
    
    # Trier par proba d\u00e9croissante (les plus fiables d'abord)
    candidates.sort(key=lambda c: c["bestProb"], reverse=True)
    return candidates


def build_combo(candidates):
    """
    Algorithme glouton en 2 phases :
    Phase 1 : risques <= 20% (les plus s\u00fbrs)
    Phase 2 : risques 20-25% si besoin d'atteindre cote 10
    """
    # Filtrer : risque <= 25% ET cote >= 1.15
    eligible = [c for c in candidates if c["risk"] <= MAX_RISK and c["selOdds"] >= MIN_ODDS]
    
    print(f"=== CANDIDATS \u00c9LIGIBLES ({len(eligible)}/{len(candidates)}) ===\n")
    for i, c in enumerate(eligible):
        risk_bar = "\U0001f7e2" if c["risk"] <= 15 else "\U0001f7e1" if c["risk"] <= 20 else "\U0001f7e0"
        print(f"  {i+1}. {c['home']} vs {c['away']} ({c['league']})")
        print(f"     => {c['betLabel']} @{c['selOdds']:.2f} | Proba: {c['bestProb']}% | Risque: {c['risk']}% {risk_bar}")
        print(f"     {c['date']}")
        print()
    
    if len(eligible) < MIN_LEGS:
        print(f"\u26a0\ufe0f Pas assez de candidats ({len(eligible)}/{MIN_LEGS})")
        return None
    
    combo = []
    combined_odds = 1.0
    
    # Phase 1 : les plus s\u00fbrs (risk <= 20%)
    for c in eligible:
        if len(combo) >= MAX_LEGS:
            break
        if c["risk"] > 20:
            continue
        if combined_odds * c["selOdds"] > MAX_COMBINED_ODDS:
            continue
        combo.append(c)
        combined_odds *= c["selOdds"]
        if combined_odds >= MIN_COMBINED_ODDS:
            break
    
    # Phase 2 : risques 20-25% si on n'a pas encore atteint 10
    if combined_odds < MIN_COMBINED_ODDS:
        remaining = [c for c in eligible if c not in combo and 20 < c["risk"] <= MAX_RISK]
        for c in remaining:
            if len(combo) >= MAX_LEGS:
                break
            if combined_odds * c["selOdds"] > MAX_COMBINED_ODDS:
                continue
            combo.append(c)
            combined_odds *= c["selOdds"]
            if combined_odds >= MIN_COMBINED_ODDS:
                break
    
    if len(combo) < MIN_LEGS or combined_odds < MIN_COMBINED_ODDS:
        print(f"\u26a0\ufe0f Combo impossible ({len(combo)} s\u00e9lections, cote {combined_odds:.2f})")
        return None
    
    return combo


def format_telegram_message(combo):
    """G\u00e8re le message Telegram format\u00e9."""
    combined_odds = 1
    combined_prob = 1
    for c in combo:
        combined_odds *= c["selOdds"]
        combined_prob *= c["bestProb"] / 100
    
    ev = combined_odds * combined_prob - 1
    dates = sorted(set(c["date"] for c in combo))
    
    msg = "\u2554" + "\u2550" * 39 + "\u2557\n"
    msg += "\u2551" + " " * 39 + "\u2551\n"
    msg += "\u2551   \U0001f3af <b>COMBO MULTI-JOURS FOOT</b>        \u2551\n"
    msg += "\u2551   \u26bd 5 Grand Championnats Europ\u00e9ens \u2551\n"
    msg += "\u2551   \U0001f6e1\ufe0f Risque max 25% / s\u00e9lection          \u2551\n"
    msg += "\u2551" + " " * 39 + "\u2551\n"
    msg += "\u255a" + "\u2550" * 39 + "\u255d\n\n"
    
    msg += f"\U0001f4c5 <b>P\u00e9riode</b> : {', '.join(dates)}\n"
    msg += f"\U0001f4ca <b>Cote combin\u00e9e</b> : <code>{combined_odds:.2f}</code>\n"
    msg += f"\U0001f3af <b>Prob. cumul\u00e9e</b> : {combined_prob * 100:.1f}%\n"
    msg += f"\U0001f4b0 <b>Valeur attendue</b> : {'+' if ev >= 0 else ''}{ev * 100:.1f}%\n"
    msg += f"\U0001f4c8 <b>{len(combo)} s\u00e9lections</b>\n\n"
    msg += "\u2501" * 37 + "\n\n"
    
    for i, c in enumerate(combo, 1):
        risk_bar = "\U0001f7e2" if c["risk"] <= 15 else "\U0001f7e1" if c["risk"] <= 20 else "\U0001f7e0"
        vb_badge = " \u2b50 VB" if c["selOdds"] > (1 / (c["bestProb"] / 100)) else ""
        
        msg += f"<b>{i}. {c['betLabel']}</b>\n"
        msg += f"   {c['flag']} {c['league']}\n"
        msg += f"   {c['home']} vs {c['away']}\n"
        msg += f"   \U0001f552 {c['date']} GMT\n"
        msg += f"   \U0001f4b0 Cote : <code>{c['selOdds']:.2f}</code> | "
        msg += f"\U0001f3af Proba : {c['bestProb']}% | "
        msg += f"Risque : {c['risk']}% {risk_bar}{vb_badge}\n\n"
    
    msg += "\u2501" * 37 + "\n\n"
    
    # Bankroll simulation
    stake = 1000
    potential_win = stake * combined_odds
    net_profit = potential_win - stake
    msg += f"\U0001f4b3 <b>Simulation bankroll</b>\n"
    msg += f"   Mise : {stake:,}F \u2192 Gain potentiel : <b>{potential_win:,.0f}F</b>\n"
    msg += f"   Profit net : +{net_profit:,.0f}F\n\n"
    
    risk_level = "\U0001f7e2 CONTR\u00d4L\u00c9" if combined_prob >= 0.25 else "\U0001f7e1 MOD\u00c9R\u00c9" if combined_prob >= 0.15 else "\U0001f7e0 RISQU\u00c9"
    msg += f"\U0001f6e1\ufe0f Niveau de risque global : <b>{risk_level}</b>\n"
    msg += f"\u26a0\ufe0f <i>Combo \u00e0 risque contr\u00f4l\u00e9 \u2014 chaque s\u00e9lection \u2264 25% de risque.</i>\n"
    msg += "\u2501" * 37
    
    return msg


if __name__ == "__main__":
    candidates = analyze_matches()
    combo = build_combo(candidates)
    
    if combo:
        print(f"\n{'='*50}")
        print(f"COMBO S\u00c9LECTIONN\u00c9 : {len(combo)} matchs")
        combined_odds = 1
        for c in combo:
            combined_odds *= c["selOdds"]
        print(f"Cote combin\u00e9e : {combined_odds:.2f}")
        combined_prob = 1
        for c in combo:
            combined_prob *= c["bestProb"] / 100
        print(f"Prob. cumul\u00e9e : {combined_prob * 100:.1f}%")
        print(f"{'='*50}\n")
        
        msg = format_telegram_message(combo)
        print("\n=== MESSAGE TELEGRAM ===\n")
        print(msg)
        
        # Sauvegarder le message pour l'envoi
        with open("/home/z/my-project/scripts/combo_message.txt", "w") as f:
            f.write(msg)
        print("\n\u2705 Message sauvegard\u00e9 dans combo_message.txt")
    else:
        print("\u26a0\ufe0f Impossible de construire un combo valide")
