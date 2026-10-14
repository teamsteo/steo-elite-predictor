#!/usr/bin/env python3
"""
Analyse approfondie de chaque match avec donnees reelles.
Pour MLB: records, win%, forme recente, probable pitchers, HFA.
Pour Football: cotes, stats disponibles.
Sortie: classement par fiabilite pour construire les combos quotidiens.
"""

import json
from datetime import datetime, timedelta

with open('/tmp/all_upcoming_matches.json', 'r') as f:
    matches = json.load(f)

print(f"Total matchs charges: {len(matches)}")

# ============================================
# MLB ANALYSIS FUNCTIONS
# ============================================

def parse_mlb_rec(rec_str):
    """Parse '58-62' into (wins, losses)"""
    try:
        parts = rec_str.split('-')
        return int(parts[0]), int(parts[1])
    except:
        return 0, 0

def calc_pythagorean(w, l, rs=None, ra=None):
    """Pythagorean expectation (simplified: use win% + regression)"""
    if (w + l) == 0:
        return 0.5
    return w / (w + l)

def mlb_hfa():
    """MLB home field advantage ~54%"""
    return 0.038

def ml_to_prob(ml):
    if ml is None: return None
    if ml > 0: return 100 / (ml + 100)
    else: return abs(ml) / (abs(ml) + 100)

def ml_to_decimal(ml):
    if ml is None: return 1.0
    if ml > 0: return 1 + (ml / 100)
    else: return 1 + (100 / abs(ml))

# ============================================
# ANALYZE ALL MLB MATCHES
# ============================================

mlb_picks = []

for m in matches:
    if m['sport'] != 'baseball':
        continue
    
    # Parse records
    aw, al = parse_mlb_rec(m.get('away_rec', ''))
    hw, hl = parse_mlb_rec(m.get('home_rec', ''))
    
    if (aw + al) == 0 or (hw + hl) == 0:
        continue  # Skip if no records
    
    away_wp = aw / (aw + al)
    home_wp = hw / (hw + hl)
    
    # Adjust for HFA
    hfa = mlb_hfa()
    adj_home = home_wp + hfa
    adj_away = away_wp - hfa
    total = adj_home + adj_away
    home_prob = adj_home / total
    away_prob = adj_away / total
    
    # Get odds
    home_ml = m.get('home_ml')
    away_ml = m.get('away_ml')
    home_imp = ml_to_prob(home_ml)
    away_imp = ml_to_prob(away_ml)
    
    # Calculate edges
    home_edge = (home_prob - home_imp) * 100 if home_imp else 0
    away_edge = (away_prob - away_imp) * 100 if away_imp else 0
    
    # Pick the side with best edge (minimum edge threshold of 0%)
    if home_edge >= away_edge and home_imp:
        pick = 'HOME'
        team = m['home']
        prob = home_prob
        edge = home_edge
        ml = home_ml
        imp = home_imp
        rec = m['home_rec']
        opp_rec = m['away_rec']
        wp = home_wp
        opp_wp = away_wp
        pitcher = m.get('home_pitcher', '')
    elif away_imp:
        pick = 'AWAY'
        team = m['away']
        prob = away_prob
        edge = away_edge
        ml = away_ml
        imp = away_imp
        rec = m['away_rec']
        opp_rec = m['home_rec']
        wp = away_wp
        opp_wp = home_wp
        pitcher = m.get('away_pitcher', '')
    else:
        continue  # No odds
    
    # Confidence levels
    if prob >= 0.60:
        confidence = 'HAUTE'
    elif prob >= 0.53:
        confidence = 'BONNE'
    elif prob >= 0.48:
        confidence = 'MOYENNE'
    else:
        confidence = 'FAIBLE'
    
    mlb_picks.append({
        'date': m['date'],
        'date_label': m['date_label'],
        'date_str': m['date_str'],
        'sport': 'baseball',
        'league': 'MLB',
        'emoji': '⚾',
        'match': f"{m['away']} @ {m['home']}",
        'home': m['home'],
        'away': m['away'],
        'pick': pick,
        'team': team,
        'prob': prob,
        'edge': edge,
        'ml': ml,
        'decimal': ml_to_decimal(ml),
        'implied': imp,
        'confidence': confidence,
        'rec': rec,
        'opp_rec': opp_rec,
        'wp': wp,
        'opp_wp': opp_wp,
        'pitcher': pitcher,
        'home_pitcher': m.get('home_pitcher', ''),
        'away_pitcher': m.get('away_pitcher', ''),
        'home_ml': home_ml,
        'away_ml': away_ml,
        'time_utc': m['date'],
    })

# ============================================
# FOOTBALL ANALYSIS
# ============================================

football_picks = []

