"""
Manual test: reproduce the exact ALL SPORTS palier analysis
and send via Telegram API (same as the cron)
"""
import json, urllib.request, subprocess
from datetime import datetime, timedelta

# ESPN Sport configs (same as cron)
SPORT_CONFIGS = [
    {'sport': 'NFL', 'emoji': '🏈', 'slug': 'football/nfl', 'hfa': 0.025},
    {'sport': 'MLB', 'emoji': '⚾', 'slug': 'baseball/mlb', 'hfa': 0.038},
    {'sport': 'NBA', 'emoji': '🏀', 'slug': 'basketball/nba', 'hfa': 0.032},
    {'sport': 'NHL', 'emoji': '🏒', 'slug': 'hockey/nhl', 'hfa': 0.035},
]

SKIP_STATUSES = ['STATUS_FULL_TIME', 'STATUS_IN_PROGRESS', 'STATUS_HALFTIME', 'STATUS_END_PERIOD']

def american_to_prob(odds_str):
    odds = int(odds_str)
    if odds > 0:
        return odds / (odds + 100)
    return 100 / (abs(odds) + 100)

def odds_to_decimal(odds_str):
    odds = int(odds_str)
    if odds < 0:
        return 100 / abs(odds)
    return 1 + odds / 100

def fetch_espn(slug, date_str):
    url = f"https://site.api.espn.com/apis/site/v2/sports/{slug}/scoreboard?dates={date_str}"
    result = subprocess.run(['curl', '-s', url], capture_output=True, text=True, timeout=20)
    if result.returncode != 0:
        return None
    try:
        return json.loads(result.stdout)
    except:
        return None

def analyze_event(event, sport_cfg):
    comp = event.get('competitions', [{}])[0]
    if not comp:
        return None
    
    status_type = comp.get('status', {}).get('type', {}).get('name', '')
    if status_type in SKIP_STATUSES:
        return None
    
    competitors = comp.get('competitors', [])
    home = away = None
    for c in competitors:
        name = c.get('team', {}).get('displayName', 'Unknown')
        if c.get('homeAway') == 'home':
            home = name
        else:
            away = name
    
    if not home or not away:
        return None
    
    # Extract moneyline
    home_odds = away_odds = None
    provider = 'Unknown'
    
    for prov_name in ['DraftKings', 'Caesars', 'FanDuel']:
        for o in comp.get('odds', []):
            if prov_name in o.get('provider', {}).get('name', ''):
                try:
                    home_odds = o['moneyline']['home']['close']['odds']
                    away_odds = o['moneyline']['away']['close']['odds']
                    provider = o.get('provider', {}).get('name', '')
                    break
                except:
                    continue
        if home_odds:
            break
    
    if not home_odds:
        for o in comp.get('odds', []):
            try:
                home_odds = o['moneyline']['home']['close']['odds']
                away_odds = o['moneyline']['away']['close']['odds']
                provider = o.get('provider', {}).get('name', 'Unknown')
                break
            except:
                continue
    
    if not home_odds or not away_odds:
        return None
    
    # Probabilities
    hi = american_to_prob(home_odds)
    ai = american_to_prob(away_odds)
    total = hi + ai
    if total == 0:
        return None
    
    hf = hi / total
    af = ai / total
    hfa = sport_cfg['hfa']
    
    hm = max(0.01, min(0.99, hf + hfa/2))
    am = max(0.01, min(0.99, af - hfa/2))
    
    if hm > am:
        fav = home; fav_odds = home_odds; fav_prob = hm; fav_implied = hi
    else:
        fav = away; fav_odds = away_odds; fav_prob = am; fav_implied = ai
    
    edge = (fav_prob - fav_implied) * 100
    
    if fav_prob >= 0.68:
        risk = 'SAFE'; emoji_risk = '🟢'
    elif fav_prob >= 0.60:
        risk = 'BON'; emoji_risk = '🟡'
    elif fav_prob >= 0.54:
        risk = 'MODÉRÉ'; emoji_risk = '🟠'
    else:
        risk = 'RISQUÉ'; emoji_risk = '🔴'
    
    match_time = ''
    try:
        dt = datetime.fromisoformat(event['date'].replace('Z', '+00:00'))
        match_time = dt.strftime('%H:%M UTC')
    except:
        pass
    
    return {
        'match': f"{away} @ {home}",
        'time': match_time,
        'sport': sport_cfg['sport'],
        'fav': fav,
        'fav_odds': fav_odds,
        'fav_prob': fav_prob * 100,
        'edge': edge,
        'risk': risk,
        'emoji': emoji_risk,
        'provider': provider,
    }

