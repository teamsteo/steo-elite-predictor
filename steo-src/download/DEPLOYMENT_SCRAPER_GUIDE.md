# Guide de déploiement du Scraper Indépendant

## 🎯 Options gratuites disponibles

| Option | Avantages | Inconvénients | Difficulté |
|--------|-----------|---------------|------------|
| **cron-job.org** | ✅ 100% gratuit<br>✅ Facile à configurer<br>✅ Aucun code à déployer | ⚠️ Scraping sur Vercel | ⭐ Très facile |
| **Render.com** | ✅ Plan gratuit illimité<br>✅ Cron jobs natifs<br>✅ Séparé de Vercel | ⚠️ Spin-down après inactivité | ⭐⭐ Facile |
| **Fly.io** | ✅ 3 VMs gratuites<br>✅ Performant | ⚠️ Configuration plus complexe | ⭐⭐⭐ Moyen |

---

## Option 1: cron-job.org (RECOMMANDÉ - Le plus simple)

### Principe
cron-job.org appelle une API sur Vercel qui fait le scraping.

### Étapes

1. **Déployer la nouvelle API sur Vercel**
   ```bash
   npx vercel --prod --token VOTRE_TOKEN
   ```

2. **Créer un compte sur cron-job.org**
   - Allez sur https://cron-job.org
   - Créez un compte gratuit

3. **Créer un nouveau cron job**
   - Cliquez sur "Create Cronjob"
   - Configurez:
     - **Title**: `ElitePronos Scraper`
     - **URL**: `https://my-project-nine-sigma-24.vercel.app/api/scrape-trigger?secret=elite-scrape-2026`
     - **Schedule**: `0 5 * * *` (tous les jours à 5h UTC)
     - **Timezone**: UTC

4. **Configuration avancée** (optionnel)
   - Enable "Save responses" pour voir les logs
   - Enable "Notify on failure" pour être alerté

### URL de test
```
https://my-project-nine-sigma-24.vercel.app/api/scrape-trigger?secret=elite-scrape-2026
```

---

## Option 2: Render.com (Séparé de Vercel)

### Avantages
- Scraping **séparé** de Vercel
- Pas de risque de blocage Vercel
- Plan gratuit illimité

### Étapes

1. **Créer un compte Render**
   - Allez sur https://render.com
   - Créez un compte (connexion GitHub recommandée)

2. **Créer un Cron Job**
   - Cliquez sur "New" → "Cron Job"
   - Configurez:
     - **Name**: `elitepronos-scraper`
     - **Region**: Frankfurt (plus proche de l'Europe)
     - **Branch**: main
     - **Build Command**: `npm install`
     - **Schedule**: `0 5 * * *`
     - **Command**: `npx ts-node scripts/independent-scraper.ts`

3. **Ajouter les variables d'environnement**
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJxxxxx
   SCRAPER_DELAY=2000
   SCRAPER_SOURCE_DELAY=5000
   ```

4. **Déployer**
   - Cliquez sur "Create Cron Job"
   - Render va déployer et exécuter selon le schedule

---

## Option 3: GitHub Actions (Si votre compte est rétabli)

### Fichier `.github/workflows/scraper.yml`

```yaml
name: Daily Scraper

on:
  schedule:
    # Tous les jours à 5h UTC
    - cron: '0 5 * * *'
  workflow_dispatch: # Permet de déclencher manuellement

jobs:
  scrape:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm install
        
      - name: Run scraper
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_KEY }}
        run: npx ts-node scripts/independent-scraper.ts
```

---

## 📊 Résumé des coûts

| Service | Coût | Limites |
|---------|------|---------|
| cron-job.org | **GRATUIT** | Illimité |
| Render.com | **GRATUIT** | 750h/mois |
| Fly.io | **GRATUIT** | 3 VMs |
| GitHub Actions | **GRATUIT** | 2000 min/mois |

---

## 🔒 Sécurité

1. **Changez le secret** dans les variables d'environnement:
   - Ajoutez `SCRAPE_SECRET=votre_secret_unique` sur Vercel
   - Utilisez ce secret dans l'URL cron-job.org

2. **Variables Supabase**:
   - Ne partagez jamais `SUPABASE_SERVICE_ROLE_KEY`
   - Utilisez les secrets GitHub ou Render pour les stocker

---

## ✅ Recommandation finale

**Utilisez cron-job.org** si:
- Vous voulez la solution la plus simple
- Vous acceptez que le scraping se fasse sur Vercel

**Utilisez Render.com** si:
- Vous voulez séparer le scraping de Vercel
- Vous voulez éviter tout risque de blocage Vercel

---

## 🚀 Prochaines étapes

1. Déployer la nouvelle API sur Vercel
2. Choisir une option (cron-job.org recommandé)
3. Configurer le cron job
4. Tester avec une exécution manuelle
