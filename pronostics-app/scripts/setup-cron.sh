#!/bin/bash

# ============================================
# Script d'installation du Cron Job
# Steo Élite Predictor - Installation automatique
# ============================================
#
# Usage: ./scripts/setup-cron.sh
#
# Ce script installe un cron job qui s'exécute tous les jours à 6h00 GMT
# pour générer les prédictions et les conseils expert.
# ============================================

set -e

PROJECT_DIR="/home/z/my-project"
SCRIPT_PATH="$PROJECT_DIR/scripts/cron-daily.sh"

echo "🔧 Configuration du Cron Job Steo Élite"
echo "========================================"
echo ""

# Vérifier que le script existe
if [ ! -f "$SCRIPT_PATH" ]; then
    echo "❌ Erreur: Script cron-daily.sh non trouvé"
    exit 1
fi

# Rendre le script exécutable
chmod +x "$SCRIPT_PATH"
echo "✅ Script rendu exécutable"

# Créer le dossier de logs
mkdir -p /var/log/steo-elite
echo "✅ Dossier de logs créé"

# Vérifier si le cron existe déjà
if crontab -l 2>/dev/null | grep -q "cron-daily.sh"; then
    echo "⚠️  Le cron job existe déjà"
    echo "   Pour le modifier: crontab -e"
    echo "   Pour le supprimer: crontab -e et supprimer la ligne"
else
    # Ajouter le cron job (6h00 GMT tous les jours)
    CRON_JOB="0 6 * * * $SCRIPT_PATH >> /var/log/steo-elite/cron.log 2>&1"
    
    # Ajouter au crontab existant ou créer nouveau
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    
    echo "✅ Cron job installé avec succès!"
    echo ""
    echo "📅 Horaire: Tous les jours à 6h00 GMT"
    echo "📁 Logs: /var/log/steo-elite/"
    echo ""
    echo "Pour vérifier: crontab -l"
fi

echo ""
echo "🎯 Prochaines étapes:"
echo "   1. Vérifier que le cron est actif: crontab -l"
echo "   2. Tester manuellement: ./scripts/cron-daily.sh"
echo "   3. Vérifier les logs: tail -f /var/log/steo-elite/cron.log"
echo ""
echo "✅ Configuration terminée!"
