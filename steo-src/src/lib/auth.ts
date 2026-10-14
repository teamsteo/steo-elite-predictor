/**
 * Configuration d'authentification
 * Support multi-utilisateurs avec expiration des comptes
 */

import { validateUser, type User } from './users';
import { cookies } from 'next/headers';

// Store pour les sessions actives (en production, utiliser Redis)
const activeSessions = new Map<string, { username: string; createdAt: number }>();

// Limite globale de connexions simultanées
const MAX_GLOBAL_CONNECTIONS = 10;

// Session duration in milliseconds (20 minutes comme configuré dans l'app)
export const SESSION_DURATION = 20 * 60 * 1000;

// Interface pour le retour de verifyCredentials
export interface VerifiedUser {
  username: string;
  name: string;
  role: string;
  daysRemaining?: number;
  expiresAt?: string | null;
}

/**
 * Génère un token de session aléatoire
 */
export function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Vérifie les identifiants d'un utilisateur
 */
export async function verifyCredentials(username: string, password: string): Promise<{
  valid: boolean;
  user?: VerifiedUser;
  error?: string;
}> {
  const result = await validateUser(username, password);
  
  if (result.success && result.user) {
    return {
      valid: true,
      user: {
        username: result.user.login,
        name: result.user.login,
        role: result.user.role,
        daysRemaining: result.daysRemaining,
        expiresAt: result.user.expiresAt
      }
    };
  }
  
  return {
    valid: false,
    error: result.error
  };
}

/**
 * Vérifie si de nouvelles connexions sont autorisées
 */
export function canAcceptNewConnections(): boolean {
  const totalActiveSessions = activeSessions.size;
  
  if (totalActiveSessions >= MAX_GLOBAL_CONNECTIONS) {
    return false;
  }
  
  return true;
}

/**
 * Enregistre une nouvelle session
 */
export function registerSession(token: string, username: string): void {
  activeSessions.set(token, {
    username,
    createdAt: Date.now()
  });
}

/**
 * Supprime une session
 */
export function removeSession(token: string): void {
  activeSessions.delete(token);
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

/**
 * Récupère la session courante
 */
export async function getSession(): Promise<{
  user: {
    username: string;
    name: string;
    role: string;
    daysRemaining?: number;
    expiresAt?: string | null;
  };
  expiresAt: number;
} | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(securityConfig.cookieName)?.value;
    
    if (!token) return null;
    
    const session = activeSessions.get(token);
    
    if (!session) return null;
    
    // Vérifier expiration
    if (Date.now() - session.createdAt >= SESSION_DURATION) {
      activeSessions.delete(token);
      return null;
    }
    
    // Récupérer les infos utilisateur
    const result = await validateUser(session.username, '');
    if (result.success && result.user) {
      return {
        user: {
          username: result.user.login,
          name: result.user.login,
          role: result.user.role,
          daysRemaining: result.daysRemaining,
          expiresAt: result.user.expiresAt
        },
        expiresAt: session.createdAt + SESSION_DURATION
      };
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Efface le cookie de session
 */
export async function clearSessionCookie(): Promise<void> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(securityConfig.cookieName)?.value;
    
    if (token) {
      activeSessions.delete(token);
    }
    
    cookieStore.delete(securityConfig.cookieName);
  } catch {
    // Ignore errors
  }
}
