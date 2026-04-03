# WORKLOG - PROJET ELITEPRONOPRO
## Fichier de transfert pour reprise par une autre IA

---

## 📋 INFORMATIONS CRITIQUES

### Identité du Projet
- **Nom**: Elite Prono Pro (steo-elite)
- **Type**: Application de pronostics sportifs avec ML
- **Repo GitHub**: https://github.com/steohidy/my-project.git
- **Déploiement Vercel**: https://elitepronopro.vercel.app

### Base de Données (Supabase)
```
URL: https://aumsrakioetvvqopthbs.supabase.co
Region: eu-west-1
Tables principales:
├── ml_patterns (17 patterns ML validés)
├── team_fundamentals (données fondamentales équipes)
├── match_history (~9,489 enregistrements)
├── football_matches
├── basketball_matches
├── nhl_matches
├── mlb_matches
└── predictions
```

### Variables d'Environnement Requises
```
NEXT_PUBLIC_SUPABASE_URL=https://aumsrakioetvvqopthbs.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
GITHUB_TOKEN=ghp_...
CRON_SECRET=steo-elite-cron-2026
THE_ODDS_API_KEY=...
```

---

## ⚙️ ARCHITECTURE DU SYSTÈME

### Structure des Fichiers Principaux
```
/home/z/my-project/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── matches/route.ts        ← API principale des matchs
│   │   │   ├── cron/route.ts           ← Jobs planifiés
│   │   │   ├── predictions/route.ts    ← Prédictions
│   │   │   └── ml/                     ← Endpoints ML
│   │   ├── page.tsx                    ← Page d'accueil
│   │   └── layout.tsx
│   ├── lib/
│   │   ├── bettingRecommendations.ts   ← Patterns ML & Tags
│   │   ├── mlAnalysisCache.ts          ← Cache des analyses ML
│   │   ├── espnOddsService.ts          ← Source primaire cotes
│   │   ├── db-supabase.ts              ← Connexion Supabase
│   │   └── fundamental-analysis.ts     ← Analyse fondamentale
│   └── components/
│       ├── MatchCard.tsx
│       ├── BettingTag.tsx
│       └── ...
├── vercel.json                         ← Configuration crons
└── scripts/                            ← Scripts utilitaires
```

### Jobs Cron Configurés (5 crons)
```json
{
  "0 0 * * *": "verify-evening (minuit)",
  "0 4 * * *": "verify-morning (4h)",
  "0 5 * * *": "verify-night (5h)",
  "30 5 * * *": "precalc (5h30)",
  "0 6 * * *": "update-fundamentals (6h)"
}
```

---

## 🤖 SYSTÈME ML - PATTERNS VALIDÉS

### Patterns NBA (Basketball)
| ID | Condition | Confiance | Taux Réussite |
|----|-----------|-----------|---------------|
| nba_over_220 | Tous matchs | 75% | 75% sur 408 matchs |
| nba_home_favorite | Cote < 1.5 | 78% | 78% sur 156 matchs |

### Patterns NHL (Hockey)
| ID | Condition | Confiance | Taux Réussite |
|----|-----------|-----------|---------------|
| nhl_over_55 | Tous matchs | 59% | 59% sur 1451 matchs |
| oilers_home | Edmonton à domicile | 74% | 74% sur 31 matchs |
| bruins_home | Boston à domicile | 68% | 68% sur 41 matchs |
| rangers_home | NY Rangers domicile | 65% | 65% sur 38 matchs |

### Patterns MLB (Baseball)
| ID | Condition | Confiance | Taux Réussite |
|----|-----------|-----------|---------------|
| mlb_over_75 | Tous matchs | 62% | 62% sur 4993 matchs |
| reds_over | Cincinnati joue | 85% | 85% sur 33 matchs |
| redsox_over | Boston Red Sox joue | 81% | 81% sur 36 matchs |
| rockies_over | Colorado joue | 79% | 79% sur 33 matchs |
| diamondbacks_over | Arizona joue | 80% | 80% sur 35 matchs |
| braves_over | Atlanta joue | 76% | 76% sur 34 matchs |
| yankees_over | NY Yankees joue | 72% | 72% sur 38 matchs |

### Patterns Football
| ID | Condition | Confiance | Taux Réussite |
|----|-----------|-----------|---------------|
| home_favorite_15 | Cote domicile < 1.5 | 88% | 88% sur 187 matchs |
| home_favorite_18 | Cote 1.5-1.8 | 75% | 75% sur 245 matchs |
| away_favorite_18 | Cote ext < 1.8 | 72% | 72% sur 198 matchs |
| top_team_home | Top équipe domicile | 82% | 82% sur 312 matchs |
| over_xg_threshold | xG total > 2.8 | 84% | 84% sur 156 matchs |

---

## 🔧 DERNIÈRES MODIFICATIONS

### Commit Récent: 00485c3
```
feat: Integrate ML patterns in matches API with visual tags

Modified files:
- src/app/api/matches/route.ts (ajout import bettingRecommendations)
- src/app/page.tsx (affichage tags ML)
- src/lib/mlAnalysisCache.ts (interface étendue)
```

