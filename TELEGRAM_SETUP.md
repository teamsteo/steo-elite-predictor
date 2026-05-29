# Configuration Telegram - Publication Automatique

## Résumé

Ce système publie automatiquement les pronostics sur Telegram via un bot.

**⚠️ IMPORTANT : Seuls les pronostics SAFE et MODÉRÉ sont publiés**
- 🟢 **Safe** : Risque ≤ 30%
- 🟡 **Modéré** : Risque 31-50%
- 🔴 **Risqué** : Risque > 50% → **EXCLU** des publications

---

## 1. Créer le Bot Telegram

### Étape 1 : Créer le bot avec BotFather
1. Ouvrir Telegram
2. Rechercher **@BotFather**
3. Envoyer la commande `/newbot`
4. Choisir un nom (ex: "Pronostics Sportifs")
5. Choisir un username (ex: `mes_pronostics_bot`)
6. **Copier le TOKEN** fourni (format: `123456789:ABCdefGHIjklMNOpqrSTUvwxYZ`)

### Étape 2 : Créer un groupe/canal
- **Option A - Groupe** : Créer un groupe et ajouter le bot
- **Option B - Canal** : Créer un canal public/privé et ajouter le bot comme administrateur

### Étape 3 : Récupérer le CHAT_ID

**Méthode 1 - Via l'API (automatique) :**
1. Envoyer un message dans le groupe/canal
2. Appeler : `GET /api/telegram/publish?type=chatid`
3. Le CHAT_ID sera retourné

**Méthode 2 - Manuelle :**
1. Envoyer un message au bot ou dans le groupe
2. Aller sur : `https://api.telegram.org/bot<VOTRE_TOKEN>/getUpdates`
3. Chercher `"chat":{"id":XXXXXXXXX}`

---

## 2. Configuration des Variables d'Environnement

Ajouter dans Vercel (Settings → Environment Variables) :

```
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
TELEGRAM_CHAT_ID=-1001234567890
```

> **Note** : Le CHAT_ID des groupes est négatif (ex: `-1001234567890`)

---

## 3. Actions Disponibles

### API `/api/telegram/publish`

| Type | Description | Filtre Risque |
|------|-------------|---------------|
| `summary` | Résumé quotidien des matchs | ✅ Safe + Modéré uniquement |
| `valuebets` | Value bets détectés | ✅ Safe + Modéré uniquement |
| `test` | Tester la connexion | - |
| `chatid` | Récupérer le CHAT_ID | - |

### API Cron `/api/cron?action=...`

| Action | Description |
|--------|-------------|
| `telegram-summary` | Publier le résumé quotidien |
| `telegram-valuebets` | Publier les value bets |

---

## 4. Configurer les Publications Automatiques (Vercel Cron)

Dans `vercel.json`, ajouter :

```json
{
  "crons": [
    {
      "path": "/api/cron?action=telegram-summary&secret=VOTRE_SECRET",
      "schedule": "0 8 * * *"
    },
    {
      "path": "/api/cron?action=telegram-valuebets&secret=VOTRE_SECRET",
      "schedule": "0 9 * * *"
    }
  ]
}
```

> **Schedule** : `0 8 * * *` = Tous les jours à 08h00 UTC

---

## 5. Test Manuel

### Tester la connexion
```bash
curl "https://votre-site.vercel.app/api/telegram/publish?type=test"
```

### Publier un résumé
```bash
curl "https://votre-site.vercel.app/api/telegram/publish?type=summary"
```

### Via Cron (avec secret)
```bash
curl "https://votre-site.vercel.app/api/cron?action=telegram-summary&secret=VOTRE_SECRET"
```

---

## 6. Format des Messages

### Résumé Quotidien
```
📢 PROGRAMME DU JOUR
📅 Vendredi 30 mai 2026
🎯 5 pronostics disponibles
🟢 Safe: 3 | 🟡 Modéré: 2

⚽ Foot: 3 matchs | 💎 1 value bet
🏀 Basket: 2 matchs

💎 TOP VALUE BETS:
1. PSG vs Barcelona
   → Victoire PSG
```

### Pronostic Individuel
```
🔔 VALUE BET DÉTECTÉ !

⚽ PSG vs Barcelona
📅 Vendredi 30 mai, 21h00
🏆 Champions League

📈 Cotes: 1: 2.10 | X: 3.40 | 2: 3.20
🔥 Pronostic: Victoire PSG
⚖️ Risque: 🟢 25%
💎 Value Bet: Home Win
```

---

## 7. Filtres de Risque

Le système exclut automatiquement les pronostics trop risqués :

| Niveau | Risque | Emoji | Publication |
|--------|--------|-------|-------------|
| Safe | 0-30% | 🟢 | ✅ Oui |
| Modéré | 31-50% | 🟡 | ✅ Oui |
| Risqué | > 50% | 🔴 | ❌ Non |

### Fonction utilitaire
```typescript
import { isSafeOrModerate, getRiskLabel } from '@/lib/telegramService';

// Vérifier si publiable
isSafeOrModerate(25); // true (Safe)
isSafeOrModerate(45); // true (Modéré)
isSafeOrModerate(65); // false (Risqué)

// Obtenir le label
getRiskLabel(25); // "Safe"
getRiskLabel(45); // "Modéré"
getRiskLabel(65); // "Risqué"
```

---

## 8. Dépannage

### Le bot ne répond pas
- Vérifier que le TOKEN est correct
- Vérifier que le bot est dans le groupe/canal
- Envoyer d'abord un message au bot

### Message "CHAT_ID non configuré"
- Appeler `/api/telegram/publish?type=chatid`
- Vérifier qu'un message a été envoyé au bot

### Aucun pronostic publié
- Vérifier que les pronostics ont un `riskPercentage` défini
- Les pronostics "risqués" (> 50%) sont automatiquement exclus
- Vérifier les logs serveur

---

## 9. Sécurité

- **TOKEN** : Ne jamais exposer publiquement
- **CHAT_ID** : Pas critique (permet juste d'identifier le canal)
- **CRON_SECRET** : Protège les endpoints cron

---

## Résumé Rapide

1. Créer bot avec @BotFather → Récupérer TOKEN
2. Créer groupe/canal → Ajouter le bot
3. Envoyer un message → Récupérer CHAT_ID via API
4. Configurer les variables d'environnement
5. Configurer les crons Vercel
6. ✅ Les pronostics safe/modéré sont publiés automatiquement !
