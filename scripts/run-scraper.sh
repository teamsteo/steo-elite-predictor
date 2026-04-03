#!/bin/bash

# ============================================
# SCRIPT DE LANCEMENT DU SCRAPER INDÉPENDANT
# ============================================
# 
# Usage: ./run-scraper.sh [options]
#
# Options:
#   --dry-run      Mode simulation (pas de vraies requêtes)
#   --verify-only  Vérifier les résultats uniquement
#   --help         Afficher l'aide

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 ElitePronosPro - Scraper Indépendant${NC}"
echo "============================================"

# Vérifier les variables d'environnement
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] && [ -z "$SUPABASE_URL" ]; then
    echo -e "${RED}❌ Erreur: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_URL non défini${NC}"
    echo "Exportez les variables:"
    echo "  export NEXT_PUBLIC_SUPABASE_URL=votre_url"
    echo "  export SUPABASE_SERVICE_ROLE_KEY=votre_cle"
    exit 1
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ] && [ -z "$SUPABASE_ANON_KEY" ]; then
    echo -e "${RED}❌ Erreur: SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_ANON_KEY non défini${NC}"
    exit 1
fi

# Mode dry-run
if [ "$1" == "--dry-run" ]; then
    export DRY_RUN=true
    echo -e "${YELLOW}⚠️ Mode DRY RUN activé (simulation)${NC}"
fi

# Afficher la configuration
echo -e "${GREEN}📊 Configuration:${NC}"
echo "  Supabase URL: ${NEXT_PUBLIC_SUPABASE_URL:-$SUPABASE_URL}"
echo "  Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Lancer le scraper
echo -e "${GREEN}🔄 Lancement du scraper...${NC}"
cd "$(dirname "$0")/.."

npx tsx scripts/standalone-scraper.ts

echo ""
echo -e "${GREEN}✅ Terminé!${NC}"
