#!/bin/bash
# Script pour configurer Prisma selon l'environnement
# Usage: ./scripts/setup-prisma.sh [dev|prod]

ENV=${1:-dev}

if [ "$ENV" = "prod" ] || [ "$VERCEL" = "1" ]; then
    echo "📦 Configuration Prisma pour PRODUCTION (PostgreSQL)"
    cp prisma/schema.prod.prisma prisma/schema.prisma
else
    echo "📦 Configuration Prisma pour DEVELOPPEMENT (SQLite)"
    # SQLite schema is already the default
fi

# Générer le client Prisma
bunx prisma generate
