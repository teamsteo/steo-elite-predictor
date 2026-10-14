/**
 * Configuration d'authentification
 * Support multi-utilisateurs avec expiration des comptes
 */

import { validateUser } from './users';

// Store pour les sessions actives (en production, utiliser Redis)
const activeSessions = new Map<string, { username: string; createdAt: number }>();

// Limite globale de connexions simultanées
const MAX_GLOBAL_CONNECTIONS = 10;

// Session duration in milliseconds (20 minutes comme configuré dans l'app)
export const SESSION_DURATION = 20 * 60 * 1000;

// Interface pour le retour de verifyCredentials
interface VerifiedUser {
  username: string;
  name: string;
  role: string;
  daysRemaining?: number;
  expiresAt?: string | null;
}

/**
 * Vérifie les identifiants de connexion
 */
export async function verifyCredentials(username: string, password: string): Promise<{
  valid: boolean;
  user?: VerifiedUser;
  error?: string;
}> {
  const result = await validateUser(username, password);

  if (!result.success) {
    return { valid: false, error: result.error };
  }

  const user = result.user!;

  return {
    valid: true,
    user: {
      username: user.login,
      name: user.login, // On utilise le login comme nom
      role: user.role,
      daysRemaining: result.daysRemaining,
      expiresAt: user.expiresAt
    }
  };
}

/**
 * Vérifie si de nouvelles connexions sont autorisées
 * Note: Cette fonction doit être appelée après le chargement des données
 */
export function canCreateNewSession(username: string, user: { isActive: boolean } | null, isExpired: boolean): boolean {
  // Nettoyer les sessions expirées
  const now = Date.now();
  for (const [token, session] of activeSessions.entries()) {
    if (now - session.createdAt > SESSION_DURATION) {
      activeSessions.delete(token);
    }
  }

  // Compter les sessions actives globales
  const totalActiveSessions = activeSessions.size;

  // Vérifier la limite globale
  if (totalActiveSessions >= MAX_GLOBAL_CONNECTIONS) {
    return false;
  }

  // Vérifier que l'utilisateur existe toujours et n'est pas expiré
  if (!user || !user.isActive || isExpired) {
    return false;
  }

  return true;
}

/**
 * Enregistre une nouvelle session
 */
export function registerSession(token: string, username: string): void {
  activeSessions.set(token, { username, createdAt: Date.now() });
}

/**
 * Supprime une session
 */
export function removeSession(token: string): void {
  activeSessions.delete(token);
}

/**
 * Obtient le nombre de sessions actives
 */
export function getActiveSessionsCount(): number {
  return activeSessions.size;
}

/**
 * Génère un token de session simple
 */
export function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash un mot de passe avec SHA-256
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Vérifie si une session est valide
 */
export function isSessionValid(sessionExpiry: number): boolean {
  return Date.now() < sessionExpiry;
}

/**
 * Configuration de sécurité
 */
export const securityConfig = {
  maxLoginAttempts: 5,
  lockoutDuration: 15 * 60 * 1000, // 15 minutes

  cookieName: 'steo_elite_session',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: SESSION_DURATION / 1000,
  },
};
