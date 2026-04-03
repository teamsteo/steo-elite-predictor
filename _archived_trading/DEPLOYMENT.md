# ForexML Pro - Déploiement

## Identifiants de Connexion

### Administrateur
- **Username:** `admin`
- **Mot de passe:** `ForexML2024!`

### Trader
- **Username:** `trader`
- **Mot de passe:** `Trading2024!`

## Déploiement sur Vercel

### Option 1: Via Vercel CLI

```bash
# Installer Vercel CLI
npm install -g vercel

# Se connecter à Vercel
vercel login

# Déployer
cd /home/z/my-project
vercel --prod
```

### Option 2: Via GitHub + Vercel

1. Pusher le code sur GitHub
2. Aller sur vercel.com
3. Importer le repository
4. Déployer automatiquement

## Déploiement sur Render

1. Créer un compte sur render.com
2. Nouveau Web Service
3. Connecter le repository GitHub
4. Build Command: `npm run build`
5. Start Command: `npm start`

## Déploiement sur Railway

1. Créer un compte sur railway.app
2. New Project → Deploy from GitHub repo
3. Le déploiement se fait automatiquement

## Variables d'environnement (optionnel)

Créer un fichier `.env` pour la production:

```
JWT_SECRET=votre-cle-secrete-tres-longue-et-securisee
```

## Accès Local

```bash
cd /home/z/my-project
npm run dev
```

L'application sera accessible sur http://localhost:3000

## Structure du Projet

```
src/
├── app/
│   ├── api/
│   │   ├── auth/route.ts      # Authentification
│   │   ├── market/route.ts    # Données de marché
│   │   ├── signals/route.ts   # Signaux ML
│   │   ├── patterns/route.ts  # Détection patterns
│   │   └── backtest/route.ts  # Backtesting
│   ├── login/page.tsx         # Page de connexion
│   └── page.tsx               # Dashboard principal
├── lib/
│   ├── auth.ts                # Système d'auth
│   └── trading/
│       ├── types.ts           # Types TypeScript
│       ├── indicators.ts      # Indicateurs techniques
│       ├── patterns.ts        # 25+ patterns bougies
│       ├── ml-strategy.ts     # ML & signaux
│       └── backtest.ts        # Moteur backtest
└── middleware.ts              # Protection des routes
```

## Sécurité

- Mots de passe hachés avec bcrypt
- Sessions JWT avec expiration 7 jours
- Cookies HTTP-only sécurisés
- Routes protégées par middleware

## Avertissement

⚠️ Cette application est fournie à des fins éducatives uniquement.
Les signaux et analyses ne constituent pas des conseils financiers.
Le trading Forex comporte des risques significatifs de perte.
