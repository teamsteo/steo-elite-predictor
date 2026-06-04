#!/usr/bin/env node
/**
 * Script de build - Configure et build l'application
 * Gère automatiquement le schéma Prisma selon l'environnement
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVercel = process.env.VERCEL === '1';
const isProduction = process.env.NODE_ENV === 'production' || isVercel;

console.log('🚀 Build Steo Elite Predictor');
console.log(`   Environnement: ${isProduction ? 'Production' : 'Développement'}`);

// Étape 1: Configurer le bon schéma Prisma
if (isVercel || isProduction) {
  const prodSchemaPath = path.join(__dirname, '..', 'prisma', 'schema.prod.prisma');
  const targetPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
  
  if (fs.existsSync(prodSchemaPath)) {
    console.log('📦 Configuration schema PostgreSQL...');
    fs.copyFileSync(prodSchemaPath, targetPath);
  }
}

// Étape 2: Générer le client Prisma
console.log('🔨 Génération Prisma Client...');
try {
  execSync('npx prisma generate', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Erreur Prisma generate');
  process.exit(1);
}

// Étape 3: Build Next.js
console.log('🏗️ Build Next.js...');
try {
  execSync('next build', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Erreur Next.js build');
  process.exit(1);
}

console.log('✅ Build terminé avec succès!');
