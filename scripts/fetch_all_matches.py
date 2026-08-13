#!/usr/bin/env python3
"""
Fetch ALL real upcoming matches from ESPN for next 5 days.
Sports: MLB, Soccer (top 5 leagues), Tennis (ATP/WTA), Basketball (any), Hockey (any)
"""

import json, subprocess, sys, os
from datetime import datetime, timedelta

ESPN_ENDPOINTS = {
    'MLB': {
        'url': 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates={date}',
        'sport': 'baseball',
        'emoji': '⚾',
    },
    'EPL': {
        'url': 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates={date}',
        'sport': 'football',
        'league': 'Premier League',
        'emoji': '⚽',
    },
    'LALIGA': {
        'url': 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard?dates={date}',
        'sport': 'football',
        'league': 'La Liga',
        'emoji': '⚽',
    },
    'SERIE_A': {
        'url': 'https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard?dates={date}',
        'sport': 'football',
        'league': 'Serie A',
        'emoji': '⚽',
    },
    'BUNDESLIGA': {
        'url': 'https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard?dates={date}',
        'sport': 'football',
        'league': 'Bundesliga',
        'emoji': '⚽',
    },
    'LIGUE1': {
        'url': 'https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard?dates={date}',
        'sport': 'football',
        'league': 'Ligue 1',
        'emoji': '⚽',
    },
    'ATP': {
        'url': 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp-tour/scoreboard?dates={date}',
        'sport': 'tennis',
        'league': 'ATP',
        'emoji': '🎾',
    },
    'WTA': {
        'url': 'https://site.api.espn.com/apis/site/v2/sports/tennis/wta-tour/scoreboard?dates={date}',
        'sport': 'tennis',
        'league': 'WTA',
        'emoji': '🎾',
    },
    'NBA': {
        'url': 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates={date}',
        'sport': 'basketball',
        'league': 'NBA',
        'emoji': '🏀',
    },
    'NHL': {
        'url': 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates={date}',
        'sport': 'hockey',
        'league': 'NHL',
        'emoji': '🏒',
    },
}

all_matches = []

# Generate dates for next 5 days (US ET for MLB, UTC for others)
base = datetime(2026, 8, 13)  # Today UTC
for day_offset in range(5):
    d = base + timedelta(days=day_offset)
    date_str = d.strftime('%Y%m%d')
    date_label = d.strftime('%A %d %B')
    
    print(f"\n{'='*80}")
    print(f"  Recherche matchs: {date_label} ({date_str})")
    print(f"{'='*80}")
    
    found_any = False
    
    for key, ep in ESPN_ENDPOINTS.items():
        url = ep['url'].format(date=date_str)
        try:
            result = subprocess.run(
                ['curl', '-s', '--max-time', '8', url],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode != 0 or not result.stdout.strip():
                continue
            
            data = json.loads(result.stdout)
            
            # Navigate events
            events = []
            for league in data.get('leagues', []):
                events.extend(league.get('events', []))
            events.extend(data.get('events', []))
            
            if not events:
                continue
            
            found_any = True
            print(f"  {ep['emoji']} {ep.get('league', key)}: {len(events)} match(s)")
            
            for e in events:
                comp = e.get('competitions', [{}])[0]
                competitors = comp.get('competitors', [])
                home_c = next((c for c in competitors if c.get('homeAway') == 'home'), {})
                away_c = next((c for c in competitors if c.get('homeAway') == 'away'), {})
                
                home = home_c.get('team', {}).get('displayName', '???')
                away = away_c.get('team', {}).get('displayName', '???')
                home_abbr = home_c.get('team', {}).get('abbreviation', '')
                away_abbr = away_c.get('team', {}).get('abbreviation', '')
                
                status = comp.get('status', {}).get('type', {}).get('name', 'STATUS_SCHEDULED')
                match_date = e.get('date', '')
                
                # Skip completed/in-progress
                if status in ('STATUS_IN_PROGRESS', 'STATUS_FULL_TIME', 'STATUS_FINAL', 'STATUS_POSTPONED'):
                    continue
                
                # Records
                home_rec = home_c.get('records', [{}])[0].get('summary', '')
                away_rec = away_c.get('records', [{}])[0].get('summary', '')
                
                # Odds
                odds_list = comp.get('odds', [])
                home_ml = None
                away_ml = None
                over_under = None
                spread = None
                
                if odds_list:
                    o = odds_list[0]
                    ml = o.get('moneyline', {})
                    if ml and isinstance(ml, dict):
                        try:
                            home_ml_str = ml.get('home', {}).get('close', {}).get('odds', '')
                            away_ml_str = ml.get('away', {}).get('close', {}).get('odds', '')
                            home_ml = int(home_ml_str) if home_ml_str else None
                            away_ml = int(away_ml_str) if away_ml_str else None
                        except (ValueError, TypeError, AttributeError):
                            pass
                    over_under = o.get('overUnder')
                    spread = o.get('spread')
                
                # Pitchers (MLB)
                pp = comp.get('probablePitchers', {})
                away_pitcher = pp.get('away', {}).get('athlete', {}).get('displayName', '')
                home_pitcher = pp.get('home', {}).get('athlete', {}).get('displayName', '')
                
                # Tennis specific
                tennis_info = {}
                if ep['sport'] == 'tennis':
                    # Tennis competitors have different structure
                    pass
                
                match_entry = {
                    'date': match_date,
                    'date_label': date_label,
                    'date_str': date_str,
                    'sport': ep['sport'],
                    'league': ep.get('league', key),
                    'emoji': ep['emoji'],
                    'home': home,
                    'away': away,
                    'home_abbr': home_abbr,
                    'away_abbr': away_abbr,
                    'home_rec': home_rec,
                    'away_rec': away_rec,
                    'home_ml': home_ml,
                    'away_ml': away_ml,
                    'over_under': over_under,
                    'spread': spread,
                    'home_pitcher': home_pitcher,
                    'away_pitcher': away_pitcher,
                    'status': status,
                }
                all_matches.append(match_entry)
                
                # Print summary
                ml_str = ""
                if home_ml is not None and away_ml is not None:
                    ml_str = f" | ML: HOME {home_ml:+d} / AWAY {away_ml:+d}"
                elif home_ml is not None:
                    ml_str = f" | ML: HOME {home_ml:+d}"
                
                rec_str = ""
                if home_rec or away_rec:
                    rec_str = f" | {away_rec} @ {home_rec}"
                
                time_str = ""
                if match_date:
                    try:
                        dt = datetime.fromisoformat(match_date.replace('Z', '+00:00'))
                        time_str = f" | {dt.strftime('%H:%M')} UTC"
                    except:
                        pass
                
                print(f"    → {away} @ {home}{time_str}{rec_str}{ml_str}")
                
        except subprocess.TimeoutExpired:
            continue
        except Exception as ex:
            continue
    
    if not found_any:
        print("  (aucun match trouve)")

# Save all matches to JSON
output_path = '/tmp/all_upcoming_matches.json'
with open(output_path, 'w') as f:
    json.dump(all_matches, f, indent=2, ensure_ascii=False)

print(f"\n{'='*80}")
print(f"  TOTAL: {len(all_matches)} matchs a venir sur 5 jours")
print(f"  Sauvegardes dans: {output_path}")
print(f"{'='*80}")

# Sport breakdown
from collections import Counter
sport_counts = Counter(m['sport'] for m in all_matches)
print("\nPar sport:")
for sport, count in sport_counts.most_common():
    print(f"  {sport}: {count} matchs")
