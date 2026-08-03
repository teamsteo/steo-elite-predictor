#!/bin/bash
# =============================================================
# PHASE 4 — Déploiement Calibration & Market Alignment
# =============================================================
#
# 3 étapes:
#   1. Vérifier les tables via l'API route (depuis Vercel)
#   2. Exécuter la migration SQL dans Supabase Dashboard (si nécessaire)
#   3. Lancer le training Python pour générer les coefficients Platt
#
# Utilisation:
#   ./scripts/run-migration-and-training.sh <APP_URL> [SECRET]
#
#   APP_URL = URL de votre app Vercel (ex: https://steo-elite.vercel.app)
#   SECRET  = CRON_SECRET (obligatoire)
#
# Exemples:
#   ./scripts/run-migration-and-training.sh https://steo-elite.vercel.app
#   ./scripts/run-migration-and-training.sh https://steo-elite.vercel.app mon-secret
# =============================================================

set -euo pipefail

APP_URL="${1:-}"
SECRET="${2}"
if [ -z "$SECRET" ]; then
  echo "Usage: $0 <url> <secret>"
  exit 1
fi
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [ -z "$APP_URL" ]; then
  echo "============================================================"
  echo "  PHASE 4 — Calibration & Market Alignment Pipeline"
  echo "============================================================"
  echo ""
  echo "Utilisation:"
  echo "  ./scripts/run-migration-and-training.sh <APP_URL> [SECRET]"
  echo ""
  echo "  APP_URL = URL de votre app Vercel"
  echo "  SECRET  = CRON_SECRET (obligatoire)"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "  ÉTAPE 1 — Vérification (via API Vercel):"
  echo "    curl -s -X POST '${APP_URL:-https://VOTRE-APP.vercel.app}/api/migrate-phase4?secret=${SECRET}' | python3 -m json.tool"
  echo ""
  echo "  ÉTAPE 2 — Migration SQL (si nécessaire):"
  echo "    Ouvrez Supabase Dashboard → SQL Editor → Collez:"
  echo "    cat scripts/migration_phase4_calibration.sql"
  echo ""
  echo "  ÉTAPE 3 — Training Python (coefficients Platt):"
  echo "    cd ml && python3 train_xgboost.py"
  echo ""
  exit 0
fi

echo "============================================================"
echo "  PHASE 4 — Calibration & Market Alignment"
echo "  App: $APP_URL"
echo "============================================================"
echo ""

# ── ÉTAPE 1: Vérification des tables ──
echo "📋 [1/3] Vérification des tables Supabase..."
echo ""

CHECK_RESPONSE=$(curl -s --max-time 30 \
  -X POST "${APP_URL}/api/migrate-phase4?secret=${SECRET}" \
  -H "Content-Type: application/json" 2>&1)

echo "$CHECK_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$CHECK_RESPONSE"
echo ""

STATUS=$(echo "$CHECK_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('status', 'unknown'))" 2>/dev/null || echo "error")

if [ "$STATUS" = "ready" ]; then
  echo "✅ Toutes les tables existent. Passage à l'étape 3."
else
  # ── ÉTAPE 2: Migration SQL ──
  echo "⚠️ Tables manquantes. Exécutez la migration SQL:"
  echo ""
  echo "  1. Allez sur: https://supabase.com/dashboard → votre projet → SQL Editor"
  echo "  2. Cliquez 'New Query'"
  echo "  3. Copiez-collez le contenu de:"
  echo "     cat $PROJECT_DIR/scripts/migration_phase4_calibration.sql"
  echo "  4. Cliquez 'Run'"
  echo ""
  read -p "  Appuyez sur Entrée une fois la migration exécutée..."
  
  # Re-vérifier
  echo ""
  echo "📋 Re-vérification..."
  CHECK_RESPONSE=$(curl -s --max-time 30 \
    -X POST "${APP_URL}/api/migrate-phase4?secret=${SECRET}" \
    -H "Content-Type: application/json" 2>&1)
  
  STATUS=$(echo "$CHECK_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('status', 'unknown'))" 2>/dev/null || echo "error")
  
  if [ "$STATUS" != "ready" ]; then
    echo "❌ Les tables ne sont toujours pas créées. Vérifiez dans le dashboard Supabase."
    exit 1
  fi
  echo "✅ Tables créées avec succès!"
fi

echo ""

# ── ÉTAPE 3: Training Python ──
echo "🧠 [3/3] Training XGBoost avec calibration Platt..."
echo ""

if [ -f "$PROJECT_DIR/ml/train_xgboost.py" ]; then
  cd "$PROJECT_DIR/ml"
  python3 train_xgboost.py 2>&1 | tee /tmp/xgboost_training.log
  
  echo ""
  
  # Vérifier que les coefficients Platt ont été exportés
  if grep -q "Platt coefficients" /tmp/xgboost_training.log; then
    echo "✅ Coefficients Platt générés:"
    grep "Platt coefficients" /tmp/xgboost_training.log
  else
    echo "⚠️ Coefficients Platt non trouvés dans le log. Vérifiez les données d'entraînement."
  fi
else
  echo "❌ Script training non trouvé: $PROJECT_DIR/ml/train_xgboost.py"
  echo "   Le training Python doit être lancé manuellement avec:"
  echo "   cd ml && python3 train_xgboost.py"
fi

echo ""
echo "============================================================"
echo "  ✅ PHASE 4 TERMINÉE"
echo ""
echo "  Vérifications finales:"
echo "  1. Dashboard Supabase → Tables → prediction_outcomes ✓"
echo "  2. Dashboard Supabase → Tables → odds_history ✓"
echo "  3. ml_model.xgboost_params → calibration → platt_a, platt_b ✓"
echo "  4. Pipeline: XGBoost → Platt → CLV → Brier Score ✓"
echo "============================================================"
