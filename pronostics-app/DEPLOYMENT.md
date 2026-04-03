# 🚀 Guide de Déploiement Vercel - Steo Élite Predictor

Ce guide vous accompagne étape par étape pour déployer votre application sur Vercel.

---

## 📋 Prérequis

Avant de commencer, assurez-vous d'avoir :

1. **Un compte GitHub** → [github.com](https://github.com) (gratuit)
2. **Un compte Vercel** → [vercel.com](https://vercel.com) (gratuit)
3. **Une base de données PostgreSQL** → Options gratuites :
   - [Neon](https://neon.tech) (recommandé)
   - [Supabase](https://supabase.com)
   - [Railway](https://railway.app)

---

## 🔧 Étape 1 : Créer une base de données PostgreSQL

### Option A : Neon (Recommandé - Gratuit)

1. Allez sur [neon.tech](https://neon.tech)
2. Cliquez sur **"Sign up"** et créez un compte
3. Une fois connecté, cliquez sur **"Create a project"**
4. Nommez-le `steo-elite-predictor`
5. Copiez la **connection string** fournie (ressemble à : `postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require`)

### Option B : Supabase (Gratuit)

1. Allez sur [supabase.com](https://supabase.com)
2. Créez un compte et un nouveau projet
3. Allez dans **Project Settings → Database**
4. Copiez l'**URI de connexion** (format PostgreSQL)

---

## 📤 Étape 2 : Pousser le code sur GitHub

### 2.1 Initialiser Git (si ce n'est pas déjà fait)

```bash
cd /home/z/my-project
git init
git add .
git commit -m "Initial commit - Steo Élite Predictor"
```

### 2.2 Créer un repository GitHub

1. Allez sur [github.com/new](https://github.com/new)
2. Nom du repository : `steo-elite-predictor`
3. Visibilité : **Public** ou **Private** (au choix)
4. **Ne cochez PAS** "Add a README file" (on en a déjà un)
5. Cliquez sur **"Create repository"**

### 2.3 Pousser le code

```bash
# Remplacez VOTRE_USERNAME par votre nom d'utilisateur GitHub
git remote add origin https://github.com/VOTRE_USERNAME/steo-elite-predictor.git
git branch -M main
git push -u origin main
```

---

## 🚀 Étape 3 : Déployer sur Vercel

### 3.1 Créer un compte Vercel

1. Allez sur [vercel.com](https://vercel.com)
2. Cliquez sur **"Sign Up"**
3. Choisissez **"Continue with GitHub"**
4. Autorisez Vercel à accéder à vos repositories

### 3.2 Importer le projet

1. Sur le dashboard Vercel, cliquez sur **"Add New..."** → **"Project"**
2. Sélectionnez le repository `steo-elite-predictor`
3. Cliquez sur **"Import"**

### 3.3 Configurer le projet

Dans la page de configuration :

| Paramètre | Valeur |
|-----------|--------|
| **Framework Preset** | Next.js (auto-détecté) |
| **Root Directory** | `./` |
| **Build Command** | `bun run build` |
| **Output Directory** | `.next` |

---

## 🔐 Étape 4 : Configurer les Variables d'Environnement

### 4.1 Avant le déploiement

Cliquez sur **"Environment Variables"** et ajoutez :

```
DATABASE_URL=postgresql://user:password@host:5432/dbname?pgb=true
DIRECT_DATABASE_URL=postgresql://user:password@host:5432/dbname
THE_ODDS_API_KEY=14e0798d10ea4ad06976fad2b021c50d
ADMIN_USER=admin
ADMIN_PASSWORD=votre_mot_de_passe_fort_ici
```

### 4.2 Remplacer les valeurs

- `DATABASE_URL` : Votre connection string PostgreSQL (avec `?pgb=true` à la fin pour Neon)
- `DIRECT_DATABASE_URL` : Même URL sans `?pgb=true`
- `ADMIN_PASSWORD` : Choisissez un mot de passe fort (12+ caractères)

### 4.3 Déployer

1. Cliquez sur **"Deploy"**
2. Attendez la fin du build (2-3 minutes)
3. 🎉 **Félicitations !** Votre app est déployée !

---

## 🗃️ Étape 5 : Initialiser la Base de Données

### Option A : Via Vercel CLI (Recommandé)

```bash
# Installer Vercel CLI
npm i -g vercel

# Se connecter
vercel login

# Lier le projet
vercel link

# Pousser le schéma en production
vercel env pull .env.local
npx prisma db push
```

### Option B : Via l'interface Neon/Supabase

1. Allez sur votre dashboard Neon/Supabase
2. Ouvrez l'**SQL Editor**
3. Exécutez le script de création de tables (généré par Prisma)

---

## ✅ Étape 6 : Vérifier le Déploiement

1. Cliquez sur l'URL fournie par Vercel (ex: `steo-elite-predictor.vercel.app`)
2. Vous devriez voir la **page de connexion**
3. Connectez-vous avec vos identifiants :
   - **Utilisateur** : `admin`
   - **Mot de passe** : celui que vous avez défini

---

## 🔄 Mises à Jour Futures

Pour mettre à jour l'application :

```bash
# Modifier le code
git add .
git commit -m "Description des changements"
git push

# Vercel déploie automatiquement !
```

---

## 🆘 Dépannage

### Erreur de build

1. Vérifiez les logs dans Vercel Dashboard → Deployments → Cliquer sur le deployment
2. Erreurs courantes :
   - `DATABASE_URL` manquant → Ajoutez la variable d'environnement
   - `prisma generate` échoue → Vérifiez le schéma Prisma

### Base de données non initialisée

```bash
# En local, avec les variables d'environnement de production
npx prisma db push
```

### Erreur 500 sur l'application

1. Vérifiez les logs : Vercel Dashboard → Project → Logs
2. Vérifiez que toutes les variables d'environnement sont définies

---

## 📊 Monitoring (Optionnel)

Vercel fournit :
- **Logs en temps réel**
- **Analytics** (visiteurs, performance)
- **Alertes** en cas d'erreur

---

## 🔗 URLs Importantes

| Service | URL |
|---------|-----|
| Vercel Dashboard | [vercel.com/dashboard](https://vercel.com/dashboard) |
| Neon Dashboard | [console.neon.tech](https://console.neon.tech) |
| The Odds API | [the-odds-api.com](https://the-odds-api.com) |

---

**Félicitations ! 🎉 Votre application Steo Élite Predictor est maintenant en ligne !**
