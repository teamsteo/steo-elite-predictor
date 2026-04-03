#!/bin/bash

# ============================================
# Installation des Cron Jobs Steo Élite
# ============================================
#
# Ce script installe trois cron jobs:
# - 6h00 GMT: Pré-calcul des pronostics du jour
# - 7h00 GMT: Vérification des résultats
# - 7h30 GMT: Entraînement du modèle ML
#
# Usage: ./scripts/install-cron.sh
# ============================================

set -e

PROJECT_DIR="/home/z/my-project"
LOG_DIR="/var/log/steo-elite"

echo "🔧 ============================================"
echo "🔧 Installation des Cron Jobs Steo Élite"
echo "🔧 ============================================"
echo ""

# Créer le dossier de logs
echo "📁 Création du dossier de logs..."
sudo mkdir -p "$LOG_DIR" 2>/dev/null || mkdir -p "$LOG_DIR" 2>/dev/null || true

# Rendre les scripts exécutables
echo "📜 Configuration des scripts..."
chmod +x "$PROJECT_DIR/scripts/cron-daily.sh" 2>/dev/null || true
chmod +x "$PROJECT_DIR/scripts/cron-results.sh" 2>/dev/null || true
chmod +x "$PROJECT_DIR/scripts/check-results.ts" 2>/dev/null || true
chmod +x "$PROJECT_DIR/scripts/train-ml.ts" 2>/dev/null || true

# Vérifier les crontabs existants
echo ""
echo "📋 Vérification des cron jobs existants..."

CURRENT_CRON=$(crontab -l 2>/dev/null || echo "")

# Préparer les nouvelles entrées
CRON_PRECALC="# Steo Elite - Pre-calcul a 6h GMT
0 6 * * * $PROJECT_DIR/scripts/cron-daily.sh >> $LOG_DIR/cron.log 2>&1"

CRON_RESULTS="# Steo Elite - Verification resultats + ML training a 7h GMT
0 7 * * * $PROJECT_DIR/scripts/cron-results.sh >> $LOG_DIR/results.log 2>&1"

# Vérifier si les cron jobs existent déjà
HAS_PRECALC=$(echo "$CURRENT_CRON" | grep -c "cron-daily.sh" || echo "0")
HAS_RESULTS=$(echo "$CURRENT_CRON" | grep -c "cron-results.sh" || echo "0")

if [ "$HAS_PRECALC" -gt "0" ] && [ "$HAS_RESULTS" -gt "0" ]; then
    echo "✅ Les cron jobs sont déjà installés!"
    echo ""
    echo "📋 Crontab actuel:"
    echo "$CURRENT_CRON" | grep -E "(cron-daily|cron-results)" || true
    echo ""
    echo "Pour modifier: crontab -e"
    exit 0
fi

# Supprimer les anciennes entrées si elles existent
CLEANED_CRON=$(echo "$CURRENT_CRON" | grep -v "cron-daily.sh" | grep -v "cron-results.sh" | grep -v "check-results" | grep -v "train-ml" | grep -v "Steo Elite")

# Ajouter les nouvelles entrées
if [ -z "$CLEANED_CRON" ]; then
    NEW_CRON="$CRON_PRECALC
$CRON_RESULTS"
else
    NEW_CRON="$CLEANED_CRON
$CRON_PRECALC
$CRON_RESULTS"
fi

# Installer le nouveau crontab
echo "$NEW_CRON" | crontab -

echo ""
echo "✅ ============================================"
echo "✅ Cron Jobs installés avec succès!"
echo "✅ ============================================"
echo ""
echo "📅 Planning:"
echo "   ├─ 06:00 GMT → Pré-calcul des pronostics du jour"
echo "   └─ 07:00 GMT → Vérification résultats + Entraînement ML"
echo ""
echo "🧠 Le modèle ML s'entraîne automatiquement après"
echo "   la vérification des résultats (vers 7h05 GMT)"
echo ""
echo "📁 Logs: $LOG_DIR/"
echo "   ├─ cron.log        → Logs pré-calcul"
echo "   ├─ results.log     → Logs vérification + ML"
echo "   ├─ check-results.log → Détails vérification"
echo "   └─ train-ml.log    → Détails entraînement ML"
echo ""
echo "🔧 Commandes utiles:"
echo "   Voir crontab:   crontab -l"
echo "   Modifier:       crontab -e"
echo "   Voir logs:      tail -f $LOG_DIR/cron.log"
echo "   Test manuel:    $PROJECT_DIR/scripts/cron-daily.sh"
echo "   Test ML:        bun run scripts/train-ml.ts"
echo ""
