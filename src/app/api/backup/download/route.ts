/**
 * API de Backup - Téléchargement complet du projet
 * GET /api/backup/download
 *
 * Génère un fichier ZIP contenant tout le projet
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const BACKUP_SECRET = process.env.BACKUP_SECRET || 'steo-elite-backup-2024';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const format = searchParams.get('format') || 'json'; // json ou files

  // Vérification du secret
  if (secret !== BACKUP_SECRET) {
    return NextResponse.json({
      error: 'Non autorisé',
      hint: 'Ajoutez ?secret=steo-elite-backup-2024 à l\'URL'
    }, { status: 401 });
  }

  try {
    const backup = await generateBackup();

    if (format === 'json') {
      // Retourner en JSON (plus simple)
      return NextResponse.json({
        success: true,
        timestamp: new Date().toISOString(),
        backup
      });
    }

    // Sinon retourner les fichiers individuels
    return NextResponse.json({
      success: true,
      message: 'Backup généré avec succès',
      files: Object.keys(backup.files),
      instructions: backup.instructions
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

async function generateBackup() {
  const projectRoot = process.cwd();

  // Structure du backup
  const backup: {
    metadata: {
      project: string;
      version: string;
      generated: string;
      description: string;
    };
    files: Record<string, string>;
    sqlScripts: Record<string, string>;
    environmentTemplate: string;
    instructions: string;
    cronConfig: Array<{
      name: string;
      url: string;
      schedule: string;
      description: string;
    }>;
  } = {
    metadata: {
      project: 'Steo Élite Sports Predictor',
      version: '2026.04.03-v1',
      generated: new Date().toISOString(),
      description: 'Application de pronostics sportifs avec ML'
    },
    files: {},
    sqlScripts: {},
    environmentTemplate: '',
    instructions: '',
    cronConfig: []
  };

  // ============================================
  // 1. FICHIERS SOURCE PRINCIPAUX
  // ============================================

  const filesToBackup = [
    // Config
    'package.json',
    'tsconfig.json',
    'next.config.ts',
    'tailwind.config.ts',
    'postcss.config.mjs',

    // API Routes
    'src/app/api/scrape-trigger/route.ts',
    'src/app/api/ml/train-sports/route.ts',
    'src/app/api/ml/update-results/route.ts',
    'src/app/api/ml/analyze/route.ts',
    'src/app/api/health/route.ts',
    'src/app/api/system/alerts/route.ts',

    // Libs principales
    'src/lib/unified-sports-analysis.ts',
    'src/lib/ml-memory-service.ts',
    'src/lib/dixonColesModel.ts',
    'src/lib/mlbModel.ts',
    'src/lib/nhlAdvancedModel.ts',

    // Middleware
    'src/middleware.ts',

    // SQL
    'supabase/ml_picks.sql'
  ];

  for (const file of filesToBackup) {
    const filePath = path.join(projectRoot, file);
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        backup.files[file] = content;
      }
    } catch (e) {
      // Fichier non trouvé, on continue
    }
  }

  // ============================================
  // 2. SCRIPTS SQL
  // ============================================

  backup.sqlScripts = {
    ml_picks: `-- Table ml_picks pour le tracking des pronostics ML
CREATE TABLE IF NOT EXISTS ml_picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id VARCHAR(255),
  sport VARCHAR(50) NOT NULL,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  home_team VARCHAR(255) NOT NULL,
  away_team VARCHAR(255) NOT NULL,
  bet VARCHAR(50) NOT NULL,
  bet_label VARCHAR(255),
  odds DECIMAL(10,2),
  win_probability DECIMAL(5,2),
  confidence VARCHAR(20),
  type VARCHAR(50),
  result VARCHAR(20) DEFAULT 'pending',
  actual_winner VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ml_picks_result ON ml_picks(result);
CREATE INDEX IF NOT EXISTS idx_ml_picks_date ON ml_picks(date);`,

    ml_patterns: `-- Table ml_patterns pour les patterns ML appris
CREATE TABLE IF NOT EXISTS ml_patterns (
  id VARCHAR(255) PRIMARY KEY,
  sport VARCHAR(50) NOT NULL,
  pattern_type VARCHAR(100) NOT NULL,
  condition TEXT NOT NULL,
  outcome VARCHAR(100) NOT NULL,
  sample_size INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2) DEFAULT 0,
  confidence DECIMAL(5,4) DEFAULT 0,
  description TEXT,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ml_patterns_sport ON ml_patterns(sport);
CREATE INDEX IF NOT EXISTS idx_ml_patterns_success ON ml_patterns(success_rate DESC);`,

    matches: `-- Table matches pour les matchs scrapés
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id VARCHAR(255) UNIQUE,
  sport VARCHAR(50) NOT NULL,
  home_team VARCHAR(255) NOT NULL,
  away_team VARCHAR(255) NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  league VARCHAR(100),
  match_date TIMESTAMP WITH TIME ZONE,
  status VARCHAR(50) DEFAULT 'scheduled',
  home_xg DECIMAL(5,2),
  away_xg DECIMAL(5,2),
  odds_home DECIMAL(10,2),
  odds_away DECIMAL(10,2),
  odds_draw DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matches_sport ON matches(sport);
CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(match_date);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);`
  };

  // ============================================
  // 3. TEMPLATE VARIABLES D'ENVIRONNEMENT
  // ============================================

  backup.environmentTemplate = `# ===========================================
# VARIABLES D'ENVIRONNEMENT - STEO ÉLITE
# ===========================================
# À configurer dans Vercel Dashboard > Settings > Environment Variables

# Supabase (OBLIGATOIRE)
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_SERVICE_ROLE_KEY=votre_service_role_key
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre_anon_key

# Sécurité (OPTIONNEL)
SCRAPE_SECRET=votre_secret_scraping
BACKUP_SECRET=steo-elite-backup-2024

# Alertes Discord/Slack (OPTIONNEL)
ALERT_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy

# ===========================================
# NOTES:
# - Ne jamais commit ces valeurs dans Git
# - Utiliser des clés Supabase avec les bonnes permissions
# - SCRAPE_SECRET protège l'API de scraping
# ===========================================`;

  // ============================================
  // 4. INSTRUCTIONS D'INSTALLATION
  // ============================================

  backup.instructions = `
# ===========================================
# STEO ÉLITE - GUIDE D'INSTALLATION COMPLET
# ===========================================

## 1. PRÉREQUIS

- Node.js 18+ installé
- Compte Supabase (gratuit)
- Compte Vercel (gratuit)
- Compte cron-job.org (gratuit)

## 2. CRÉER LE PROJET SUPABASE

1. Aller sur https://supabase.com
2. Créer un nouveau projet
3. Exécuter les scripts SQL (ml_picks, ml_patterns, matches)
4. Récupérer les clés API dans Settings > API

## 3. DÉPLOYER SUR VERCEL

1. Connecter votre repo Git à Vercel
2. Configurer les variables d'environnement
3. Déployer

## 4. CONFIGURER LES CRONS (cron-job.org)

Créer 3 jobs:

Job 1 - Scrape Matchs:
- URL: https://votre-site.vercel.app/api/scrape-trigger
- Schedule: 0 */3 * * * (toutes les 3h)

