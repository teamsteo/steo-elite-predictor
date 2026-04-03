#!/bin/bash
# Script de déploiement sécurisé pour ForexML Pro Trading
# Ce script s'assure de TOUJOURS déployer sur forexml-trading

PROJECT_ID="prj_sm2jQPQ4GGT6KBOKeHlhnRlP8sNK"
PROJECT_NAME="forexml-trading"

echo "========================================"
echo "🚀 Déploiement ForexML Pro Trading"
echo "========================================"

# Vérifier le fichier project.json
if [ -f ".vercel/project.json" ]; then
    CURRENT_PROJECT=$(grep -o '"projectId": *"[^"]*"' .vercel/project.json | cut -d'"' -f4)
    if [ "$CURRENT_PROJECT" != "$PROJECT_ID" ]; then
        echo "⚠️  ATTENTION: Le fichier .vercel/project.json pointe vers un mauvais projet!"
        echo "   Projet actuel: $CURRENT_PROJECT"
        echo "   Correction automatique..."
        echo "{\"orgId\":\"team_ZWIbZGJTf5RNuIooaTiCu9j4\",\"projectId\":\"$PROJECT_ID\"}" > .vercel/project.json
    fi
else
    echo "📁 Création du fichier .vercel/project.json..."
    mkdir -p .vercel
    echo "{\"orgId\":\"team_ZWIbZGJTf5RNuIooaTiCu9j4\",\"projectId\":\"$PROJECT_ID\"}" > .vercel/project.json
fi

echo "✅ Projet cible: $PROJECT_NAME ($PROJECT_ID)"
echo ""
echo "🔄 Déploiement en cours..."
npx vercel --prod --yes "$@"
echo ""
echo "✅ Déploiement terminé sur: https://forexml-trading.vercel.app"
