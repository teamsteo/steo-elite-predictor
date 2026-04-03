# 🆓 APIs Sportives Gratuites - Solution de Remplacement

## 🚨 Problème Actuel

Les scrapers actuels ne fonctionnent plus pour les raisons suivantes :

| Site | Problème | Statut |
|------|----------|--------|
| FBref.com | Protection Cloudflare + JavaScript challenges | ❌ BLOQUÉ |
| Transfermarkt.com | Anti-bot + Rate limiting + IP blocking | ❌ BLOQUÉ |
| official.nba.com | JavaScript rendering + Blocage serverless | ❌ BLOQUÉ |

**Cause principale** : Les sites ont renforcé leurs protections anti-scraping. Les IPs de Vercel (serverless) sont automatiquement identifiées comme des bots.

---

## ✅ SOLUTIONS GRATUITES (100% - Sans Carte de Crédit)

### 1. ⚽ API-Football (RECOMMANDÉ)

**URL** : https://www.api-football.com/

**Gratuit** : 100 requêtes/jour

**Données disponibles** :
- ✅ Matches en direct et à venir
- ✅ Statistiques des équipes (forme, buts marqués/encaissés)
- ✅ Blessures et suspensions
- ✅ Classements et historique H2H
- ✅ Cotes (odds)
- ✅ Lignes des joueurs

**Inscription** : Gratuit, email uniquement

**Exemple d'utilisation** :
```javascript
// fixtures (matchs)
GET https://api-football-v1.p.rapidapi.com/v3/fixtures?date=2024-01-15

// blessures
GET https://api-football-v1.p.rapidapi.com/v3/injuries?team=42

// H2H
GET https://api-football-v1.p.rapidapi.com/v3/fixtures/headtohead?h2h=42-33

// statistiques équipe
GET https://api-football-v1.p.rapidapi.com/v3/teams/statistics?team=42&season=2024
```

---

### 2. 🏀 Balldontlie API (NBA - 100% GRATUIT)

**URL** : https://www.balldontlie.io/

**Gratuit** : Illimité (rate limit : 60/min)