Job 2 - ML Training:
- URL: https://votre-site.vercel.app/api/ml/train-sports
- Schedule: 0 6 * * * (6h00 chaque jour)

Job 3 - ML Update Results:
- URL: https://votre-site.vercel.app/api/ml/update-results
- Schedule: 0 22 * * * (22h00 chaque jour)

## 5. VÉRIFIER L'INSTALLATION

- Health check: https://votre-site.vercel.app/api/health
- Backup: https://votre-site.vercel.app/api/backup/download?secret=steo-elite-backup-2024

## 6. STRUCTURE DES FICHIERS

/src/app/api/
  /scrape-trigger/route.ts    - Scraping ESPN
  /ml/train-sports/route.ts   - Entraînement ML
  /ml/update-results/route.ts - Mise à jour résultats
  /ml/analyze/route.ts        - Analyse matchs
  /health/route.ts            - Health check
  /system/alerts/route.ts     - Alertes

/src/lib/
  unified-sports-analysis.ts  - Analyse unifiée
  ml-memory-service.ts        - Service ML
  dixonColesModel.ts          - Modèle Football
  mlbModel.ts                 - Modèle Baseball
  nhlAdvancedModel.ts         - Modèle Hockey

## 7. SUPPORT

En cas de problème:
1. Vérifier les logs Vercel
2. Vérifier les tables Supabase
3. Tester les APIs manuellement
`;

  // ============================================
  // 5. CONFIG CRON
  // ============================================

  backup.cronConfig = [
    {
      name: 'Steo Scrape Matchs',
      url: 'https://votre-site.vercel.app/api/scrape-trigger',
      schedule: '0 */3 * * *',
      description: 'Récupère les matchs ESPN toutes les 3h'
    },
    {
      name: 'Steo ML Training',
      url: 'https://votre-site.vercel.app/api/ml/train-sports',
      schedule: '0 6 * * *',
      description: 'Entraîne le modèle ML chaque jour à 6h'
    },
    {
      name: 'Steo ML Update',
      url: 'https://votre-site.vercel.app/api/ml/update-results',
      schedule: '0 22 * * *',
      description: 'Met à jour les résultats chaque jour à 22h'
    },
    {
      name: 'Steo Health Check',
      url: 'https://votre-site.vercel.app/api/health',
      schedule: '0 */6 * * *',
      description: 'Vérifie la santé du système toutes les 6h'
    }
  ];

  return backup;
}

/**
 * POST - Obtenir un résumé du backup
 */
export async function POST(request: NextRequest) {
  const backup = await generateBackup();

  return NextResponse.json({
    success: true,
    summary: {
      filesCount: Object.keys(backup.files).length,
      sqlScriptsCount: Object.keys(backup.sqlScripts).length,
      cronJobsCount: backup.cronConfig.length,
      generatedAt: backup.metadata.generated
    },
    filesList: Object.keys(backup.files),
    instructionsPreview: backup.instructions.substring(0, 500) + '...'
  });
}
