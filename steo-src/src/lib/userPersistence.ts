/**
 * Persistance JSON pour les utilisateurs
 * 
 * VERSION 2.0 - GitHub désactivé par défaut
 * Les données utilisateurs sont stockées localement par défaut.
 */

import { User } from './users';
import { isGitHubEnabled, GITHUB_CONFIG } from './github-config';

export interface ActivityLog {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  target: string;
  details: string;
}

export interface ActiveSession {
  token: string;
  username: string;
  createdAt: number;
  expiresAt: number;
}

export interface StoredData {
  users: StoredUser[];
  logs: ActivityLog[];
  activeSessions: ActiveSession[];
  lastUpdated: string | null;
}

export interface StoredUser {
  login: string;
  password: string;
  role: 'admin' | 'demo' | 'user';
  firstLoginDate: string | null;
  expiresAt: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
}

let cachedData: StoredData | null = null;

// Fonction pour invalider le cache (utile après une modification)
export function invalidateCache(): void {
  cachedData = null;
  console.log('🔄 Cache utilisateurs invalidé');
}

// Mot de passe hashé avec Node.js crypto (SHA-256)
// admin12 = 114663ab194edcb3f61d409883ce4ae6c3c2f9854194095a5385011d15becbef
const DEFAULT_DATA: StoredData = {
  users: [
    { login: 'admin', password: '114663ab194edcb3f61d409883ce4ae6c3c2f9854194095a5385011d15becbef', role: 'admin', firstLoginDate: null, expiresAt: null, isActive: true, lastLoginAt: null },
  ],
  logs: [],
  activeSessions: [],
  lastUpdated: null
};

export async function loadUsersData(forceReload: boolean = false): Promise<StoredData> {
  if (cachedData && !forceReload) return cachedData;

  // GitHub désactivé par défaut pour éviter le blocage
  if (!isGitHubEnabled()) {
    console.log('📂 User Persistence: GitHub désactivé, utilisation du cache local');
    return cachedData || DEFAULT_DATA;
  }

  const token = GITHUB_CONFIG.token;
  
  // Essayer d'abord avec l'API GitHub (pour les repos privés)
  if (token) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_CONFIG.repo}/contents/data/users.json?ref=${GITHUB_CONFIG.branch}`,
        { 
          headers: { 
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.raw'
          },
          next: { revalidate: 0 }
        }
      );
      if (res.ok) {
        cachedData = await res.json();
        console.log('📂 Données chargées depuis GitHub API');
        return cachedData!;
      }
    } catch (e) {
      console.error('Erreur chargement API GitHub:', e);
    }
  }

  // Fallback: essayer raw.githubusercontent.com (pour les repos publics)
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/data/users.json`,
      { next: { revalidate: 0 } }
    );
    if (res.ok) {
      cachedData = await res.json();
      console.log('📂 Données chargées depuis GitHub Raw');
      return cachedData!;
    }
  } catch (e) {
    console.error('Erreur chargement:', e);
  }
  
  console.log('📂 Utilisation des données par défaut');
  return DEFAULT_DATA;
}

export async function saveUsersData(data: StoredData): Promise<boolean> {
  // Mettre à jour le cache
  cachedData = data;

  // GitHub désactivé par défaut
  if (!isGitHubEnabled()) {
    console.log('📂 User Persistence: GitHub désactivé, données en cache local uniquement');
    // En développement, sauvegarder localement
    if (process.env.NODE_ENV === 'development') {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const filePath = path.join(process.cwd(), 'data', 'users.json');
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log('💾 Sauvegarde locale');
      } catch {}
    }
    return true;
  }

  const token = GITHUB_CONFIG.token;
  if (!token) {
    console.warn('⚠️ GITHUB_TOKEN non configuré');
    return true;
  }

  try {
    const getRes = await fetch(
      `https://api.github.com/repos/${GITHUB_CONFIG.repo}/contents/data/users.json`,
      { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } }
    );
    let sha = '';
    if (getRes.ok) sha = (await getRes.json()).sha;

    const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
    const saveRes = await fetch(
      `https://api.github.com/repos/${GITHUB_CONFIG.repo}/contents/data/users.json`,
      {
        method: 'PUT',
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `📊 MAJ utilisateurs ${new Date().toLocaleString('fr-FR')}`,
          content,
          sha: sha || undefined,
          branch: GITHUB_CONFIG.branch
        })
      }
    );
    
    if (saveRes.ok) {
      console.log('✅ Données sauvegardées sur GitHub');
    }
    return saveRes.ok;
  } catch (e) {
    console.error('Erreur sauvegarde GitHub:', e);
    return false;
  }
}