### Fix Critique Réalisé
**PROBLÈME**: `/api/matches` n'utilisait PAS les patterns ML !
**SOLUTION**: Ajouté imports de `getBettingRecommendations` et `getBestBetTag`

```typescript
// Dans route.ts
import { getBettingRecommendations, getBestBetTag } from '@/lib/bettingRecommendations';

// Pour chaque match
const recommendations = getBettingRecommendations({
  sport: 'basketball',
  homeTeam: match.homeTeam,
  awayTeam: match.awayTeam,
  oddsHome: match.oddsHome,
  oddsAway: match.oddsAway
});
```

---

## 📊 SOURCE DES DONNÉES

### Cascade de Cotes
```
┌─────────────────────────────────────────────────────────────┐
│                    SYSTÈME DE COTES                          │
├─────────────────────────────────────────────────────────────┤
│  1. ESPN (DraftKings) ────────► GRATUIT & ILLIMITÉ          │
│     │                    Fiabilité: ~95%                     │
│     └─► Si indisponible ──┐                                  │
│                            ▼                                  │
│  2. The Odds API ───────────► FALLBACK (500/mois gratuit)   │
│     │                    Fiabilité: ~90%                     │
│     └─► Si indisponible ──┐                                  │
│                            ▼                                  │
│  3. Estimations ────────────► DERNIER RECOURS               │
│                          Fiabilité: ~60%                     │
└─────────────────────────────────────────────────────────────┘
```

### APIs Utilisées
- **ESPN API**: Scores, stats, cotes DraftKings (gratuit, illimité)
- **The Odds API**: Cotes bookmakers EU (500 crédits/mois)
- **Supabase**: Base de données principale

---

## 🎯 TÂCHE EN COURS

### Demande Utilisateur Actuelle
**Tâche**: Créer un combiné à grosse cote avec:
- Au moins 3 high-confidence picks par sport (NBA, NHL, MLB)
- Analyse avec le modèle "pointilleux"
- Récapitulatif et cote estimée
- Exécution dans la console

### Dernières Prédictions Faites
**NBA - Minnesota vs Detroit (28 Mars 2026)**
- Over 223.5: 73% confiance
- Minnesota Win: 78% confiance
- Value bet détecté: +11% edge

**NHL Recommendations**
- Oilers Home: 74% confiance
- Bruins Home: 68% confiance
- Rangers Home: 65% confiance
- Over 5.5: 59% confiance

**MLB Recommendations**
- Reds Over 7.5: 85% confiance
- Red Sox Over 7.5: 81% confiance
- Rockies Over 7.5: 79% confiance
- Diamondbacks Over 7.5: 80% confiance

---

## 📝 FONCTIONS CLÉS À CONNAÎTRE

### bettingRecommendations.ts
```typescript
// Obtenir les recommandations pour un match
getBettingRecommendations(match: MatchDataForRecommendation): BettingRecommendation[]

// Obtenir le meilleur tag
getBestBetTag(match: MatchDataForRecommendation): BettingRecommendation | null

// Couleurs des tags
getTagColor(type: BettingRecommendation['type']): { bg, text, border }
```

### mlAnalysisCache.ts
```typescript
// Cache des analyses ML
interface MLAnalysisCache {
  matchId: string;
  predictions: any;
  patterns: BettingRecommendation[];
  timestamp: number;
}
```

### ESPN Service
```typescript
// Récupérer matchs NBA
fetchNBAMatches(): Promise<Match[]>

// Récupérer matchs NHL
fetchNHLMatches(): Promise<Match[]>

// Récupérer matchs MLB
fetchMLBMatches(): Promise<Match[]>
```

---

## ⚠️ POINTS D'ATTENTION

### Erreurs Courantes
1. **`oddsDraw.toFixed is not a function`**: Toujours vérifier `oddsDraw != null && typeof oddsDraw === 'number'`
2. **Build Vercel**: Utiliser `bun run build` (pas npm)
3. **Crons**: Nécessitent `secret=steo-elite-cron-2026` dans l'URL

### Commandes Utiles
```bash
# Build local
cd /home/z/my-project && bun run build

# Pousser sur GitHub
git add . && git commit -m "message" && git push origin master

# Vérifier les crons sur Vercel
# Dashboard > Project > Settings > Cron Jobs

# Tester API localement
curl http://localhost:3000/api/matches?sport=all
```

---

## 📞 CONTACTS & LIENS

- **Vercel Dashboard**: https://vercel.com/steohidys-projects
- **Supabase Dashboard**: https://supabase.com/dashboard/project/aumsrakioetvvqopthbs
- **GitHub Repo**: https://github.com/steohidy/my-project

---

## 🔄 PROCHAINES ÉTAPES RECOMMANDÉES

1. **Poursuivre la tâche en cours**: Créer le combiné multi-sport
2. **Vérifier les crons**: S'assurer qu'ils s'exécutent correctement sur Vercel
3. **Monitoring**: Vérifier `/api/espn-status` pour la santé des sources
4. **Optimiser**: Ajuster les seuils de confiance selon les résultats réels

---

*Dernière mise à jour: 29 Mars 2026*
*Ce fichier permet à une autre IA de reprendre le travail immédiatement.*
