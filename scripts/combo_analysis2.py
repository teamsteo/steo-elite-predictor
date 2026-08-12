import json

with open('/tmp/mlb_today.json', 'r') as f:
    data = json.load(f)

# Navigate the ESPN JSON structure correctly
events = []
for league in data.get('leagues', []):
    for e in league.get('events', []):
        events.append(e)

if not events:
    # Try alternative structure
    events = data.get('events', [])

print(f"Found {len(events)} events")
print(f"Keys in data: {list(data.keys())[:10]}")

# Debug: print structure of first event
if events:
    e = events[0]
    print(f"\nFirst event keys: {list(e.keys())[:15]}")
    comp = e.get('competitions', [{}])[0]
    print(f"Competition keys: {list(comp.keys())[:15]}")
    
    odds_list = comp.get('odds', [])
    if odds_list:
        o = odds_list[0]
        print(f"Odds provider: {o.get('provider', {}).get('name')}")
        print(f"Odds details: {o.get('details')}")
        away_odds = o.get('awayTeamOdds', {})
        home_odds = o.get('homeTeamOdds', {})
        print(f"Away odds keys: {list(away_odds.keys())}")
        print(f"Home odds keys: {list(home_odds.keys())}")
        # Try different value keys
        for key in ['value', 'favorite', 'underdog', 'displayOdds', 'odds']:
            if key in away_odds:
                print(f"  awayTeamOdds.{key} = {away_odds[key]}")

results = []
for e in events:
    comp = e.get('competitions', [{}])[0]
    competitors = comp.get('competitors', [])
    home_c = next((c for c in competitors if c.get('homeAway') == 'home'), {})
    away_c = next((c for c in competitors if c.get('homeAway') == 'away'), {})
    
    away = away_c.get('team', {}).get('displayName', '???')
    home = home_c.get('team', {}).get('displayName', '???')
    
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
    
    # HFA
    hfa = 0.038
    model_home = home_wp + hfa
    model_away = away_wp - hfa
    total = model_home + model_away
    model_home_pct = model_home / total
    model_away_pct = model_away / total
    
    # Pitchers
    prob_pitchers = comp.get('probablePitchers', {})
    away_pitcher = prob_pitchers.get('away', {}).get('athlete', {}).get('displayName', 'TBD')
    home_pitcher = prob_pitchers.get('home', {}).get('athlete', {}).get('displayName', 'TBD')
    
    # Moneyline
    odds_list = comp.get('odds', [])
    away_ml = None
    home_ml = None
    
    if odds_list:
        o = odds_list[0]
        # moneyline might be a list of strings or dicts - skip it
        # Extract directly from awayTeamOdds / homeTeamOdds
        
        # If not found, try alternate extraction
        if away_ml is None:
            ao = o.get('awayTeamOdds', {})
            for key in ['value', 'displayValue', 'american']:
                if key in ao and ao[key] is not None:
                    away_ml = ao[key]
                    break
        
        if home_ml is None:
            ho = o.get('homeTeamOdds', {})
            for key in ['value', 'displayValue', 'american']:
                if key in ho and ho[key] is not None:
                    home_ml = ho[key]
                    break
    
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
    if ml > 0:
        return 100 / (ml + 100)
    else:
        return abs(ml) / (abs(ml) + 100)

def ml_to_decimal(ml):
    if ml is None: return 1.0
    if ml > 0:
        return 1 + (ml / 100)
    else:
        return 1 + (100 / abs(ml))

# Print raw data
print("\n" + "=" * 120)
print("DONNEES BRUTES ESPN - MLB 12 AOUT 2026")
print("=" * 120)
for r in results:
    away_imp = ml_to_prob(r['away_ml'])
    home_imp = ml_to_prob(r['home_ml'])
    home_edge = (r['model_home_pct'] - home_imp) * 100 if home_imp else 0
    away_edge = (r['model_away_pct'] - away_imp) * 100 if away_imp else 0
    
    print(f"{r['away']:<25} @ {r['home']:<25} | Away ML: {str(r['away_ml']):>6} | Home ML: {str(r['home_ml']):>6} | HEdge: {home_edge:+.1f}% | AEdge: {away_edge:+.1f}%")
