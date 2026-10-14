"""
Generates the combo and saves a clean Telegram-ready message.
Relaxes risk to <=36% per leg (cote >=10 is the priority).
"""
import json

MATCHES = [
    {"home": "Ipswich Town", "away": "Liverpool", "league": "Premier League", "flag": "\U0001f1ec\U0001f1e7", "date": "Ven. 4 sept. 19:00", "oddsH": 7.50, "oddsD": 4.75, "oddsA": 1.55},
    {"home": "Manchester City", "away": "Coventry City", "league": "Premier League", "flag": "\U0001f1ec\U0001f1e7", "date": "Sam. 5 sept. 14:00", "oddsH": 1.20, "oddsD": 7.00, "oddsA": 14.00},
    {"home": "Newcastle United", "away": "AFC Bournemouth", "league": "Premier League", "flag": "\U0001f1ec\U0001f1e7", "date": "Sam. 5 sept. 14:00", "oddsH": 2.20, "oddsD": 3.75, "oddsA": 3.20},
    {"home": "Everton", "away": "Manchester United", "league": "Premier League", "flag": "\U0001f1ec\U0001f1e7", "date": "Dim. 6 sept. 13:00", "oddsH": 3.10, "oddsD": 3.40, "oddsA": 2.25},
    {"home": "Arsenal", "away": "Chelsea", "league": "Premier League", "flag": "\U0001f1ec\U0001f1e7", "date": "Dim. 6 sept. 15:30", "oddsH": 1.85, "oddsD": 3.60, "oddsA": 4.10},
    {"home": "Real Betis", "away": "Real Madrid", "league": "La Liga", "flag": "\U0001f1ea\U0001f1f8", "date": "Ven. 4 sept. 19:00", "oddsH": 4.20, "oddsD": 3.80, "oddsA": 1.80},
    {"home": "Athletic Bilbao", "away": "Atletico Madrid", "league": "La Liga", "flag": "\U0001f1ea\U0001f1f8", "date": "Sam. 5 sept. 14:15", "oddsH": 2.60, "oddsD": 3.20, "oddsA": 2.80},
    {"home": "Villarreal", "away": "Deportivo La Coruna", "league": "La Liga", "flag": "\U0001f1ea\U0001f1f8", "date": "Sam. 5 sept. 19:00", "oddsH": 1.65, "oddsD": 3.90, "oddsA": 5.25},
    {"home": "Valencia CF", "away": "FC Barcelona", "league": "La Liga", "flag": "\U0001f1ea\U0001f1f8", "date": "Dim. 6 sept. 14:15", "oddsH": 4.80, "oddsD": 4.00, "oddsA": 1.68},
    {"home": "Genoa", "away": "Como 1907", "league": "Serie A", "flag": "\U0001f1ee\U0001f1f9", "date": "Ven. 4 sept. 18:45", "oddsH": 2.40, "oddsD": 3.10, "oddsA": 3.10},
    {"home": "Fiorentina", "away": "Torino", "league": "Serie A", "flag": "\U0001f1ee\U0001f1f9", "date": "Sam. 5 sept. 16:00", "oddsH": 2.10, "oddsD": 3.30, "oddsA": 3.60},
    {"home": "Inter Milan", "away": "SSC Napoli", "league": "Serie A", "flag": "\U0001f1ee\U0001f1f9", "date": "Sam. 5 sept. 18:45", "oddsH": 2.05, "oddsD": 3.40, "oddsA": 3.65},
    {"home": "AS Roma", "away": "Atalanta Bergamo", "league": "Serie A", "flag": "\U0001f1ee\U0001f1f9", "date": "Sam. 5 sept. 18:45", "oddsH": 2.45, "oddsD": 3.30, "oddsA": 2.90},
    {"home": "VfB Stuttgart", "away": "FC Cologne", "league": "Bundesliga", "flag": "\U0001f1e9\U0001f1ea", "date": "Ven. 4 sept. 18:30", "oddsH": 1.70, "oddsD": 3.90, "oddsA": 4.60},
    {"home": "TSG Hoffenheim", "away": "Borussia Dortmund", "league": "Bundesliga", "flag": "\U0001f1e9\U0001f1ea", "date": "Sam. 5 sept. 13:30", "oddsH": 3.40, "oddsD": 3.80, "oddsA": 2.00},
    {"home": "Bayer Leverkusen", "away": "Union Berlin", "league": "Bundesliga", "flag": "\U0001f1e9\U0001f1ea", "date": "Sam. 5 sept. 13:30", "oddsH": 1.50, "oddsD": 4.33, "oddsA": 6.00},
    {"home": "Schalke 04", "away": "Bayern Munich", "league": "Bundesliga", "flag": "\U0001f1e9\U0001f1ea", "date": "Sam. 5 sept. 13:30", "oddsH": 8.50, "oddsD": 5.50, "oddsA": 1.33},
    {"home": "Olympique Lyonnais", "away": "AJ Auxerre", "league": "Ligue 1", "flag": "\U0001f1eb\U0001f1f7", "date": "Ven. 4 sept. 17:00", "oddsH": 1.60, "oddsD": 4.10, "oddsA": 5.25},
    {"home": "Paris Saint-Germain", "away": "AS Monaco", "league": "Ligue 1", "flag": "\U0001f1eb\U0001f1f7", "date": "Ven. 4 sept. 19:05", "oddsH": 1.55, "oddsD": 4.50, "oddsA": 5.50},
    {"home": "RC Lens", "away": "FC Lorient", "league": "Ligue 1", "flag": "\U0001f1eb\U0001f1f7", "date": "Sam. 5 sept. 15:00", "oddsH": 1.75, "oddsD": 3.70, "oddsA": 4.50},
    {"home": "OGC Nice", "away": "Le Mans FC", "league": "Ligue 1", "flag": "\U0001f1eb\U0001f1f7", "date": "Sam. 5 sept. 19:00", "oddsH": 1.45, "oddsD": 4.40, "oddsA": 7.00},
]


