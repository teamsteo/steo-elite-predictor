#!/usr/bin/env node
/**
 * Script postinstall - Configure Prisma selon l'environnement
 * - Vercel/Production: Utilise PostgreSQL (schema.prod.prisma)
 * - Local/Développement: Utilise SQLite (schema.prisma par défaut)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVercel = process.env.VERCEL === '1';
const isProduction = process.env.NODE_ENV === 'production';

console.log('🔧 Configuration Prisma...');
console.log(`   VERCEL: ${isVercel ? 'Oui' : 'Non'}`);
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'non défini'}`);

if (isVercel || isProduction) {
  // Production: Utiliser le schema PostgreSQL
  const prodSchemaPath = path.join(__dirname, '..', 'prisma', 'schema.prod.prisma');
  const targetPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
  
  if (fs.existsSync(prodSchemaPath)) {
    console.log('📦 Copie du schema PostgreSQL pour production...');
    fs.copyFileSync(prodSchemaPath, targetPath);
  }
}

// Générer le client Prisma
try {
  console.log('🔨 Génération du client Prisma...');
  execSync('npx prisma generate', { stdio: 'inherit' });
  console.log('✅ Client Prisma généré avec succès');
} catch (error) {
  console.error('❌ Erreur lors de la génération Prisma:', error.message);
  process.exit(1);
}
