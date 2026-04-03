# 🚀 Configuration GitHub Actions - Scraper Gratuit

## ✅ Votre Secret Unique

```
SCRAPE_SECRET=47c1beb9093062cb0564a47737897aca9e3850ffe73cb8db56e6b03a92060651
```

> ⚠️ **Gardez ce secret confidentiel !** Il sécurise l'accès au scraping.

---

## 📋 Étapes de Configuration (5 minutes)

### 1️⃣ Aller sur votre repository GitHub

Allez sur : `https://github.com/VOTRE_USERNAME/VOTRE_REPO/settings/secrets/actions`

### 2️⃣ Ajouter les Secrets GitHub

Cliquez sur **"New repository secret"** pour chaque secret :

| Nom du Secret | Valeur |
|---------------|--------|
| `SUPABASE_URL` | Votre URL Supabase (ex: `https://xxxxx.supabase.co`) |
| `SUPABASE_SERVICE_KEY` | Votre clé service_role Supabase |

> 💡 Vous trouvez ces valeurs dans : Supabase Dashboard → Settings → API

### 3️⃣ Activer les Workflows

1. Allez dans l'onglet **"Actions"** de votre repo
2. Si vous voyez un message "Workflows aren't being run...", cliquez sur **"I understand my workflows, go ahead and enable them"**

### 4️⃣ Tester le Workflow

1. Allez dans **Actions** → **ElitePronosPro Scraper**
2. Cliquez sur **"Run workflow"** → **"Run workflow"**
3. Attendez 1-2 minutes et vérifiez les logs

---

## ⏰ Programmation Automatique

Le scraper s'exécute automatiquement **4 fois par jour** :

| Heure UTC | Heure (Paris) |
|-----------|---------------|
| 00:00 | 02:00 |
| 06:00 | 08:00 |
| 12:00 | 14:00 |
| 18:00 | 20:00 |

---

## 📊 Ce que fait le scraper

1. **Scraping ESPN** : Football (7 ligues), NBA, NHL
2. **Stockage** : Sauvegarde dans Supabase
3. **Vérification** : Met à jour les prédictions en attente

---

## 🔧 Avantages de GitHub Actions

- ✅ **100% Gratuit** : 2000 minutes/mois incluses
- ✅ **Pas de blocage** : IP différentes à chaque exécution
- ✅ **Logs visibles** : Historique complet des exécutions
- ✅ **Déclenchement manuel** : Testez quand vous voulez
- ✅ **Pas de serveur** : Rien à maintenir

---

## 🛡️ Sécurité

Les secrets sont chiffrés et ne sont jamais visibles dans les logs. Seuls les administrateurs du repo peuvent les modifier.

---

## 📱 Notifications (Optionnel)

Pour recevoir une notification en cas d'échec, ajoutez un webhook Discord/Slack dans le workflow.

---

## ❓ Problèmes fréquents

### "Supabase URL non configuré"
→ Vérifiez que le secret s'appelle exactement `SUPABASE_URL` (pas `NEXT_PUBLIC_SUPABASE_URL`)

### "Permission denied"
→ Vérifiez que le workflow a les permissions d'écriture dans Settings → Actions → General → Workflow permissions → "Read and write permissions"

### "Aucun résultat scrapé"
→ Normal s'il n'y a pas de matchs terminés hier. Les matchs d'aujourd'hui seront scrapés demain.
