#!/bin/bash

# ============================================
# Script de Vérification des Résultats + ML Training
# Steo Élite Predictor - Cron Job
# ============================================
# 
# Exécution: Tous les jours à 7h00 GMT
# 1. Vérifie les résultats des matchs terminés
# 2. Entraîne le modèle ML avec les nouvelles données
# ============================================

set -e

# Configuration
PROJECT_DIR="/home/z/my-project"
LOG_DIR="/var/log/steo-elite"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

# Créer le dossier de logs
mkdir -p "$LOG_DIR"

# Fonction de log
log() {
    echo "[$DATE] $1" | tee -a "$LOG_DIR/results.log"
}

log "🔍 =========================================="
log "🔍 Vérification des Résultats + ML Training"
log "🔍 =========================================="

# Aller au dossier du projet
cd "$PROJECT_DIR"

# 1. Vérifier les résultats
log "📊 Étape 1: Vérification des résultats des matchs..."
if bun run scripts/check-results.ts >> "$LOG_DIR/check-results.log" 2>&1; then
    log "✅ Résultats vérifiés avec succès"
else
    log "⚠️ Erreur lors de la vérification (continu...)"
fi

# 2. Entraînement du modèle ML
log "🧠 Étape 2: Entraînement du modèle ML..."
if bun run scripts/train-ml.ts >> "$LOG_DIR/train-ml.log" 2>&1; then
    log "✅ Modèle ML entraîné avec succès"
else
    log "⚠️ Erreur lors de l'entraînement ML (continu...)"
fi

# 3. Pousser les résultats sur GitHub
log "📤 Étape 3: Synchronisation GitHub..."
git add data/ >> "$LOG_DIR/git.log" 2>&1 || true
git commit -m "chore: Résultats vérifiés + ML entraîné $(date '+%Y-%m-%d %H:%M')" >> "$LOG_DIR/git.log" 2>&1 || true
git push origin master >> "$LOG_DIR/git.log" 2>&1 || log "⚠️ Pas de changements à pousser"

log "🎉 Processus terminé!"
