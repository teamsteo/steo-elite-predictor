#!/usr/bin/env python3
"""
Fetch detailed MLB odds for each day separately.
Also fetch pitcher info for all games.
"""

import json, subprocess
from datetime import datetime

def fetch_espn(url, timeout=8):
    try:
        r = subprocess.run(['curl', '-s', '--max-time', str(timeout), url],
                          capture_output=True, text=True, timeout=timeout+2)
        if r.returncode == 0 and r.stdout.strip():
            return json.loads(r.stdout)
    except:
        pass
    return None

def ml_to_prob(ml):
    if ml is None: return None
    if ml > 0: return 100 / (ml + 100)
    else: return abs(ml) / (abs(ml) + 100)

def ml_to_decimal(ml):
    if ml is None: return 1.0
    if ml > 0: return 1 + (ml / 100)
    else: return 1 + (100 / abs(ml))

def parse_rec(rec_str):
    try:
        parts = rec_str.split('-')
        return int(parts[0]), int(parts[1])
    except:
        return 0, 0

dates = ['20260813', '20260814', '20260815', '20260816', '20260817']
day_labels = {
    '20260813': 'Jeudi 13 aout',
    '20260814': 'Vendredi 14 aout',
    '20260815': 'Samedi 15 aout',
    '20260816': 'Dimanche 16 aout',
    '20260817': 'Lundi 17 aout',
}

all_picks = []

