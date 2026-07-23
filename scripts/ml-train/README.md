# ML Training — XGBoost pour Steo Elite Predictor

Entraîne des modèles XGBoost sur les données historiques de Supabase et exporte les paramètres optimisés.

## Architecture

```
Supabase (données) → fetch_data.py → CSV dataset → train.py (XGBoost) → Supabase (paramètres)
                                                                         ↓
                                                              Vercel (lecture params)
```

## Installation

```bash
cd scripts/ml-train
pip install -r requirements.txt
```

## Configuration

Créer un fichier `.env` :
```
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_SERVICE_ROLE_KEY=votre-clé
```

## Utilisation

### Lancer l'entraînement
```bash
# Football uniquement
python train.py

# Tous les sports
python train.py --all-sports

# Sport spécifique
python train.py --sport tennis

# 6 derniers mois
python train.py --days 180
```

### Fetch uniquement (préparer le dataset)
```bash
python fetch_data.py --sport all --days 365 --output dataset.csv
```

## Automatisation

### GitHub Actions (recommandé)
Le workflow `.github/workflows/ml-train.yml` lance l'entraînement chaque lundi à 05:00 UTC.

Variables requises dans GitHub Secrets :
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Cron local
```bash
# Crontab hebdomadaire (lundi 6h00)
0 6 * * 1 cd /path/to/scripts/ml-train && python train.py --all-sports >> train.log 2>&1
```

## Output

### Supabase `ml_model.xgboost_params` (JSONB)
```json
{
  "trained": true,
  "sports": {
    "football": {
      "cv_accuracy": 0.65,
      "best_confidence_threshold": 0.55,
      "top_features": [["odds_home", 0.25], ["xg_diff", 0.18]],
      "samples": 1200
    }
  },
  "global_cv_accuracy": 0.62,
  "total_samples": 2500
}
```

### Supabase `ml_patterns` (patterns XGBoost)
Un pattern par sport de type `xgboost_model` avec les top features.

## Features

| Feature | Description |
|---|---|
| `odds_home/away/draw` | Cotes brutes |
| `implied_prob_*` | Probabilités implicites |
| `bookmaker_margin` | Marge du bookmaker |
| `favorite_strength` | Force du favori (0-0.95) |
| `form_diff` | Différence de forme |
| `xg_diff/total` | Diff xG (football) |
| `dc_*_prob` | Probabilités Dixon-Coles |
| `net_rating_diff` | Diff net rating (basketball) |
| `context_score` | Score de contexte ML |
| `data_quality` | Qualité des données |
| `confidence_*` | Niveau de confiance one-hot |
| `month/day_of_week/hour` | Features temporelles |
