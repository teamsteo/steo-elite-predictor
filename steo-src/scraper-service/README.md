# 🚀 Scraper Indépendant - Render.com

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  RENDER.COM (Gratuit)                                           │
│  ┌──────────────────────┐                                       │
│  │ Cron Job             │──▶ Exécute scraper.js                 │
│  │ (toutes les 6 heures)│                                       │
│  └──────────────────────┘                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  SUPABASE (Base de données)                                     │
│  └── Stockage des résultats ESPN                                │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────────────────────────────────────────┐
│  VERCEL (Lecture seule)                                         │
│  └── Affiche les données, ne fait AUCUN scraping               │
└─────────────────────────────────────────────────────────────────┘
```

---

## ✅ Avantages

- ✅ **100% gratuit** (Cron Job gratuit sur Render)
- ✅ **Aucun risque de blocage Vercel** (IP différente)
- ✅ **Aucun lien avec GitHub** (plus de violation)
- ✅ **Simple à configurer** (5-10 minutes)
- ✅ **Logs visibles** dans le dashboard Render

---

## 📋 Configuration étape par étape

### Étape 1 : Créer un compte Render

1. Allez sur https://dashboard.render.com/register
2. Créez un compte gratuit

### Étape 2 : Créer le Cron Job

1. Cliquez sur **"New +"** en haut à droite
2. Sélectionnez **"Cron Job"**

### Étape 3 : Configurer le Cron Job

Remplissez les champs :

| Champ | Valeur |
|-------|--------|
| **Name** | `elite-pronos-scraper` |
| **Region** | Oregon (ou le plus proche) |
| **Runtime** | Node |
| **Branch** | main (ou votre branche) |
| **Build Command** | `npm install` |
| **Schedule** | `0 */6 * * *` (toutes les 6h) |
| **Command** | `node scraper.js` |

### Étape 4 : Connecter le code

**Option A : Depuis un repo Git**
- Connectez votre repo GitHub/GitLab
- Pointez vers le dossier `scraper-service/`

**Option B : Upload direct (pas de repo requis)**
- Choisissez "Public Git repository" ou upload

### Étape 5 : Configurer les variables d'environnement

Cliquez sur **"Advanced"** → **"Add Environment Variable"** :

| Variable | Valeur |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://votre-projet.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Votre clé service_role Supabase |
| `NODE_VERSION` | `20` |
| `SCRAPER_DELAY` | `3000` |
| `SCRAPER_SOURCE_DELAY` | `8000` |

### Étape 6 : Créer

1. Cliquez sur **"Create Cron Job"**
2. Attendez le build (~1-2 minutes)

### Étape 7 : Tester

1. Dans le dashboard, cliquez sur **"Trigger Run"**
2. Vérifiez les logs
3. Vérifiez dans Supabase que les données sont arrivées

---

## ⏰ Planning d'exécution

Le cron s'exécute automatiquement 4 fois par jour :

| Heure UTC | Heure Paris |
|-----------|-------------|
| 00:00 | 02:00 |
| 06:00 | 08:00 |
| 12:00 | 14:00 |
| 18:00 | 20:00 |

---

## 📊 Vérification des données

Dans Supabase SQL Editor :

```sql
SELECT * FROM predictions 
WHERE checked_at > NOW() - INTERVAL '1 day'
ORDER BY checked_at DESC;
```

---

## 🔧 Fichiers du service

```
scraper-service/
├── scraper.js      # Script de scraping principal
├── package.json    # Dépendances minimales
├── render.yaml     # Configuration Render
└── README.md       # Ce fichier
```

---

## ❓ Dépannage

### "Variables Supabase manquantes"
→ Vérifiez que les variables d'environnement sont correctement configurées

### "Aucun résultat scrapé"
→ Normal s'il n'y a pas de matchs terminés hier. Réessayez demain.

### Build échoue
→ Vérifiez que Node.js 18+ est spécifié dans NODE_VERSION

---

## 🛡️ Sécurité

- Les secrets Supabase sont chiffrés dans Render
- Aucune donnée sensible dans le code
- Le scraping utilise des User-Agents normaux
- Délais entre les requêtes pour éviter le rate limiting