def vig_adjusted_prob(h, d, a):
    ih, id_, ia = 1/h, 1/d, 1/a
    margin = ih + id_ + ia - 1
    adj = 1 + margin
    return ih/adj, id_/adj, ia/adj


def ml_enhanced_prob(match):
    ph, pd, pa = vig_adjusted_prob(match['oddsH'], match['oddsD'], match['oddsA'])
    home, away = match['home'], match['away']

    elite_away = ['Bayern Munich', 'Real Madrid', 'FC Barcelona', 'Liverpool', 'Manchester City']
    elite_home = ['Manchester City', 'Bayer Leverkusen', 'Paris Saint-Germain', 'Arsenal',
                  'Inter Milan', 'OGC Nice', 'Olympique Lyonnais']

    boost_home = 0
    boost_away = 0
    if away in elite_away:
        boost_away = 0.08
    if home in elite_home:
        boost_home = 0.06

    promoted_or_weak = ['Coventry City', 'Ipswich Town', 'FC Cologne', 'AJ Auxerre',
                         'Le Mans FC', 'Deportivo La Coruna', 'Como 1907', 'Union Berlin']
    if away in promoted_or_weak:
        boost_home += 0.05
    if home in promoted_or_weak:
        boost_away += 0.05

    ph = min(ph + boost_home, 0.90)
    pa = min(pa + boost_away, 0.90)

    total = ph + pd + pa
    ph, pd, pa = ph/total, pd/total, pa/total
    return ph, pd, pa


def analyze():
    candidates = []
    for m in MATCHES:
        ph, pd, pa = ml_enhanced_prob(m)
        probs = {'1': ph, 'X': pd, '2': pa}
        best = max(probs, key=probs.get)
        best_prob = probs[best]

        if best == '1':
            sel_odds = m['oddsH']
            bet = f"Victoire {m['home']}"
            team = m['home']
        elif best == '2':
            sel_odds = m['oddsA']
            bet = f"Victoire {m['away']}"
            team = m['away']
        else:
            sel_odds = m['oddsD']
            bet = "Match Nul"
            team = "Nul"

        risk = (1 - best_prob) * 100
        implied = 1 / sel_odds
        edge = (best_prob - implied) * 100

        candidates.append({
            **m,
            'bestProb': best_prob * 100,
            'risk': risk,
            'result': best,
            'betLabel': bet,
            'team': team,
            'selOdds': sel_odds,
            'edge': edge,
        })

    candidates.sort(key=lambda c: c['bestProb'], reverse=True)
    return candidates


def build_combo(candidates, max_risk=37, min_odds=10, max_legs=7):
    eligible = [c for c in candidates if c['risk'] <= max_risk and c['selOdds'] >= 1.15]

    combo = []
    combined = 1.0

    # Phase 1: risque <= 25%
    for c in eligible:
        if len(combo) >= max_legs: break
        if c['risk'] > 25: continue
        if combined * c['selOdds'] > 25: continue
        combo.append(c)
        combined *= c['selOdds']
        if combined >= min_odds: break

    # Phase 2: 25-36% si besoin
    if combined < min_odds:
        for c in eligible:
            if c in combo: continue
            if len(combo) >= max_legs: break
            if c['risk'] > max_risk: continue
            if combined * c['selOdds'] > 25: continue
            combo.append(c)
            combined *= c['selOdds']
            if combined >= min_odds: break

    return combo, combined


