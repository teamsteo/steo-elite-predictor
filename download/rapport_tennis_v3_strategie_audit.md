# 🎾 RAPPORT TENNIS V3 — Évaluation stratégie 8 étapes + Audit ban-risque + Implémentation
**Date : 24 septembre 2026 · steo-elite-predictor · commits `3551246`, `4d532b9`, `1022bce` (pushés sur GitHub)**

---

## 1. VERDICT SUR TA STRATÉGIE EN 8 ÉTAPES

**Note globale : 9/10 — validée et implémentée telle quelle.** C'est la bonne philosophie : ne pas chercher à « toujours gagner » mais éliminer les erreurs systématiques. Points forts :

| Élément | Verdict |
|---|---|
| Poids Elo 25 % / Service-Retour 25 % | ✅ Équilibré — l'Elo pondéré surface est le meilleur prédicteur gratuit disponible |
| Forme pondérée par qualité adversaire 15 % | ✅ Excellente idée — battre top 20 compte double |
| Surface 15 % + Matchup 10 % | ✅ Raisonnable, shrinkage appliqué sur petits échantillons |
| H2H seulement 5 % | ✅ Correct — le H2H tennis est sur-noté par le public (value cachée) |
| Conditions 5 % | ✅ Suffisant |
| **Vetos blessure/fatigue (filtres, pas bonus)** | ✅✅ Le meilleur point de ta stratégie — c'est ce qui tue les bankrolls |
| Value = modèle vs implicite | ✅ Seule approche mathématiquement tenable à long terme |
| 3 tiers (🟢/🟡/🔴 NO BET) | ✅ Discipline imposée = anti-tilt |

**Ajustements que j'ai apportés (honnêteté des données) :**
- « Service/Retour 25 % » : sans point-par-point gratuit fiable (Sackmann **supprimé de GitHub**), j'utilise un **proxy dominance** (sets/games sur 25 derniers matchs, tiebreaks inclus). Corrélat fort du service/retour, documenté comme proxy.
- « Matchup 10 % » : style de jeu non quantifiable gratuitement → implémenté comme **contexte** : momentum points ATP + expérience Bo5 (Grand Chelem).

---

## 2. AUDIT BAN-RISQUE PAR SOURCE (testé en conditions réelles le 24/09)

| Source | État | Verdict |
|---|---|---|
| **tennis-data.co.uk** | ✅ 200 — maj 21/09/2026, ATP 2000-2026 + WTA 2007-2026, **cotes de clôture Pinnacle/B365 incluses** | **SOURCE PRIMAIRE** — 1-2 téléchargements/jour max → risque ban ~nul |
| **BetExplorer** | ✅ 200 — déjà intégré avec anti-ban (UA rotation, circuit breaker) | Matchs du jour + cotes — inchangé |
| **Jeff Sackmann GitHub** | ❌ **REPOS SUPPRIMÉS/PRIVÉS** (tennis_atp, tennis_wta, tennis_abstract…) | ⚠️ **Le V2 actuel est cassé en prod !** Le V3 le remplace |
| **Tennis Abstract Elo CSV** | ❌ 404 (fichiers retirés, site vivant) | Abandonné — Elo auto-calculé à la place |
| **ATP/WTA officiel** | ❌ 403 Cloudflare | **Interdit** — c'est LE site qui ban |
| **ESPN API** | ⚠️ 403 depuis cette machine, OK depuis Vercel | Usage modéré prod uniquement |
| **Odds API** | Quota inconnu (clé perdue localement, configurée sur Vercel) | Backup cotes seulement |

**Réponse à ta question : OUI, le V3 est implémentable gratuitement à long terme et quasi sans risque de ban** — 2 requêtes/jour vers tennis-data + BetExplorer déjà protégé + zéro dépendance aux sources mortes. L'Elo est **souverain** : calculé chez nous depuis 29 756 matchs (2021-2026), stocké dans le repo (seed 132 Ko gz + module base64), mis à jour incrémentalement chaque jour.

---

## 3. CE QUI EST IMPLÉMENTÉ (moteur V3 complet)

- **7 facteurs pondérés** exactement selon tes poids + amplification logistique + calibration par tier (GS ×0.90, Challenger ×0.78 — les surprises sont plus fréquentes là-bas)
- **Vetos durs** : walkover/abandon récent, absence >60 j, ≥4 matchs/7 j, flags manuels Supabase (blessure connue) → 🔴 NO BET **quoi que dise le reste**
- **Value gate** : edge ≥3 % requis, si divergence avec le favori marché → edge ≥8 % requis, cotes bornées [1.30-3.50], Kelly plafonné 5 %
- **3 tiers** : 🟢 ≥70 % + consensus ≥5/7 facteurs alignés · 🟡 60-69 % (suivi sans bet) · 🔴 NO BET
- **API** : `/api/tennis?version=v3` (le V2 reste le défaut → zéro régression)
- **Telegram** : nouveau cron `tennis-v3` — **rapport quotidien complet en DM à 09:30 UTC** (funnel, picks 🟢, facteurs détaillés) + picks-only en cas de 🟢 ; settlement des paris trackés à 12:00 UTC
- **Supabase** : tables `tennis_v3_bets` (suivi + settlement réel), `tennis_v3_calibration` (survit aux cold starts), `tennis_v3_flags` (vetos manuels) — dégradation gracieuse si absent
- **Qualité** : 52/52 tests V3 + 94/94 régression (badjan 27, funnel 10, safe combo 16, combo_grouped 30, combo_edge 11) + tsc 0 erreur + smoke production OK (seed chargé, +1946 matchs incrémentaux, Supabase détecté)

**Preuves de bon sens sorties du smoke test réel :** Sinner absent depuis 74 j → veto 🔴 (retour de blessure = pas de bet) · Djokovic walkover récent → veto 🔴 · Swiatek-Sabalenka 51 % → NO BET · Fritz-Zverev 67 % → 🟡 suivi sans bet. **Le moteur refuse de parier quand il faut.**

---

## 4. CE QU'IL TE RESTE À FAIRE

1. **Rien pour recevoir le rapport** : le premier DM Telegram part **automatiquement aujourd'hui 09:30 UTC** depuis Vercel (crons `tennis-v3?mode=report` + `mode=settle` ajoutés au vercel.json, auth Bearer corrigée).
2. **Déclencher maintenant** (optionnel) : `https://my-project-zeta-five-85.vercel.app/api/cron/tennis-v3?mode=report&secret=TON_CRON_SECRET`
3. **Exécuter** `supabase-tennis-v3.sql` dans le SQL Editor Supabase (3 tables, RLS service_role) → active le suivi des paris + calibration persistante + flags blessures manuels.
4. **Optionnel** : env `TENNIS_V3_TELEGRAM_ENABLED=false` pour couper les DM tennis · `TENNIS_V3_SILENT_EMPTY=true` pour taire les jours sans 🟢.
5. **Dans 4-6 semaines** : avec 30+ paris trackés dans `tennis_v3_bets`, on calibrera les paramètres Platt (a/b) sur données réelles via le backtest — la boucle d'auto-amélioration prévue par ta méthode.
