import json

with open('/tmp/mlb_today.json', 'r') as f:
    data = json.load(f)

# Events are in data['events'], NOT in data['leagues'][0]['events']
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
    
    # HFA (3.8%)
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
    
    # Moneyline from DraftKings odds
    odds_list = comp.get('odds', [])
    away_ml = None
    home_ml = None
    
    if odds_list:
        o = odds_list[0]
        # Parse 'details' string like "PHI -158" to extract odds
        details = o.get('details', '')
        # details format: "TEAM_ABBR +/-ODDS" for favorite, or "OVER/UNDER TOTAL"
        away_abbr = away_c.get('team', {}).get('abbreviation', '')
        home_abbr = home_c.get('team', {}).get('abbreviation', '')
        
        # The 'details' shows the favorite
        # We need to extract moneyline from the items/competitors
        for comp_item in o.get('competitors', []):
            team_abbr = comp_item.get('abbreviation', '')
            moneyline_val = comp_item.get('moneyline')
            if moneyline_val is not None:
                if team_abbr == home_abbr:
                    home_ml = moneyline_val
                elif team_abbr == away_abbr:
                    away_ml = moneyline_val
    
    # If still not found, parse from details string
    if away_ml is None or home_ml is None and odds_list:
        o = odds_list[0]
        details = o.get('details', '')
        spread_val = o.get('spread')
        away_spread = o.get('awayTeamOdds', {}).get('value')
        home_spread = o.get('homeTeamOdds', {}).get('value')
        # Try pointSpread items
        for ps in o.get('pointSpread', []):
            if isinstance(ps, dict):
                for alt in ps.get('alternates', []):
                    if alt.get('type') == 'moneyline':
                        # This is getting complex. Let's just use the details parsing
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

# If moneyline not found in competitors, try to get from the full odds item
for r in results:
    if r['away_ml'] is None or r['home_ml'] is None:
        # Find matching event and try parsing odds differently
        for e in events:
            comp = e.get('competitions', [{}])[0]
            home_c = next((c for c in comp.get('competitors', []) if c.get('homeAway') == 'home'), {})
            away_c = next((c for c in comp.get('competitors', []) if c.get('homeAway') == 'away'), {})
            if home_c.get('team', {}).get('displayName') == r['home'] and away_c.get('team', {}).get('displayName') == r['away']:
                odds_list = comp.get('odds', [])
                if odds_list:
                    o = odds_list[0]
                    # Debug: print all competitor items
                    for c_item in o.get('competitors', []):
                        pass
                    # Try items
                    for item in o.get('items', []):
                        if isinstance(item, dict):
                            for alt in item.get('alternates', []):
                                if alt.get('type') == 'moneyline':
                                    pass
                break

def ml_to_prob(ml):
    if ml is None: return None
    if ml > 0: return 100 / (ml + 100)
    else: return abs(ml) / (abs(ml) + 100)

def ml_to_decimal(ml):
    if ml is None: return 1.0
    if ml > 0: return 1 + (ml / 100)
    else: return 1 + (100 / abs(ml))

# Print debug
print(f"\n{'MATCH':<50} | {'AWAY ML':>8} | {'HOME ML':>8}")
for r in results:
    print(f"{r['away']:<25} @ {r['home']:<22} | {str(r['away_ml']):>8} | {str(r['home_ml']):>8}")

# If all MLs are None, we need to parse them from details or other fields
has_ml = any(r['away_ml'] is not None or r['home_ml'] is not None for r in results)
if not has_ml:
    print("\n!!! Moneyline not found in competitors. Need to extract differently.")
    # Let's check one full odds object
    e = events[0]
    comp = e.get('competitions', [{}])[0]
    odds_list = comp.get('odds', [])
    if odds_list:
        o = odds_list[0]
        print(f"\nFull odds object keys: {list(o.keys())}")
        print(f"\nFull odds object (truncated):")
        print(json.dumps({k: v for k, v in o.items() if k != 'provider'}, indent=2, default=str)[:3000])