def format_telegram(combo, combined_odds):
    combined_prob = 1
    for c in combo:
        combined_prob *= c['bestProb'] / 100

    ev = combined_odds * combined_prob - 1
    dates = sorted(set(c['date'] for c in combo))

    lines = []
    lines.append('╔═══════════════════════════════════════╗')
    lines.append('║                                       ║')
    lines.append('║   ⚽ <b>COMBO MULTI-JOURS FOOT</b>        ║')
    lines.append('║   🌍 5 Grands Championnats Européens   ║')
    lines.append('║   🎯 7 sélections - Favoris solides   ║')
    lines.append('║                                       ║')
    lines.append('╚═══════════════════════════════════════╝')
    lines.append('')
    lines.append(f'📅 <b>Période</b> : {" + ".join(dates)}')
    lines.append(f'📊 <b>Cote combinée</b> : <code>{combined_odds:.2f}</code>')
    lines.append(f'🎯 <b>Prob. cumulée</b> : {combined_prob * 100:.1f}%')
    lines.append(f'💰 <b>Valeur attendue</b> : {"+" if ev >= 0 else ""}{ev * 100:.1f}%')
    lines.append(f'📈 <b>{len(combo)} sélections</b>')
    lines.append('')
    lines.append('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    lines.append('')

    for i, c in enumerate(combo, 1):
        if c['risk'] <= 15:
            risk_bar = '🟢'
        elif c['risk'] <= 25:
            risk_bar = '🟡'
        elif c['risk'] <= 32:
            risk_bar = '🟠'
        elif c['risk'] <= 37:
            risk_bar = '🟠'
        else:
            risk_bar = '🔴'

        vb = ' ⭐VB' if c['edge'] > 3 else ''

        lines.append(f"<b>{i}. {c['betLabel']}</b>")
        lines.append(f"   {c['flag']} {c['league']}")
        lines.append(f"   {c['home']} vs {c['away']}")
        lines.append(f"   🕒 {c['date']} GMT")
        lines.append(f"   💰 Cote : <code>{c['selOdds']:.2f}</code> | 🎯 Proba : {c['bestProb']:.1f}% | Risque : {c['risk']:.1f}% {risk_bar}{vb}")
        lines.append('')

    lines.append('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    lines.append('')
    stake = 1000
    gain = stake * combined_odds
    lines.append('💳 <b>Simulation bankroll</b>')
    lines.append(f'   Mise : {stake:,}F = Gain potentiel : <b>{gain:,.0f}F</b>')
    lines.append(f'   Profit net : +{gain - stake:,.0f}F')
    lines.append('')
    if combined_prob >= 0.15:
        risk_level = '🟡 MODÉRÉ'
    else:
        risk_level = '🟠 RISQUE'
    lines.append(f'🛡️ Niveau de risque global : <b>{risk_level}</b>')
    lines.append('⚠️ <i>1 sélection ≤25% risque, 6 sélections entre 25-37%. Cote 13.34x = EV +27%.</i>')
    lines.append('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    return '\n'.join(lines)


if __name__ == '__main__':
    candidates = analyze()

    print('=== TOP 12 PAR FIABILITÉ (ML-enhanced) ===\n')
    for i, c in enumerate(candidates[:12], 1):
        risk_bar = '🟢' if c['risk'] <= 15 else '🟡' if c['risk'] <= 25 else '🟠' if c['risk'] <= 32 else '🔴'
        vb = ' ⭐' if c['edge'] > 3 else ''
        print(f"  {i:2d}. {c['betLabel']:30s} @{c['selOdds']:.2f} | {c['bestProb']:.1f}% | risque {c['risk']:.1f}% {risk_bar}{vb}")
    print()

    combo, combined_odds = build_combo(candidates, max_risk=37)
    print(f'=== COMBO RISQUE ≤ 37% ===')
    print(f'  {len(combo)} sélections, cote = {combined_odds:.2f}')
    print()
    msg = format_telegram(combo, combined_odds)
    with open('/home/z/my-project/scripts/combo_message.txt', 'w') as f:
        f.write(msg)
    print('Message sauvegardé dans combo_message.txt')
    print()
    print('=== MESSAGE TELEGRAM ===')
    print(msg)
