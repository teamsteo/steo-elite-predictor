#!/usr/bin/env python3
"""Test du matching des ligues avec la nouvelle logique normalisée."""
import unicodedata

LEAGUE_TO_DIV = {
    "Premier League": "E0", "EPL": "E0", "English Premier League": "E0",
    "England Premier League": "E0", "England - Premier League": "E0",
    "Championship": "E1", "EFL Championship": "E1",
    "League One": "E2", "League Two": "E3",
    "La Liga": "SP1", "LaLiga": "SP1", "LaLiga Santander": "SP1",
    "Spanish La Liga": "SP1", "Spain - La Liga": "SP1",
    "Primera Division": "SP1", "Primera División": "SP1",
    "Segunda": "SP2", "Segunda Division": "SP2", "Segunda División": "SP2",
    "LaLiga 2": "SP2", "La Liga 2": "SP2",
    "Serie A": "I1", "Série A": "I1", "Italian Serie A": "I1",
    "Italy - Serie A": "I1", "SerieA": "I1", "Serie A IT": "I1",
    "Serie B": "I2", "Série B": "I2", "SerieB": "I2",
    "Bundesliga": "D1", "German Bundesliga": "D1",
    "Germany - Bundesliga": "D1", "Bundesliga 1": "D1",
    "2. Bundesliga": "D2", "Bundesliga 2": "D2", "2 Bundesliga": "D2",
    "Ligue 1": "F1", "Ligue1": "F1", "French Ligue 1": "F1",
    "France - Ligue 1": "F1", "Ligue1 Uber Eats": "F1",
    "Ligue 2": "F2", "Ligue2": "F2",
    "Eredivisie": "N1", "Dutch Eredivisie": "N1",
    "Primeira Liga": "P1", "Liga Portugal": "P1",
    "Portuguese Primeira Liga": "P1", "Liga Portugal Bwin": "P1",
    "Belgian Pro League": "B1", "Jupiler Pro League": "B1",
    "First Division A": "B1",
    "Scottish Premiership": "SC0", "Scottish Premier League": "SC0",
    "SPFL Premiership": "SC0",
    "Greek Super League": "G1", "Super League Greece": "G1",
    "Super League 1": "G1",
}

def _normalize(s):
    if not s:
        return ""
    s = str(s).strip().lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s

LEAGUE_TO_DIV_NORM = {_normalize(k): v for k, v in LEAGUE_TO_DIV.items()}

def resolve_div(league_name):
    """Retourne le code division ou None."""
    if not league_name:
        return None
    # 1. Match exact
    div = LEAGUE_TO_DIV.get(str(league_name).strip())
    if div:
        return div
    # 2. Match normalisé
    norm = _normalize(league_name)
    div = LEAGUE_TO_DIV_NORM.get(norm)
    if div:
        return div
    # 3. Match partiel
    for keyword, code in [
        ("premier league", "E0"), ("epl", "E0"),
        ("la liga", "SP1"), ("laliga", "SP1"),
        ("serie a", "I1"), ("seriea", "I1"),
        ("bundesliga", "D1"),
        ("ligue 1", "F1"), ("ligue1", "F1"),
        ("eredivisie", "N1"), ("primeira", "P1"),
        ("jupiler", "B1"), ("premiership", "SC0"),
    ]:
        if keyword in norm:
            return code
    return None

# Test sur les ligues observées dans Supabase
test_leagues = [
    ("La Liga", 89, "SP1"),
    ("Inconnu", 82, None),  # fallback global
    ("Série A", 80, "I1"),  # accent aigu
    ("Premier League", 71, "E0"),
    ("Bundesliga", 63, "D1"),
    ("Ligue 1", 62, "F1"),
    # Variantes courantes qu'on pourrait voir
    ("Serie A", None, "I1"),  # sans accent
    ("EPL", None, "E0"),
    ("LaLiga", None, "SP1"),
    ("Ligue1", None, "F1"),
    ("Italian Serie A", None, "I1"),
    ("Spanish La Liga", None, "SP1"),
    ("German Bundesliga", None, "D1"),
    ("English Premier League", None, "E0"),
    ("", None, None),
    (None, None, None),
]

print(f"{'Ligue':<30} {'Attendu':<8} {'Obtenu':<8} {'Status'}")
print("-" * 60)
total = 0
passed = 0
for league, _, expected in test_leagues:
    got = resolve_div(league)
    status = "✅" if got == expected else "❌"
    if expected is not None:
        total += 1
        if got == expected:
            passed += 1
    print(f"{(league or '(null)'):<30} {str(expected):<8} {str(got):<8} {status}")

print(f"\nRésolution: {passed}/{total} matchs corrects")

# Simulation sur 447 matchs (89+82+80+71+63+62)
import collections
league_counts = collections.OrderedDict([
    ("La Liga", 89),
    ("Inconnu", 82),
    ("Série A", 80),
    ("Premier League", 71),
    ("Bundesliga", 63),
    ("Ligue 1", 62),
])

total_matches = sum(league_counts.values())
matched = sum(c for lg, c in league_counts.items() if resolve_div(lg))
fallback = total_matches - matched

print(f"\nSimulation sur {total_matches} matchs Supabase:")
print(f"  ✅ Match direct: {matched}/{total_matches} ({matched/total_matches*100:.1f}%)")
print(f"  ⚠️ Fallback global (Inconnu): {fallback}/{total_matches} ({fallback/total_matches*100:.1f}%)")
print(f"  → {matched} matchs auront maintenant des features arbitre réelles vs 0 avant")