def main():
    today = datetime.utcnow()
    dates = []
    for d in range(3):
        dt = today + timedelta(days=d)
        dates.append(dt.strftime('%Y%m%d'))
    
    all_matches = []
    
    for sport_cfg in SPORT_CONFIGS:
        for date_str in dates:
            data = fetch_espn(sport_cfg['slug'], date_str)
            if not data:
                continue
            
            events = data.get('events', [])
            for event in events:
                result = analyze_event(event, sport_cfg)
                if result:
                    all_matches.append(result)
    
    # Sort by safety
    all_matches.sort(key=lambda x: (-x['fav_prob'], -x['edge']))
    
    # Print ranking
    print(f"=== {len(all_matches)} matchs avec cotes trouvés ===\n")
    for i, m in enumerate(all_matches[:15], 1):
        se = {'NFL': '🏈', 'MLB': '⚾', 'NBA': '🏀', 'NHL': '🏒'}.get(m['sport'], '⚡')
        print(f"#{i} {m['emoji']} {se} {m['match']}")
        print(f"    {m['time']} | {m['sport']}")
        print(f"    → {m['fav']} ({m['fav_odds']})")
        print(f"    Prob: {m['fav_prob']:.1f}% | Edge: {m['edge']:+.1f}% | {m['risk']}")
        print()
    
    if len(all_matches) < 2:
        print("Pas assez de matchs pour un combo.")
        return
    
    # Best combo
    pick1 = all_matches[0]
    pick2 = None
    for i in range(1, len(all_matches)):
        if all_matches[i]['sport'] != pick1['sport']:
            pick2 = all_matches[i]
            break
    if not pick2:
        pick2 = all_matches[1]
    
    combo_prob = (pick1['fav_prob']/100) * (pick2['fav_prob']/100) * 100
    combo_odds = odds_to_decimal(pick1['fav_odds']) * odds_to_decimal(pick2['fav_odds'])
    
    se1 = {'NFL': '🏈', 'MLB': '⚾', 'NBA': '🏀', 'NHL': '🏒'}.get(pick1['sport'], '⚡')
    se2 = {'NFL': '🏈', 'MLB': '⚾', 'NBA': '🏀', 'NHL': '🏒'}.get(pick2['sport'], '⚡')
    
    print("=" * 50)
    print("COMBO OPTIMAL DU JOUR")
    print(f"1. {se1} {pick1['fav']} ({pick1['fav_odds']}) → {pick1['fav_prob']:.1f}% [{pick1['sport']}]")
    print(f"2. {se2} {pick2['fav']} ({pick2['fav_odds']}) → {pick2['fav_prob']:.1f}% [{pick2['sport']}]")
    print(f"\nCombo cote: x{combo_odds:.2f}")
    print(f"Combo prob: {combo_prob:.1f}%")
    print(f"Mise 10,000F → {int(10000*combo_odds):,}F")
    print(f"Retrait 40%: {int(10000*combo_odds*0.4):,}F")
    
    # Build the EXACT Telegram message (same format as cron)
    sport_emoji = {'MLB': '⚾', 'NFL': '🏈', 'NBA': '🏀', 'NHL': '🏒'}
    
    msg = f"🎯 <b>PALIER INTELLIGENT - Tous Sports</b>\n"
    msg += f"📅 {today.strftime('%A %d/%m/%Y')}\n"
    msg += f"📊 {len(all_matches)} matchs analysés\n"
    msg += f"━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
    
    msg += f"🏆 <b>Classement par fiabilité:</b>\n\n"
    
    top = all_matches[:min(len(all_matches), 12)]
    for i, m in enumerate(top):
        se = sport_emoji.get(m['sport'], '⚡')
        msg += f"{i+1}. {m['emoji']} {se} <b>{m['match']}</b>\n"
        msg += f"   ⏰ {m['time']} | {m['sport']}\n"
        msg += f"   → {m['fav']} ({m['fav_odds']})\n"
        msg += f"   📈 {m['fav_prob']:.1f}% | Edge {m['edge']:+.1f}% | {m['risk']}\n\n"
    
    if combo_prob >= 45: palier = "🟢 EXCELLENT"
    elif combo_prob >= 38: palier = "🟡 BON"
    elif combo_prob >= 30: palier = "🟠 ACCEPTABLE"
    else: palier = "🔴 TROP RISQUÉ"
    
    msg += f"━━━━━━━━━━━━━━━━━━━━━━━━\n"
    msg += f"🎯 <b>COMBO OPTIMAL DU JOUR</b>\n\n"
    msg += f"1️⃣ {se1} {pick1['fav']} ({pick1['fav_odds']}) → {pick1['fav_prob']:.1f}% [{pick1['sport']}]\n"
    msg += f"2️⃣ {se2} {pick2['fav']} ({pick2['fav_odds']}) → {pick2['fav_prob']:.1f}% [{pick2['sport']}]\n"
    msg += f"\n╔══════════════════════════╗\n"
    msg += f"║  Cote combo: x{combo_odds:.2f}\n"
    msg += f"║  Probabilité: {combo_prob:.1f}%\n"
    msg += f"║  Niveau: {palier}\n"
    msg += f"╚══════════════════════════╝\n"
    
    gain = int(10000 * combo_odds)
    retrait = int(gain * 0.4)
    bankroll = gain - retrait
    
    msg += f"\n💰 <b>Simulation Montante</b>\n"
    msg += f"   Mise: 10 000F\n"
    msg += f"   Gain potentiel: {gain:,}F\n"
    msg += f"   Retrait 40% sécurisé: {retrait:,}F ✅\n"
    msg += f"   Bankroll palier suivant: {bankroll:,}F\n"
    
    print(f"\n\n{'='*50}")
    print(f"MESSAGE TELEGRAM ({len(msg)} chars):")
    print(f"{'='*50}")
    print(msg)
    
    # Save message for sending
    with open('/home/z/my-project/scripts/palier_msg.txt', 'w') as f:
        f.write(msg)
    print(f"\n✅ Message sauvé dans palier_msg.txt")

if __name__ == '__main__':
    main()
