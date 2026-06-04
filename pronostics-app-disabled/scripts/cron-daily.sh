#!/bin/bash

# ============================================
# Script de Pré-Calcul Quotidien Automatique
# Steo Élite Predictor - Cron Job
# ============================================
# 
# Installation:
#   1. Rendre exécutable: chmod +x scripts/cron-daily.sh
#   2. Ajouter au crontab: crontab -e
#      # Pré-calcul à 6h GMT
#      0 6 * * * /home/z/my-project/scripts/cron-daily.sh >> /var/log/steo-elite/cron.log 2>&1
#      # Vérification résultats à 7h GMT  
#      0 7 * * * /home/z/my-project/scripts/cron-results.sh >> /var/log/steo-elite/results.log 2>&1
#
# Exécution: Tous les jours à 6h00 GMT (pré-calcul) et 7h00 GMT (résultats)
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
    echo "[$DATE] $1" | tee -a "$LOG_DIR/cron.log"
}

log "🚀 =========================================="
log "🚀 Début du pré-calcul quotidien Steo Élite"
log "🚀 =========================================="

# Aller au dossier du projet
cd "$PROJECT_DIR"

# 1. Pré-calcul des conseils Expert
log "📊 Étape 1: Pré-calcul des conseils Expert..."
if bun run scripts/precalc-expert.ts >> "$LOG_DIR/precalc-expert.log" 2>&1; then
    log "✅ Conseils Expert générés avec succès"
else
    log "⚠️ Erreur lors du pré-calcul Expert (continu...)"
fi

# 2. Pousser les données sur GitHub
log "📤 Étape 2: Synchronisation GitHub..."
git add data/ >> "$LOG_DIR/git.log" 2>&1 || true
git commit -m "chore: Mise à jour quotidienne $(date '+%Y-%m-%d %H:%M')" >> "$LOG_DIR/git.log" 2>&1 || true
git push origin master >> "$LOG_DIR/git.log" 2>&1 || log "⚠️ Pas de changements à pousser"

# 3. Nettoyer les vieux logs (garder 7 jours)
log "🧹 Étape 3: Nettoyage des logs..."
find "$LOG_DIR" -name "*.log" -mtime +7 -delete 2>/dev/null || true

log "🎉 Pré-calcul quotidien terminé!"
log "📊 Logs disponibles dans: $LOG_DIR"
