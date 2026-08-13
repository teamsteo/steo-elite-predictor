import json, urllib.request, sys, subprocess
from datetime import datetime, timedelta

HFA = 0.038

def fetch_espn(date_str):
    """Fetch via curl to avoid 403"""
    url = f"https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates={date_str}"
    result = subprocess.run(
        ['curl', '-s', url],
        capture_output=True, text=True, timeout=20
    )
    if result.returncode != 0:
        return None
    try:
        return json.loads(result.stdout)
    except:
        return None

def american_to_prob(odds_str):
    odds = int(odds_str)
    if odds > 0:
        return odds / (odds + 100)
    else:
        return 100 / (abs(odds) + 100)

def analyze_match(event):
    comp = event.get('competitions', [{}])[0]
    competitors = comp.get('competitors', [])
    
    home_team = away_team = None
    home_odds_str = away_odds_str = None
    provider_name = None
    
    for c in competitors:
        team_name = c.get('team', {}).get('displayName', 'Unknown')
        if c.get('homeAway') == 'home':
            home_team = team_name
        else:
            away_team = team_name
    
    odds_items = comp.get('odds', [])
    
    # Try Caesars first, then any
    for preferred in ['Caesars Sportsbook', 'DraftKings', 'FanDuel']:
        for o in odds_items:
            prov = o.get('provider', {}).get('name', '')
            if preferred in prov:
                try:
                    home_odds_str = o['moneyline']['home']['close']['odds']
                    away_odds_str = o['moneyline']['away']['close']['odds']
                    provider_name = prov
                    break
                except (KeyError, TypeError):
                    continue
        if home_odds_str:
            break
    
    if not home_odds_str:
        for o in odds_items:
            try:
                home_odds_str = o['moneyline']['home']['close']['odds']
                away_odds_str = o['moneyline']['away']['close']['odds']
                provider_name = o.get('provider', {}).get('name', 'Unknown')
                break
            except (KeyError, TypeError):
                continue
    
    if not home_odds_str or not away_odds_str:
        return None
    
    home_implied = american_to_prob(home_odds_str)
    away_implied = american_to_prob(away_odds_str)
    
    total_implied = home_implied + away_implied
    if total_implied == 0:
        return None
    
    # Remove vigorish
    home_fair = home_implied / total_implied
    away_fair = away_implied / total_implied
    
    # HFA adjustment
    home_model = home_fair + (HFA / 2)
    away_model = away_fair - (HFA / 2)
    home_model = max(0.01, min(0.99, home_model))
    away_model = max(0.01, min(0.99, away_model))
    
    # Edge
    home_edge = home_model - home_implied
    away_edge = away_model - away_implied
    
    # Pick favorite
    if home_model > away_model:
        fav = home_team
        fav_prob = home_model
        fav_implied = home_implied
        fav_odds = home_odds_str
        fav_edge = home_edge
    else:
        fav = away_team
        fav_prob = away_model
        fav_implied = away_implied
        fav_odds = away_odds_str
        fav_edge = away_edge
    
    # Run line check (extra data point)
    run_line = None
    for o in odds_items:
        try:
            rl = o.get('details', '')
            if rl and ('O/U' in rl or 'Over/Under' in rl or '-1.5' in rl or '+1.5' in rl):
                run_line = rl
                break
        except:
            continue
    
    return {
        'match': f"{away_team} @ {home_team}",
        'fav': fav,
        'fav_odds': fav_odds,
        'fav_prob': fav_prob,
        'fav_implied': fav_implied,
        'edge': fav_edge,
        'date': event.get('date', ''),
        'provider': provider_name,
    }

