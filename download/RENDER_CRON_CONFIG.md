# 🚀 Configuration Render.com - Scraper Gratuit

## Architecture

```
┌─────────────────┐     ┌─────────────┐     ┌────────────┐
│  RENDER (Cron)  │────▶│  SUPABASE   │◀────│  VERCEL    │
│  Scraping ESPN  │     │  Database    │     │  Lecture   │
└─────────────────┘     └─────────────┘     └────────────┘
```

---

## 📋 Étapes (5 minutes)

### 1. Créer un compte Render
Allez sur : https://dashboard.render.com/register

### 2. Créer un nouveau Cron Job
1. Cliquez sur **"New +"** → **"Cron Job"**
2. Remplissez :

| Champ | Valeur |
|-------|--------|
| **Name** | `elite-scraper` |
| **Region** | Oregon (ou le plus proche) |
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Schedule** | `0 */6 * * *` (toutes les 6h) |
| **Command** | `npx tsx scripts/independent-scraper.ts` |

### 3. Ajouter les variables d'environnement

Cliquez sur **"Advanced"** → **"Add Environment Variable"** :

| Variable | Valeur |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://votre-projet.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Votre clé service_role Supabase |
| `NODE_VERSION` | `20` |
| `SCRAPER_DELAY` | `3000` |
| `SCRAPER_SOURCE_DELAY` | `8000` |

### 4. Connecter votre repo ou uploader le code

**Option A : Via repo Git**
- Connectez votre repo GitHub/GitLab

**Option B : Upload direct**
- Uploadez le dossier du projet

### 5. Créer et tester

1. Cliquez sur **"Create Cron Job"**
2. Attendez le build (~2 min)
3. Cliquez sur **"Trigger Run"** pour tester

---

## ⏰ Planning automatique

Le cron s'exécute automatiquement :
- 00:00 UTC (02:00 Paris)
- 06:00 UTC (08:00 Paris)  
- 12:00 UTC (14:00 Paris)
- 18:00 UTC (20:00 Paris)

---

## 🔧 Alternative : cron-job.org + VPS/Script externe

Si vous avez un VPS ou un ordinateur toujours allumé :

1. Installez Node.js
2. Clonez le projet
3. Configurez un cron système :
```bash
crontab -e
# Ajouter :
0 */6 * * * cd /path/to/project && npx tsx scripts/independent-scraper.ts >> /var/log/scraper.log 2>&1
```

---

## 📊 Vérification

Après exécution, vérifiez dans Supabase :
```sql
SELECT * FROM predictions 
WHERE checked_at > NOW() - INTERVAL '1 day'
ORDER BY checked_at DESC;
```

---

## ✅ Avantages Render.com

- 100% gratuit (Cron Job)
- Pas de blocage ESPN (IP différente de Vercel)
- Logs visibles dans le dashboard
- Déclenchement manuel possible
- Notification par email en cas d'échec
