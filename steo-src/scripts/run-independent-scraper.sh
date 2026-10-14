#!/bin/bash
# ============================================
# Script de lancement du scraper indépendant
# ============================================
# 
# Utilisation:
#   ./scripts/run-independent-scraper.sh
#
# Configuration CRON (crontab -e):
#   # Tous les jours à 5h du matin
#   0 5 * * * cd /path/to/my-project && ./scripts/run-independent-scraper.sh >> logs/scraper.log 2>&1
#

set -e

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  SCRAPER INDÉPENDANT - ELITEPRONOSPRO${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Vérifier que nous sommes dans le bon répertoire
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Erreur: Ce script doit être exécuté depuis la racine du projet${NC}"
    exit 1
fi

# Créer le dossier logs si nécessaire
mkdir -p logs

# Charger les variables d'environnement
if [ -f ".env.local" ]; then
    echo -e "${YELLOW}📋 Chargement de .env.local...${NC}"
    export $(cat .env.local | grep -v '^#' | xargs)
elif [ -f ".env" ]; then
    echo -e "${YELLOW}📋 Chargement de .env...${NC}"
    export $(cat .env | grep -v '^#' | xargs)
else
    echo -e "${RED}❌ Erreur: Fichier .env.local ou .env non trouvé${NC}"
    exit 1
fi

# Vérifier les variables requises
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo -e "${RED}❌ Erreur: Variables NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requises${NC}"
    exit 1
fi

# Date du jour
DATE=$(date '+%Y-%m-%d %H:%M:%S')
echo -e "${YELLOW}📅 Date: ${DATE}${NC}"
echo ""

# Lancer le scraper
echo -e "${GREEN}🚀 Lancement du scraper...${NC}"
echo ""

npx ts-node scripts/independent-scraper.ts

echo ""
echo -e "${GREEN}✅ Script terminé${NC}"
