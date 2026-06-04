# 📋 Informations de Déploiement

## 🔑 Identifiants configurés

| Service | Valeur |
|---------|--------|
| **GitHub User** | `steohidy` |
| **GitHub Repo** | `steohidy/my-project` |
| **Vercel URL** | https://my-project-nine-sigma-24.vercel.app |
| **Local URL** | http://localhost:3000 |

---

## 🚀 Commandes de Déploiement

### Démarrer en local
```bash
cd /home/z/my-project
npm run dev
```

### Pousser les modifications vers GitHub (déploiement automatique sur Vercel)
```bash
cd /home/z/my-project
git add -A
git commit -m "Description des changements"
git push origin master
```

### Déploiement direct Vercel (si token disponible)
```bash
npx vercel --prod
```

---

## 📁 Structure du projet

- **Framework** : Next.js 16.1.6
- **Package Manager** : npm
- **Port** : 3000
- **Application** : Steo Elite Predictor (pronostics sportifs)

---

## ⚡ Workflow de mise à jour

1. **Modifier le code** localement
2. **Tester** avec `npm run dev`
3. **Commit** les changements
4. **Push** vers GitHub
5. **Vercel déploie automatiquement** (1-2 min)

---

## 🔧 Configuration Git

```bash
# Remote déjà configuré
git remote -v
# origin  https://github.com/steohidy/my-project.git (fetch)
# origin  https://github.com/steohidy/my-project.git (push)
```

---

*Dernière mise à jour : 12 Mars 2026*
