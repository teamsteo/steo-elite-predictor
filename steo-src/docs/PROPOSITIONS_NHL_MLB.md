# Analyse et Propositions d'Amélioration NHL/MLB

## Situation Actuelle

### NHL (1 400 matchs)
**Patterns testés mais < 75% succès :**
- Avantage domicile : ~54% (trop faible)
- Goalie matchup : données insuffisantes
- Power play : peu fiable

### MLB (4 935 matchs)
**Patterns testés mais < 75% succès :**
- Avantage domicile : ~54% (trop faible)
- Lanceur matchup : données incomplètes
- Over/Under : variance trop élevée

---

## 🏒 AMÉLIORATIONS NHL PROPOSÉES

### 1. **Pattern Power Play Efficiency** (NOUVEAU)
```
Condition: home_ppg > away_ppg + 1 AND home_ppg >= 2
Outcome: home_win
```
**Justification** : Une équipe qui marque 2+ buts en supériorité numérique a un avantage psychologique et sur le score.

### 2. **Pattern Shots Differential** (NOUVEAU)
```
Condition: home_shots - away_shots >= 10
Outcome: home_win
```
**Justification** : Une différence de 10+ tirs indique une domination territoriale.

### 3. **Pattern PIM (Pénalités)**
```
Condition: away_pim - home_pim >= 8
Outcome: home_win
```
**Justification** : L'équipe qui prend moins de pénalités contrôle mieux le match.

### 4. **Pattern Cotes NHL**
```
Condition: odds_home <= 1.6
Outcome: home_win
```
**Justification** : Les cotes favoris dans la NHL sont plus fiables qu'on pense.

---

## ⚾ AMÉLIORATIONS MLB PROPOSÉES

### 1. **Pattern Lanceur ERA Differential** (NOUVEAU)
```
Condition: away_pitcher_era - home_pitcher_era >= 1.5
Outcome: home_win
```
**Justification** : Une différence de 1.5 ERA entre lanceurs est significative.

### 2. **Pattern Hits Differential**
```
Condition: home_hits - away_hits >= 4
Outcome: home_win
```
**Justification** : +4 coups sûrs = domination offensive.

### 3. **Pattern Home Runs**
```
Condition: home_homeruns >= 2 AND away_homeruns = 0
Outcome: home_win
```
**Justification** : Les homeruns changent la dynamique du match.

### 4. **Pattern Total Runs - Under**
```
Condition: home_pitcher_era < 3.5 AND away_pitcher_era < 3.5
Outcome: under_7.5
```
**Justification** : Deux bons lanceurs = moins de points.

---

## 🔧 PLAN D'ACTION

### Étape 1 : Réentraîner avec nouveaux patterns
- Ajouter les nouveaux patterns au script ML
- Tester sur les données existantes
- Mesurer le taux de succès

### Étape 2 : Scraper plus de données
- NHL : Ajouter stats goalies (SV%, GAA)
- MLB : Ajouter stats lanceurs complètes (WHIP, K/9)

### Étape 3 : Validation
- Backtest sur 2023-2024
- Comparer avec les résultats actuels

---

## 💡 RECOMMANDATION IMMÉDIATE

Je propose d'implémenter **4 nouveaux patterns par sport** basés sur les données disponibles :

**NHL :**
1. Shots differential ≥ 10
2. PIM differential (moins de pénalités)
3. Power play goals ≥ 2
4. Cote favorite ≤ 1.6

**MLB :**
1. ERA differential ≥ 1.5
2. Hits differential ≥ 4
3. Homeruns home ≥ 2, away = 0
4. Double bon lanceur → Under 7.5

Ces patterns sont **déjà calculables** avec les données existantes dans la base.

---

**Voulez-vous que je lance le réentraînement avec ces nouveaux patterns ?**