export async function addActivityLog(action: string, actor: string, target: string, details: string): Promise<void> {
  const data = await loadUsersData();
  data.logs = [{
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toISOString(),
    action, actor, target, details
  }, ...data.logs].slice(0, 100);
  data.lastUpdated = new Date().toISOString();
  await saveUsersData(data);
}

export async function getActivityLogs(limit: number = 50): Promise<ActivityLog[]> {
  const data = await loadUsersData();
  return (data.logs || []).slice(0, limit);
}

export function storedToUsers(stored: StoredUser[]): Map<string, User> {
  const map = new Map<string, User>();
  stored.forEach(u => map.set(u.login.toLowerCase(), { ...u }));
  return map;
}

export function usersToStored(users: Map<string, User>): StoredUser[] {
  return Array.from(users.values());
}

/**
 * Nettoie les sessions expirées
 */
export async function cleanupExpiredSessions(): Promise<void> {
  const data = await loadUsersData();
  const now = Date.now();
  const validSessions = (data.activeSessions || []).filter(s => s.expiresAt > now);
  
  if (validSessions.length !== (data.activeSessions || []).length) {
    data.activeSessions = validSessions;
    data.lastUpdated = new Date().toISOString();
    await saveUsersData(data);
    console.log(`🧹 ${data.activeSessions.length - validSessions.length} sessions expirées supprimées`);
  }
}

/**
 * Vérifie si un utilisateur a déjà une session active
 * Retourne true si l'utilisateur a une session active
 */
export async function hasActiveSession(username: string): Promise<boolean> {
  await cleanupExpiredSessions();
  const data = await loadUsersData();
  const now = Date.now();
  const userSessions = (data.activeSessions || []).filter(
    s => s.username.toLowerCase() === username.toLowerCase() && s.expiresAt > now
  );
  return userSessions.length > 0;
}

/**
 * Enregistre une nouvelle session (déconnecte l'ancienne si existe)
 */
export async function registerSession(token: string, username: string, durationMs: number): Promise<void> {
  const data = await loadUsersData();
  const now = Date.now();
  
  // Supprimer les anciennes sessions de cet utilisateur
  data.activeSessions = (data.activeSessions || []).filter(
    s => s.username.toLowerCase() !== username.toLowerCase()
  );
  
  // Ajouter la nouvelle session
  data.activeSessions.push({
    token,
    username: username.toLowerCase(),
    createdAt: now,
    expiresAt: now + durationMs
  });
  
  data.lastUpdated = new Date().toISOString();
  await saveUsersData(data);
  console.log(`🔐 Session enregistrée pour ${username}`);
}

/**
 * Supprime une session (logout)
 */
export async function removeSession(token: string): Promise<void> {
  const data = await loadUsersData();
  const sessions = (data.activeSessions || []).filter(s => s.token !== token);
  
  if (sessions.length !== (data.activeSessions || []).length) {
    data.activeSessions = sessions;
    data.lastUpdated = new Date().toISOString();
    await saveUsersData(data);
    console.log(`🚪 Session supprimée`);
  }
}

/**
 * Vérifie si un token de session est valide
 */
export async function isSessionValid(token: string): Promise<boolean> {
  const data = await loadUsersData();
  const now = Date.now();
  const session = (data.activeSessions || []).find(s => s.token === token && s.expiresAt > now);
  return !!session;
}

/**
 * Obtient le nombre de sessions actives
 */
export async function getActiveSessionsCount(): Promise<number> {
  await cleanupExpiredSessions();
  const data = await loadUsersData();
  return (data.activeSessions || []).length;
}
