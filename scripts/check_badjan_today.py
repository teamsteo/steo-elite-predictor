#!/usr/bin/env python3
"""
Diagnostic BADJAN sans clés API — utilise les cotes publiques ESPN.
Évalue combien de matchs de foot du jour (ligues du pipeline) sont des
favoris à domicile confirmés par le marché (cote 1 strictement la plus
basse du 1X2), avec un proxy de risque (proba implicite désajustée).
Ceci borne supérieurement le funnel BADJAN (le vrai risque vient du
modèle Dixon-Coles/XGBoost, non observable publiquement).
"""
import json
import urllib.request

LEAGUES = [
    ('eng.1', 'Premier League'), ('esp.1', 'La Liga'), ('ita.1', 'Serie A'),
    ('ger.1', 'Bundesliga'), ('fra.1', 'Ligue 1'), ('fra.2', 'Ligue 2'),
    ('uefa.champions', 'Champions League'), ('uefa.europa', 'Europa League'),
    ('uefa.europa.conf', 'Conference League'), ('ned.1', 'Eredivisie'),
    ('por.1', 'Liga Portugal'), ('bel.1', 'Jupiler Pro League'),
    ('tur.1', 'Süper Lig'), ('usa.1', 'MLS'),
    ('ger.dfb_pokal', 'DFB Pokal'), ('eng.league_cup', 'Carabao Cup'),
    ('esp.copa_del_rey', 'Copa del Rey'), ('ita.coppa_italia', 'Coppa Italia'),
    ('fifa.worldq.uefa', 'WCQ Europe'), ('fifa.worldq.conmebol', 'WCQ Conmebol'),
    ('fifa.worldq.concacaf', 'WCQ Concacaf'), ('fifa.worldq.afc', 'WCQ Asie'),
    ('fifa.worldq.caf', 'WCQ Afrique'), ('uefa.nations', 'Nations League'),
]

UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'}


def fetch_json(url, timeout=15):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def implied_prob(odds):
    return 1.0 / odds if odds and odds > 1 else 0


def main():
    total = 0
    with_odds = 0
    home_fav = 0
    strong_home_fav = []  # proxy risque <= 45% : proba implicite home >= 55%

    for lg, name in LEAGUES:
        try:
            d = fetch_json(f'https://site.api.espn.com/apis/site/v2/sports/soccer/{lg}/scoreboard')
        except Exception as e:
            print(f'  [skip] {name}: {e}')
            continue
        for ev in d.get('events', []):
            total += 1
            comp = ev.get('competitions', [{}])[0]
            home = away = None
            for c in comp.get('competitors', []):
                if c.get('homeAway') == 'home':
                    home = c.get('team', {}).get('displayName', '?')
                else:
                    away = c.get('team', {}).get('displayName', '?')
            odds_list = comp.get('odds', [])
            if not odds_list:
                continue
            o = odds_list[0]
            oh = o.get('homeTeamOdds', {}).get('moneyLine')
            oa = o.get('awayTeamOdds', {}).get('moneyLine')
            od = o.get('drawOdds', {}).get('moneyLine')
            # ESPN sometimes uses provide['alternativeDisplayValue'] etc; keep numeric only
            if not (isinstance(oh, (int, float)) and isinstance(oa, (int, float))):
                continue
            with_odds += 1
            is_home_fav = oh < oa and (not isinstance(od, (int, float)) or oh < od)
            if not is_home_fav:
                continue
            home_fav += 1
            # proxy du risque : proba implicite brute de la cote home (avec marge incluse,
            # donc surestimée — favorable ici pour une borne haute)
            p_home = implied_prob(oh)
            if p_home >= 0.55 and oh >= 1.10:
                detail = f"{home} vs {away} [{name}] 1:{oh} X:{od} 2:{oa} -> p~{p_home:.0%}"
                strong_home_fav.append(detail)

    print('=' * 60)
    print('POTENTIEL BADJAN DU JOUR (cotes publiques ESPN)')
    print('=' * 60)
    print(f'Matchs foot (ligues pipeline)         : {total}')
    print(f'Avec cotes 1X2 réelles affichées      : {with_odds}')
    print(f'Favoris à domicile confirmés marché   : {home_fav}')
    print(f'Dont favoris forts (p implicite >=55%) : {len(strong_home_fav)}')
    print()
    if strong_home_fav:
        print('Candidats BADJAN potentiels (le risque final dépend du modèle):')
        for s in strong_home_fav:
            print(f'  - {s}')
    else:
        print('AUCUN favori domicile fort aujourd\'hui -> BADJAN 0 pick probable = silence NORMAL')
    print()
    print('Note: le vrai filtre BADJAN utilise riskPercentage du modele')
    print('(Dixon-Coles/XGBoost), non calculable sans les cles. Ce proxy')
    print('borne le nombre de picks possibles.')


if __name__ == '__main__':
    main()
