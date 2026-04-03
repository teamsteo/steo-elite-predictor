# Configuration de Déploiement - ForexML Pro Trading

## ⚠️ IMPORTANT - Ne PAS modifier

Ce projet est configuré pour déployer **UNIQUEMENT** sur le projet Vercel `forexml-trading`.

### Projets Vercel Séparés

| Application | Projet Vercel | Project ID | URL |
|-------------|---------------|------------|-----|
| **Trading Forex** | `forexml-trading` | `prj_sm2jQPQ4GGT6KBOKeHlhnRlP8sNK` | https://forexml-trading.vercel.app |
| **Pronostics Sportifs** | `my-project` | `prj_mPapbafV0xkQX4ATO5ypH3vcnJSu` | https://my-project-nine-sigma-24.vercel.app |

### Comment Déployer

**Toujours utiliser le script sécurisé:**
```bash
./deploy-trading.sh
```

Ou avec un token Vercel:
```bash
./deploy-trading.sh --token "YOUR_TOKEN"
```

### Ne JAMAIS faire

❌ `npx vercel --prod` sans vérifier le fichier `.vercel/project.json`
❌ Supprimer le dossier `.vercel/`
❌ Laisser Vercel CLI choisir automatiquement le projet

### Vérification avant déploiement

Le script `deploy-trading.sh` vérifie automatiquement:
1. Que le fichier `.vercel/project.json` existe
2. Que le `projectId` correspond à `forexml-trading`
3. Corrige automatiquement si nécessaire

### Fichier .vercel/project.json

Ce fichier est verrouillé et doit TOUJOURS contenir:
```json
{
  "orgId": "team_ZWIbZGJTf5RNuIooaTiCu9j4",
  "projectId": "prj_sm2jQPQ4GGT6KBOKeHlhnRlP8sNK"
}
```