for date_str in dates:
    print(f"\n{'='*120}")
    print(f"  {day_labels[date_str]} ({date_str})")
    print(f"{'='*120}")
    
    # Fetch MLB
    data = fetch_espn(f'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates={date_str}')
    if not data:
        print("  ⚠️ MLB: pas de donnees")
        continue
    
    events = data.get('events', [])
    if not events:
        print("  ⚾ MLB: 0 matchs")
        continue
    
    print(f"  ⚾ MLB: {len(events)} matchs")
    
    day_good = 0
    
    for e in events:
        comp = e.get('competitions', [{}])[0]
        status = comp.get('status', {}).get('type', {}).get('name', '')
        if status in ('STATUS_IN_PROGRESS', 'STATUS_FULL_TIME', 'STATUS_FINAL'):
            continue
        
        competitors = comp.get('competitors', [])
        home_c = next((c for c in competitors if c.get('homeAway') == 'home'), {})
        away_c = next((c for c in competitors if c.get('homeAway') == 'away'), {})
        
        home = home_c.get('team', {}).get('displayName', '???')
        away = away_c.get('team', {}).get('displayName', '???')
        home_rec_str = home_c.get('records', [{}])[0].get('summary', '0-0')
        away_rec_str = away_c.get('records', [{}])[0].get('summary', '0-0')
        
        aw, al = parse_rec(away_rec_str)
        hw, hl = parse_rec(home_rec_str)
        away_wp = aw / (aw + al) if (aw + al) > 0 else 0.5
        home_wp = hw / (hw + hl) if (hw + hl) > 0 else 0.5
        
        # Pitchers
        pp = comp.get('probablePitchers', {})
        away_pitcher = pp.get('away', {}).get('athlete', {}).get('displayName', '')
        home_pitcher = pp.get('home', {}).get('athlete', {}).get('displayName', '')
        # Pitcher stats
        away_pitcher_stats = pp.get('away', {}).get('stats', [])
        home_pitcher_stats = pp.get('home', {}).get('stats', [])
        
        def get_pitcher_stat(stats_list, label):
            for s in stats_list:
                if s.get('label', '').startswith(label):
                    return s.get('displayValue', '')
            return ''
        
        away_pitcher_info = f"{away_pitcher}"
        if away_pitcher:
            era = get_pitcher_stat(away_pitcher_stats, 'ERA')
            if era:
                away_pitcher_info += f" (ERA {era})"
        
        home_pitcher_info = f"{home_pitcher}"
        if home_pitcher:
            era = get_pitcher_stat(home_pitcher_stats, 'ERA')
            if era:
                home_pitcher_info += f" (ERA {era})"
        
        # Odds
        odds_list = comp.get('odds', [])
        home_ml = None
        away_ml = None
        over_under = None
        
        if odds_list:
            o = odds_list[0]
            ml = o.get('moneyline', {})
            if ml and isinstance(ml, dict):
                try:
                    h_ml = ml.get('home', {}).get('close', {}).get('odds', '')
                    a_ml = ml.get('away', {}).get('close', {}).get('odds', '')
                    home_ml = int(h_ml) if h_ml else None
                    away_ml = int(a_ml) if a_ml else None
                except:
                    pass
            over_under = o.get('overUnder')
        
        # Model probabilities
        hfa = 0.038
        adj_home = home_wp + hfa
        adj_away = away_wp - hfa
        total = adj_home + adj_away
        home_prob = adj_home / total
        away_prob = adj_away / total
        
        home_imp = ml_to_prob(home_ml)
        away_imp = ml_to_prob(away_ml)
        home_edge = (home_prob - home_imp) * 100 if home_imp else 0
        away_edge = (away_prob - away_imp) * 100 if away_imp else 0
        
        # Time
        time_str = ''
        match_date = e.get('date', '')
        if match_date:
            try:
                dt = datetime.fromisoformat(match_date.replace('Z', '+00:00'))
                time_str = dt.strftime('%H:%M')
            except:
                pass
        
        # Determine best pick
        pick_side = None
        pick_prob = 0
        pick_edge = 0
        pick_ml = None
        
        # Only consider sides with probability >= 50%
        candidates = []
        if home_prob >= 0.50 and home_imp:
            candidates.append(('HOME', home, home_prob, home_edge, home_ml, home_imp))
        if away_prob >= 0.50 and away_imp:
            candidates.append(('AWAY', away, away_prob, away_edge, away_ml, away_imp))
        
        # Sort by edge descending (value), then by probability
        candidates.sort(key=lambda x: (x[3], x[2]), reverse=True)
        
        if not candidates:
            # Print anyway for reference
            if home_ml and away_ml:
                h_edge_str = f"{home_edge:+.1f}%" if home_imp else "N/A"
                a_edge_str = f"{away_edge:+.1f}%" if away_imp else "N/A"
                print(f"    {time_str} {away} ({away_rec_str}) @ {home} ({home_rec_str}) | HOME {home_ml:+d} ({home_prob*100:.1f}% {h_edge_str}) / AWAY {away_ml:+d} ({away_prob*100:.1f}% {a_edge_str}) | P: {home_pitcher_info} vs {away_pitcher_info}")
            continue
        
        pick_side, pick_team, pick_prob, pick_edge, pick_ml, pick_imp = candidates[0]
        
        confidence = 'HAUTE' if pick_prob >= 0.60 else 'BONNE' if pick_prob >= 0.53 else 'MOYENNE' if pick_prob >= 0.48 else 'FAIBLE'
        
        rec_str = f"({hw}-{hl})" if pick_side == 'HOME' else f"({aw}-{al})"
        opp_rec = f"({al}-{aw})" if pick_side == 'HOME' else f"({hl}-{hw})"
        wp = home_wp if pick_side == 'HOME' else away_wp
        opp_wp = away_wp if pick_side == 'HOME' else home_wp
        pitcher_info = home_pitcher_info if pick_side == 'HOME' else away_pitcher_info
        opp_pitcher_info = away_pitcher_info if pick_side == 'HOME' else home_pitcher_info
        
        edge_str = f"+{pick_edge:.1f}%" if pick_edge > 0 else f"{pick_edge:.1f}%"
        ml_str = f"{pick_ml:+d}" if pick_ml else "N/A"
        
        print(f"    {time_str} {away} ({away_rec_str}) @ {home} ({home_rec_str})")
        print(f"         → PICK: {pick_side}: {pick_team} | ML: {ml_str} = {ml_to_decimal(pick_ml):.3f} | Model: {pick_prob*100:.1f}% | Imp: {pick_imp*100:.1f}% | Edge: {edge_str} | {confidence}")
        print(f"         Pitcher: {pitcher_info} | vs: {opp_pitcher_info}")
        
        day_good += 1
        
        all_picks.append({
            'date_str': date_str,
            'date_label': day_labels[date_str],
            'time_utc': time_str,
            'sport': 'baseball',
            'league': 'MLB',
            'emoji': '⚾',
            'match': f"{away} @ {home}",
            'home': home,
            'away': away,
            'pick': pick_side,
            'team': pick_team,
            'prob': pick_prob,
            'edge': pick_edge,
            'ml': pick_ml,
            'decimal': ml_to_decimal(pick_ml),
            'implied': pick_imp,
            'confidence': confidence,
            'pitcher': pitcher_info,
            'opp_pitcher': opp_pitcher_info,
            'rec': rec_str,
            'opp_rec': opp_rec,
            'wp': wp,
            'opp_wp': opp_wp,
        })
    
    # Fetch La Liga for relevant dates
    liga_data = fetch_espn(f'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard?dates={date_str}')
    if liga_data:
        liga_events = liga_data.get('events', [])
        if liga_events:
            print(f"\n  ⚽ La Liga: {len(liga_events)} matchs")
            
            for e in liga_events:
                comp = e.get('competitions', [{}])[0]
                status = comp.get('status', {}).get('type', {}).get('name', '')
                if status in ('STATUS_IN_PROGRESS', 'STATUS_FULL_TIME', 'STATUS_FINAL'):
                    continue
                
                competitors = comp.get('competitors', [])
                home_c = next((c for c in competitors if c.get('homeAway') == 'home'), {})
                away_c = next((c for c in competitors if c.get('homeAway') == 'away'), {})
                
                home = home_c.get('team', {}).get('displayName', '???')
                away = away_c.get('team', {}).get('displayName', '???')
                
                odds_list = comp.get('odds', [])
                home_ml = None
                away_ml = None
                
                if odds_list:
                    o = odds_list[0]
                    ml = o.get('moneyline', {})
                    if ml and isinstance(ml, dict):
                        try:
                            h_ml = ml.get('home', {}).get('close', {}).get('odds', '')
                            a_ml = ml.get('away', {}).get('close', {}).get('odds', '')
                            home_ml = int(h_ml) if h_ml else None
                            away_ml = int(a_ml) if a_ml else None
                        except:
                            pass
                
                if home_ml and away_ml:
                    # Football 3-way: draw possibility reduces both side probabilities
                    home_imp = ml_to_prob(home_ml)
                    away_imp = ml_to_prob(away_ml)
                    
                    # Approximate: draw ~25% in La Liga opening, remaining split by odds
                    draw_imp = 1 - home_imp - away_imp
                    if draw_imp < 0.15:
                        draw_imp = 0.25  # default for early season
                    
                    # Rebalance: actual probability = implied * (1 - draw) approximately
                    home_prob_adj = home_imp / (home_imp + away_imp) * (1 - draw_imp)
                    away_prob_adj = away_imp / (home_imp + away_imp) * (1 - draw_imp)
                    
                    time_str = ''
                    match_date = e.get('date', '')
                    if match_date:
                        try:
                            dt = datetime.fromisoformat(match_date.replace('Z', '+00:00'))
                            time_str = dt.strftime('%H:%M')
                        except:
                            pass
                    
                    # Pick favorite
                    if home_ml < away_ml:
                        print(f"    {time_str} {away} @ {home} | HOME {home_ml:+d} | AWAY {away_ml:+d} | Draw ~{draw_imp*100:.0f}%")
                        print(f"         PICK: HOME: {home} | {ml_to_decimal(home_ml):.3f} | Prob ~{home_prob_adj*100:.1f}% (ajusté nul)")
                    else:
                        print(f"    {time_str} {away} @ {home} | HOME {home_ml:+d} | AWAY {away_ml:+d} | Draw ~{draw_imp*100:.0f}%")
                        print(f"         PICK: AWAY: {away} | {ml_to_decimal(away_ml):.3f} | Prob ~{away_prob_adj*100:.1f}% (ajusté nul)")
                    print(f"         ⚠️ La Liga jour 1 - pas de forme, risque eleve")

# Save
with open('/tmp/all_analyzed_picks.json', 'w') as f:
    json.dump(all_picks, f, indent=2, ensure_ascii=False, default=str)

print(f"\n{'='*120}")
print(f"  TOTAL PICKS ANALYSES: {len(all_picks)}")
print(f"{'='*120}")