**Données disponibles** :
- ✅ Joueurs NBA
- ✅ Équipes
- ✅ Matchs (tous les saisons)
- ✅ Statistiques avancées
- ✅ Blessures (via l'API officielle NBA)

**Inscription** : Optionnelle, email gratuit

**Exemple d'utilisation** :
```javascript
// Tous les joueurs
GET https://api.balldontlie.io/v1/players

// Matchs du jour
GET https://api.balldontlie.io/v1/games?dates[]=2024-01-15

// Statistiques d'un joueur
GET https://api.balldontlie.io/v1/stats?player_ids[]=115
```

---

### 3. 🌍 TheSportsDB (OPEN SOURCE - 100% GRATUIT)

**URL** : https://www.thesportsdb.com/

**Gratuit** : Complètement gratuit, open source

**Données disponibles** :
- ✅ Football, Basketball, Tennis, et 50+ sports
- ✅ Équipes, joueurs, matchs
- ✅ Événements passés et à venir
- ✅ Résultats en direct
- ✅ Statistiques

**Inscription** : Pas nécessaire pour lecture

**Exemple d'utilisation** :
```javascript
// Matchs du jour
GET https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=2024-01-15

// Équipe
GET https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=Arsenal

// H2H
GET https://www.thesportsdb.com/api/v1/json/3/searchevents.php?e=Arsenal_vs_Chelsea
```

---

### 4. 📊 Football-Data.org (GRATUIT)

**URL** : https://www.football-data.org/

**Gratuit** : 12 competitions, 10 requêtes/min

**Données disponibles** :
- ✅ Matches (Premier League, La Liga, Serie A, Bundesliga, Ligue 1)
- ✅ Classements
- ✅ Équipes
- ✅ Statistiques

**Inscription** : Email gratuit

**Exemple d'utilisation** :
```javascript
// Matchs Premier League
GET https://api.football-data.org/v4/competitions/PL/matches

// Classement
GET https://api.football-data.org/v4/competitions/PL/standings
```

---

### 5. 🇩🇪 OpenLigaDB (GRATUIT)

**URL** : https://www.openligadb.de/

**Gratuit** : Complètement gratuit

**Données disponibles** :
- ✅ Bundesliga, Premier League, et autres
- ✅ Matchs, résultats, classements
- ✅ Buts, cartons

**Exemple d'utilisation** :
```javascript
// Matchs Bundesliga
GET https://api.openligadb.de/getmatchdata/bl1

// Matchs d'une journée
GET https://api.openligadb.de/getmatchdata/bl1/2023/15
```

---

## 🔄 COMPARAISON DES APIs

| API | Football | NBA | Blessures | Forme | H2H | Gratuit |
|-----|----------|-----|-----------|-------|-----|---------|
| API-Football | ✅ | ❌ | ✅ | ✅ | ✅ | 100/jour |
| Balldontlie | ❌ | ✅ | ⚠️ | ✅ | ❌ | Illimité |
| TheSportsDB | ✅ | ✅ | ⚠️ | ❌ | ✅ | Illimité |
| Football-Data.org | ✅ | ❌ | ❌ | ✅ | ❌ | 10/min |
| OpenLigaDB | ✅ | ❌ | ❌ | ✅ | ❌ | Illimité |

---

## 🛠️ IMPLÉMENTATION RECOMMANDÉE

### Pour le Football :
1. **API-Football** (principal) → Blessures, Forme, Stats, H2H
2. **TheSportsDB** (backup) → Données de base

### Pour le Basketball (NBA) :
1. **Balldontlie** (principal) → Stats, Matchs, Joueurs
2. **TheSportsDB** (backup) → Données de base

---

## 📝 CODE D'EXEMPLE - API-Football

```typescript
// lib/apiFootballService.ts

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
const API_FOOTBALL_BASE = 'https://api-football-v1.p.rapidapi.com/v3';

export async function getTeamForm(teamId: number, season: number) {
  const response = await fetch(
    `${API_FOOTBALL_BASE}/teams/statistics?team=${teamId}&season=${season}&league=39`,
    {
      headers: {
        'x-rapidapi-key': API_FOOTBALL_KEY,
        'x-rapidapi-host': 'api-football-v1.p.rapidapi.com'
      }
    }
  );
  
  const data = await response.json();
  
  return {
    form: data.response.form,
    goalsScored: data.response.goals.for.total,
    goalsConceded: data.response.goals.against.total,
    cleanSheets: data.response.clean_sheet.total,
    avgPossession: data.response.possession_avg,
  };
}

export async function getTeamInjuries(teamId: number) {
  const response = await fetch(
    `${API_FOOTBALL_BASE}/injuries?team=${teamId}`,
    {
      headers: {
        'x-rapidapi-key': API_FOOTBALL_KEY,
        'x-rapidapi-host': 'api-football-v1.p.rapidapi.com'
      }
    }
  );
  
  const data = await response.json();
  
  return data.response.map((inj: any) => ({
    player: inj.player.name,
    injury: inj.injury_type,
    status: inj.injury_status,
    team: inj.team.name,
  }));
}

export async function getH2H(team1Id: number, team2Id: number) {
  const response = await fetch(
    `${API_FOOTBALL_BASE}/fixtures/headtohead?h2h=${team1Id}-${team2Id}`,
    {
      headers: {
        'x-rapidapi-key': API_FOOTBALL_KEY,
        'x-rapidapi-host': 'api-football-v1.p.rapidapi.com'
      }
    }
  );
  
  const data = await response.json();
  
  return data.response.map((match: any) => ({
    date: match.fixture.date,
    homeTeam: match.teams.home.name,
    awayTeam: match.teams.away.name,
    homeScore: match.goals.home,
    awayScore: match.goals.away,
  }));
}
```

---

## 🎯 PLAN D'ACTION

1. **Créer un compte API-Football** → https://rapidapi.com/api-sports/api/api-football/
2. **Créer un compte Balldontlie** → https://www.balldontlie.io/
3. **Remplacer les scrapers** par les appels API
4. **Mettre en place un système de fallback** (API-Football → TheSportsDB)

---

## ⚠️ LIMITES À CONNAÎTRE

| API | Limite | Solution |
|-----|--------|----------|
| API-Football | 100 req/jour | Cache + Fallback TheSportsDB |
| Balldontlie | 60 req/min | Rate limiting côté serveur |
| TheSportsDB | Aucune | Utiliser comme fallback |

---

## 💡 CONCLUSION

Les scrapers ne fonctionneront **JAMAIS** de manière fiable car :
1. Les sites renforcent constamment leurs protections
2. Les IPs serverless (Vercel) sont automatiquement bloquées
3. Le scraping viole souvent les Conditions d'Utilisation

**La solution** : Utiliser des APIs officielles et gratuites comme API-Football et Balldontlie.

---

*Document créé le : $(date '+%Y-%m-%d')*