def main():
    base = datetime(2026, 8, 13)
    all_picks = []
    
    for day_offset in range(4):
        date = base + timedelta(days=day_offset)
        date_str = date.strftime('%Y%m%d')
        date_label = date.strftime('%d/%m/%Y')
        
        print(f"\n{'='*70}")
        print(f"  MLB - {date_label}")
        print(f"{'='*70}")
        
        data = fetch_espn(date_str)
        if not data:
            print("  Erreur de récupération des données")
            continue
        
        events = data.get('events', [])
        if not events:
            print("  Aucun match prévu")
            continue
        
        print(f"  {len(events)} matchs programmés\n")
        
        for event in events:
            result = analyze_match(event)
            if not result:
                # No odds
                name = event.get('name', 'Unknown')
                print(f"  ⚪ {name} - Pas de cotes disponibles")
                continue
            
            fav_prob = result['fav_prob'] * 100
            edge = result['edge'] * 100
            
            if fav_prob >= 65:
                risk = "SAFE"
                emoji = "🟢"
            elif fav_prob >= 58:
                risk = "MODÉRÉ"
                emoji = "🟡"
            elif fav_prob >= 53:
                risk = "ACCEPTABLE"
                emoji = "🟠"
            else:
                risk = "DANGEREUX"
                emoji = "🔴"
            
            match_time = ''
            try:
                dt = datetime.fromisoformat(result['date'].replace('Z', '+00:00'))
                match_time = dt.strftime('%H:%M')
            except:
                match_time = '??:??'
            
            print(f"  {emoji} {result['match']} ({match_time})")
            print(f"     Favori: {result['fav']} [{result['fav_odds']}]")
            print(f"     Prob. modèle: {fav_prob:.1f}% | Prob. implicite: {result['fav_implied']*100:.1f}%")
            print(f"     Edge: {edge:+.1f}% | Risque: {risk} | Source: {result['provider']}")
            
            all_picks.append({
                'date': date_label,
                'time': match_time,
                'match': result['match'],
                'fav': result['fav'],
                'fav_odds': result['fav_odds'],
                'fav_prob': fav_prob,
                'edge': edge,
                'risk': risk,
                'emoji': emoji,
            })
    
    # Sort by safety
    all_picks.sort(key=lambda x: (-x['fav_prob'], -x['edge']))
    
    print(f"\n\n{'='*70}")
    print("  CLASSEMENT GLOBAL PAR FIABILITÉ (Palier Intelligent)")
    print(f"{'='*70}")
    
    for i, pick in enumerate(all_picks[:20], 1):
        print(f"\n  #{i} | {pick['emoji']} {pick['date']} {pick['time']}")
        print(f"       {pick['match']}")
        print(f"       → {pick['fav']} ({pick['fav_odds']}) @ {pick['fav_prob']:.1f}%")
        print(f"       Edge: {pick['edge']:+.1f}% | Risque: {pick['risk']}")
    
    # Best combos per day
    print(f"\n\n{'='*70}")
    print("  COMBOS QUOTIDIENS OPTIMAUX (2 matchs - Stratégie Palier)")
    print(f"{'='*70}")
    
    for day_offset in range(4):
        date = base + timedelta(days=day_offset)
        date_label = date.strftime('%d/%m/%Y')
        
        day_picks = [p for p in all_picks if p['date'] == date_label]
        day_picks.sort(key=lambda x: (-x['fav_prob'], -x['edge']))
        
        if len(day_picks) < 2:
            continue
        
        pick1 = day_picks[0]
        pick2 = day_picks[1]
        
        combo_prob = (pick1['fav_prob'] / 100) * (pick2['fav_prob'] / 100) * 100
        
        o1 = int(pick1['fav_odds'].replace('+', ''))
        o2 = int(pick2['fav_odds'].replace('+', ''))
        if pick1['fav_odds'].startswith('-'):
            o1_dec = 100 / abs(o1)
        else:
            o1_dec = 1 + o1 / 100
        if pick2['fav_odds'].startswith('-'):
            o2_dec = 100 / abs(o2)
        else:
            o2_dec = 1 + o2 / 100
        
        combo_odds = o1_dec * o2_dec
        
        print(f"\n  📅 {date_label}")
        print(f"  ─────────────────────────────────")
        print(f"  Match 1: {pick1['fav']} ({pick1['fav_odds']}) → {pick1['fav_prob']:.1f}%")
        print(f"  Match 2: {pick2['fav']} ({pick2['fav_odds']}) → {pick2['fav_prob']:.1f}%")
        print(f"  ══════════════════════════════════")
        print(f"  Combo Cote: x{combo_odds:.2f}")
        print(f"  Combo Prob: {combo_prob:.1f}%")
        
        mise = 10000
        gain = int(mise * combo_odds)
        print(f"  Mise 10,000F → Gain: {gain:,}F")
        
        if combo_prob >= 42:
            palier = "🟢 EXCELLENT pour montante"
        elif combo_prob >= 35:
            palier = "🟡 BON pour montante"
        elif combo_prob >= 28:
            palier = "🟠 ACCEPTABLE"
        else:
            palier = "🔴 TROP RISQUÉ"
        
        print(f"  Recommandation: {palier}")
    
    # Palier simulation
    print(f"\n\n{'='*70}")
    print("  SIMULATION MONTANTE PALIER INTELLIGENT (10,000F → 2,000,000F)")
    print(f"{'='*70}")
    
    bankroll = 10000
    palier = 1
    total_retrait = 0
    mise_initiale = 10000
    
    for day_offset in range(4):
        date = base + timedelta(days=day_offset)
        date_label = date.strftime('%d/%m/%Y')
        
        day_picks = [p for p in all_picks if p['date'] == date_label]
        day_picks.sort(key=lambda x: (-x['fav_prob'], -x['edge']))
        
        if len(day_picks) < 2:
            continue
        
        pick1 = day_picks[0]
        pick2 = day_picks[1]
        
        o1 = int(pick1['fav_odds'].replace('+', ''))
        o2 = int(pick2['fav_odds'].replace('+', ''))
        if pick1['fav_odds'].startswith('-'):
            o1_dec = 100 / abs(o1)
        else:
            o1_dec = 1 + o1 / 100
        if pick2['fav_odds'].startswith('-'):
            o2_dec = 100 / abs(o2)
        else:
            o2_dec = 1 + o2 / 100
        
        combo_prob = (pick1['fav_prob'] / 100) * (pick2['fav_prob'] / 100)
        combo_odds = o1_dec * o2_dec
        
        mise = bankroll
        gain_potentiel = int(mise * combo_odds)
        
        # Palier withdrawal logic
        retrait_seuil = bankroll * 0.5  # Retirer 50% si gain
        
        print(f"\n  PALIER {palier} | {date_label}")
        print(f"  ─────────────────────────────────")
        print(f"  Bankroll: {bankroll:,}F")
        print(f"  Mise: {mise:,}F")
        print(f"  {pick1['fav']} ({pick1['fav_prob']:.1f}%) + {pick2['fav']} ({pick2['fav_prob']:.1f}%)")
        print(f"  Combo: {combo_prob*100:.1f}% @ x{combo_odds:.2f}")
        print(f"  Gain potentiel: {gain_potentiel:,}F")
        
        # If won
        bankroll_apres = int(gain_potentiel)
        retrait = int(bankroll_apres * 0.4)
        bankroll_restante = bankroll_apres - retrait
        total_retrait += retrait
        
        print(f"  SI GAGNÉ:")
        print(f"    Gain: {gain_potentiel:,}F")
        print(f"    Retrait 40%: {retrait:,}F (sécurisé)")
        print(f"    Bankroll suite: {bankroll_restante:,}F")
        
        bankroll = bankroll_restante
        palier += 1

if __name__ == '__main__':
    main()
