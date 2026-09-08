#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
mlb_analysis_tonight.py — Analyse fine de la carte MLB du soir + combiné low/medium

Sources :
  - MLB StatsAPI : schedule (lanceurs probables), stats saison lanceurs,
    standings (L10, run differential, streak)
  - ESPN web API (site.web.api.espn.com) : cotes moneyline DraftKings

Modèle :
  p_market = ML de-vig (2 issues, MLB sans nul)
  + ajustements plafonnés (perspective domicile) :
      lanceurs : clamp((ERA_adv - ERA_domicile) * 1.0pp, ±4pp)   [IP >= 40 requis]
      L10      : clamp((wpct_L10_dom - wpct_L10_ext) * 15pp, ±3pp)
      saison   : clamp((RD/jeu_dom - RD/jeu_ext) * 4pp, ±2pp)
  → p_model (clamp 0.15-0.92), risque = 1 - p_model, edge vs marché

Combiné (règle Palier) :
  LOW    : 2 jambes, chaque jambe risque ≤ 30% (p_model ≥ 0.70)
  MEDIUM : 3e jambe si risque ≤ 32% (signalée si dépassement du plafond 30%)

Usage : python3 mlb_analysis_tonight.py [YYYYMMDD]   (défaut : date du jour)
Cache : scripts/mlb_env/cache_YYYYMMDD_*.json
"""

import json
import os
import sys
import urllib.request
from datetime import date

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mlb_env')
MLB = 'https://statsapi.mlb.com/api/v1'
ESPN = 'https://site.web.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard'

# Mapping abbr MLB StatsAPI -> ESPN
ABBR_MAP = {'AZ': 'ARI', 'CWS': 'CHW', 'ATH': 'ATH', 'OAK': 'ATH'}


def fetch_json(url, cache_name, ttl_hours=2):
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache_path = os.path.join(CACHE_DIR, cache_name)
    if os.path.exists(cache_path):
        import time
        if time.time() - os.path.getmtime(cache_path) < ttl_hours * 3600:
            with open(cache_path) as f:
                return json.load(f)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=25) as r:
        data = json.loads(r.read().decode())
    with open(cache_path, 'w') as f:
        json.dump(data, f)
    return data


def american_to_decimal(am):
    """'-345' -> 1.290 ; '+270' -> 3.70 ; '+100' -> 2.00"""
    try:
        v = int(str(am).replace('+', ''))
    except (ValueError, TypeError):
        return None
    if v == 0:
        return None
    # Favori négatif : 1 + 100/|v| ; outsider positif : 1 + v/100
    return round(1 + (v / 100 if v > 0 else 100 / abs(v)), 4)


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


# ============================================================
# COLLECTE
# ============================================================

def get_day(dstr):
    """Schedule MLB + teams abbr + stats lanceurs + standings + cotes ESPN."""
    # 1. Schedule + probables
    sched = fetch_json(
        f'{MLB}/schedule?sportId=1&date={dstr[:4]}-{dstr[4:6]}-{dstr[6:]}&hydrate=probablePitcher',
        f'cache_{dstr}_schedule.json', ttl_hours=1)
    games_raw = sched.get('dates', [{}])[0].get('games', [])

    # 2. Abbr par team id
    teams = fetch_json(f'{MLB}/teams?sportId=1&season=2026', 'cache_teams_2026.json', ttl_hours=720)
    abbr_by_id = {t['id']: t.get('abbreviation', '') for t in teams['teams']}

    # 3. Standings (L10, run diff, streak)
    standings = fetch_json(
        f'{MLB}/standings?leagueId=103,104&season=2026&standingsTypes=regularSeason',
        f'cache_{dstr}_standings.json', ttl_hours=6)
    team_stats = {}
    for div in standings.get('records', []):
        for tr in div.get('teamRecords', []):
            l10 = next((s for s in tr.get('records', {}).get('splitRecords', [])
                        if s.get('type') == 'lastTen'), None)
            games_played = tr['wins'] + tr['losses']
            team_stats[tr['team']['id']] = {
                'w': tr['wins'], 'l': tr['losses'],
                'l10_w': l10['wins'] if l10 else 5, 'l10_l': l10['losses'] if l10 else 5,
                'rd': tr.get('runDifferential', 0),
                'rd_per_g': tr.get('runDifferential', 0) / max(1, games_played),
                'streak': tr.get('streak', {}).get('streakCode', '?'),
            }

    # 4. Stats saison lanceurs probables
    pitchers = {}
    for g in games_raw:
        for side in ('home', 'away'):
            pp = g['teams'][side].get('probablePitcher')
            if pp and pp['id'] not in pitchers:
                try:
                    st = fetch_json(
                        f"{MLB}/people/{pp['id']}/stats?stats=season&group=pitching&season=2026",
                        f"cache_pitcher_{pp['id']}.json", ttl_hours=12)
                    splits = st.get('stats', [{}])[0].get('splits', [])
                    if splits:
                        s = splits[0]['stat']
                        ip = float(s.get('inningsPitched', 0) or 0)
                        pitchers[pp['id']] = {
                            'name': pp['fullName'],
                            'era': float(s['era']) if s.get('era') else None,
                            'whip': float(s['whip']) if s.get('whip') else None,
                            'k9': float(s.get('strikeoutsPer9Inn') or 0),
                            'ip': ip,
                            'usable': ip >= 40,
                        }
                except Exception as e:
                    pitchers[pp['id']] = {'name': pp['fullName'], 'era': None, 'whip': None,
                                          'k9': None, 'ip': 0, 'usable': False, 'err': str(e)}

    # 5. Cotes ESPN
    espn = fetch_json(f'{ESPN}?date={dstr}', f'cache_{dstr}_espn.json', ttl_hours=0.5)
    odds_by_abbr = {}
    status_by_abbr = {}
    start_by_abbr = {}
    for ev in espn.get('events', []):
        comp = ev['competitions'][0]
        odds_obj = comp.get('odds', [{}])[0] if comp.get('odds') else {}
        ml = odds_obj.get('moneyline', {})
        teams_ = {c['homeAway']: c['team']['abbreviation'] for c in comp['competitors']}
        h_ab, a_ab = teams_['home'], teams_['away']
        def ml_side(side):
            node = ml.get(side, {})
            node = node.get('current') or node.get('close') or {}
            return node.get('odds') if isinstance(node, dict) else node
        dec_h = american_to_decimal(ml_side('home'))
        dec_a = american_to_decimal(ml_side('away'))
        if dec_h and dec_a:
            odds_by_abbr[h_ab] = dec_h
            odds_by_abbr[a_ab] = dec_a
        st = ev['status']['type']['state']
        det = ev['status']['type'].get('shortDetail', '')
        start = ev.get('date', '')
        for ab in (h_ab, a_ab):
            status_by_abbr[ab] = (st, det)
            start_by_abbr[ab] = start

    # 6. Assemblage
    games = []
    for g in games_raw:
        ht, at = g['teams']['home'], g['teams']['away']
        h_id, a_id = ht['team']['id'], at['team']['id']
        h_ab = ABBR_MAP.get(abbr_by_id.get(h_id, ''), abbr_by_id.get(h_id, ''))
        a_ab = ABBR_MAP.get(abbr_by_id.get(a_id, ''), abbr_by_id.get(a_id, ''))
        dec_h = odds_by_abbr.get(h_ab)
        dec_a = odds_by_abbr.get(a_ab)
        hs, as_ = team_stats.get(h_id, {}), team_stats.get(a_id, {})
        hp = ht.get('probablePitcher', {})
        ap = at.get('probablePitcher', {})
        games.append({
            'gamePk': g['gamePk'],
            'h_ab': h_ab, 'a_ab': a_ab,
            'h_name': ht['team']['name'], 'a_name': at['team']['name'],
            'dec_h': dec_h, 'dec_a': dec_a,
            'h_pitcher': pitchers.get(hp.get('id'), {'name': hp.get('fullName', '?'), 'usable': False}),
            'a_pitcher': pitchers.get(ap.get('id'), {'name': ap.get('fullName', '?'), 'usable': False}),
            'h_stats': hs, 'a_stats': as_,
            'status': status_by_abbr.get(h_ab, ('?', '?')),
            'start_utc': start_by_abbr.get(h_ab, '?'),
        })
    return games


# ============================================================
# MODÈLE
# ============================================================

def analyze(games):
    results = []
    for g in games:
        if not g['dec_h'] or not g['dec_a']:
            results.append({**g, 'p_h': None, 'note': 'cotes indisponibles'})
            continue
        # De-vig
        ih, ia = 1 / g['dec_h'], 1 / g['dec_a']
        p_h = ih / (ih + ia)
        p_mkt_h = p_h
        adj_p, adj_l, adj_s = 0.0, 0.0, 0.0
        flags = []
        # Lanceurs (IP >= 40 chacun)
        hp, ap = g['h_pitcher'], g['a_pitcher']
        if hp.get('usable') and ap.get('usable') and hp.get('era') and ap.get('era'):
            adj_p = clamp((ap['era'] - hp['era']) * 0.01, -0.04, 0.04)
        else:
            missing = [n for n, p in (('H', hp), ('A', ap)) if not p.get('usable')]
            flags.append(f"stats lanceur absente ({','.join(missing)}) → marché seul")
        # L10
        if g['h_stats'] and g['a_stats']:
            l10h = g['h_stats']['l10_w'] / max(1, g['h_stats']['l10_w'] + g['h_stats']['l10_l'])
            l10a = g['a_stats']['l10_w'] / max(1, g['a_stats']['l10_w'] + g['a_stats']['l10_l'])
            adj_l = clamp((l10h - l10a) * 0.15, -0.03, 0.03)
        # Run diff saison par jeu
        if g['h_stats'] and g['a_stats']:
            adj_s = clamp((g['h_stats']['rd_per_g'] - g['a_stats']['rd_per_g']) * 0.04, -0.02, 0.02)

        p_h_model = clamp(p_h + adj_p + adj_l + adj_s, 0.15, 0.92)
        p_a_model = 1 - p_h_model
        side = 'H' if p_h_model >= p_a_model else 'A'
        p_pick = p_h_model if side == 'H' else p_a_model
        p_mkt_pick = p_h if side == 'H' else 1 - p_h
        dec_pick = g['dec_h'] if side == 'H' else g['dec_a']
        st, det = g['status']
        results.append({
            **g,
            'p_mkt_h': p_mkt_h, 'adj_p': adj_p, 'adj_l': adj_l, 'adj_s': adj_s,
            'p_h_model': p_h_model, 'side': side, 'p_pick': p_pick,
            'p_mkt_pick': p_mkt_pick, 'dec_pick': dec_pick,
            'edge_pp': (p_pick - p_mkt_pick) * 100,
            'risk': 1 - p_pick,
            'bettable': st == 'pre',
            'status_detail': det,
            'flags': flags,
        })
    return results


def fmt_team(r, side):
    ab = r['h_ab'] if side == 'H' else r['a_ab']
    p = r['h_pitcher'] if side == 'H' else r['a_pitcher']
    era = f"{p['era']:.2f}" if p.get('era') else '?'
    return f"{ab} ({p['name']} {era})"


def main():
    dstr = sys.argv[1] if len(sys.argv) > 1 else date.today().strftime('%Y%m%d')
    print(f"═══ ANALYSE MLB {dstr} — carte complète ═══\n")
    games = get_day(dstr)
    results = analyze(games)

    ranked = sorted([r for r in results if r.get('p_pick') is not None],
                    key=lambda r: r['risk'])
    print(f"{'#':>2} {'Match':<22} {'Pick':<3} {'Cote':>6} {'p_mkt':>6} {'p_mod':>6} {'edge':>7} {'risque':>7}  Lanceurs")
    for i, r in enumerate(ranked, 1):
        side_ab = r['h_ab'] if r['side'] == 'H' else r['a_ab']
        opp = fmt_team(r, 'A' if r['side'] == 'H' else 'H')
        pitchers = f"{r['a_pitcher']['name']} vs {r['h_pitcher']['name']}"
        flag = ' ⚠ ' + r['flags'][0] if r['flags'] else ''
        live = '' if r['bettable'] else f" [{r['status_detail']}]"
        print(f"{i:>2} {r['a_ab']} @ {r['h_ab']:<17} {side_ab:<3} {r['dec_pick']:>6.2f} "
              f"{r['p_mkt_pick']:>6.1%} {r['p_pick']:>6.1%} {r['edge_pp']:>+6.1f}pp {r['risk']:>7.1%}  {pitchers}{flag}{live}")

    for r in results:
        if r.get('p_pick') is None:
            print(f"   — {r['a_ab']} @ {r['h_ab']} : {r.get('note', 'données manquantes')}")

    # ── Combiné (règle Palier) ──
    print('\n═══ COMBINÉ (règle Palier : jambes risque ≤ 30%) ═══')
    eligible = [r for r in ranked if r['risk'] <= 0.30 and r['bettable']]
    if len(eligible) < 2:
        print(f"Seulement {len(eligible)} jambe(s) conforme(s) — pas de combiné possible aujourd'hui.")
        return
    legs = eligible[:2]
    odds_combo = 1.0
    p_combo = 1.0
    for r in legs:
        side_ab = r['h_ab'] if r['side'] == 'H' else r['a_ab']
        odds_combo *= r['dec_pick']
        p_combo *= r['p_pick']
        print(f"  • {side_ab} ML @ {r['dec_pick']:.2f} — p_model {r['p_pick']:.1%}, risque {r['risk']:.1%}, "
              f"edge {r['edge_pp']:+.1f}pp | {fmt_team(r, r['side'])} vs {fmt_team(r, 'A' if r['side'] == 'H' else 'H')}")
    ev = p_combo * odds_combo - 1
    print(f"\n  LOW  : cote {odds_combo:.2f} | P {p_combo:.1%} | EV {ev:+.1%} | mise min 1000F → gain {1000 * odds_combo:.0f}F")

    if len(eligible) >= 3:
        third = eligible[2]
        side_ab = third['h_ab'] if third['side'] == 'H' else third['a_ab']
        odds3 = odds_combo * third['dec_pick']
        p3 = p_combo * third['p_pick']
        warn = '' if third['risk'] <= 0.30 else ' ⚠ risque 3e jambe > 30%'
        print(f"  MEDIUM variante : + {side_ab} @ {third['dec_pick']:.2f} (risque {third['risk']:.1%}{warn}) "
              f"→ cote {odds3:.2f} | P {p3:.1%} | EV {p3 * odds3 - 1:+.1%}")


if __name__ == '__main__':
    main()