for m in matches:
    if m['sport'] != 'football':
        continue
    
    home_ml = m.get('home_ml')
    away_ml = m.get('away_ml')
    home_imp = ml_to_prob(home_ml)
    away_imp = ml_to_prob(away_ml)
    
    # Football: draw is possible, so we need 3-way
    # Implied draw prob = 1 - home_imp - away_imp (approximate)
    # For now, pick the favorite
    if home_ml is None or away_ml is None:
        continue
    
    # In football, home advantage is stronger (~46% home win, 27% draw, 27% away)
    # If home is favorite (lower odds / negative ML)
    if home_ml < away_ml:
        pick = 'HOME'
        team = m['home']
        prob = home_imp * 1.05  # slight boost for HFA
        edge = (prob - home_imp) * 100
        ml = home_ml
    else:
        pick = 'AWAY'
        team = m['away']
        prob = away_imp
        edge = 0
        ml = away_ml
    
    confidence = 'MOYENNE'  # Football early season, no form data
    
    football_picks.append({
        'date': m['date'],
        'date_label': m['date_label'],
        'date_str': m['date_str'],
        'sport': 'football',
        'league': m.get('league', 'La Liga'),
        'emoji': '⚽',
        'match': f"{m['away']} @ {m['home']}",
        'home': m['home'],
        'away': m['away'],
        'pick': pick,
        'team': team,
        'prob': prob,
        'edge': edge,
        'ml': ml,
        'decimal': ml_to_decimal(ml),
        'implied': ml_to_prob(ml),
        'confidence': confidence,
        'rec': '',
        'opp_rec': '',
        'pitcher': '',
        'time_utc': m['date'],
    })

# ============================================
# MERGE AND RANK
# ============================================

all_picks = mlb_picks + football_picks

# Sort by date then by probability descending
all_picks.sort(key=lambda x: (x['date_str'], -x['prob']))

# ============================================
# PRINT DAILY BREAKDOWN
# ============================================

days = sorted(set(p['date_str'] for p in all_picks))

for day in days:
    day_picks = [p for p in all_picks if p['date_str'] == day]
    day_picks.sort(key=lambda x: x['prob'], reverse=True)
    
    day_label = day_picks[0]['date_label'] if day_picks else day
    print(f"\n{'='*110}")
    print(f"  {day_label} ({day}) — {len(day_picks)} picks analysés")
    print(f"{'='*110}")
    
    # Top picks (probability > 50%)
    top = [p for p in day_picks if p['prob'] >= 0.50]
    top.sort(key=lambda x: (x['prob'], x['edge']), reverse=True)
    
    print(f"\n  {'#':>2} | {'MATCH':<48} | {'PICK':<22} | {'ML':>5} | {'COTE':>6} | {'MODEL%':>7} | {'IMPL%':>6} | {'EDGE':>7} | {'CONF':>8} | {'PITCHEUR/INFO':<25}")
    print(f"  {'-'*2}-+-{'-'*48}-+-{'-'*22}-+-{'-'*5}-+-{'-'*6}-+-{'-'*7}-+-{'-'*6}-+-{'-'*7}-+-{'-'*8}-+-{'-'*25}")
    
    for i, p in enumerate(top):
        ml_str = f"{p['ml']:+d}" if p['ml'] else "N/A"
        edge_str = f"+{p['edge']:.1f}%" if p['edge'] > 0 else f"{p['edge']:.1f}%"
        
        # Time
        time_str = ""
        if p.get('time_utc'):
            try:
                dt = datetime.fromisoformat(p['time_utc'].replace('Z', '+00:00'))
                time_str = f"{dt.strftime('%H:%M')}"
            except:
                pass
        
        info = p.get('pitcher', '') or p.get('league', '')
        pick_label = f"{p['pick']}: {p['team']}"
        
        print(f"  {i+1:>2} | {time_str} {p['match']:<43} | {pick_label:<22} | {ml_str:>5} | {p['decimal']:>6.3f} | {p['prob']*100:>6.1f}% | {p['implied']*100:>5.1f}% | {edge_str:>7} | {p['confidence']:>8} | {info:<25}")
    
    if not top:
        print("  ⚠️ Aucun pick avec probabilite >= 50% ce jour")

# ============================================
# SAVE ALL PICKS FOR COMBO BUILDER
# ============================================

with open('/tmp/all_analyzed_picks.json', 'w') as f:
    json.dump(all_picks, f, indent=2, ensure_ascii=False, default=str)

print(f"\n\nTotal picks analyses: {len(all_picks)}")
print(f"MLB: {len(mlb_picks)} | Football: {len(football_picks)}")
print(f"Sauvegardes dans: /tmp/all_analyzed_picks.json")
