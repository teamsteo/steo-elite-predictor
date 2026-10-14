/**
 * Persistance JSON sur GitHub pour les utilisateurs
 */

import { User } from './users';

const GITHUB_REPO = 'steohidy/my-project';
const GITHUB_BRANCH = 'master';
const DATA_FILE_PATH = 'data/users.json';

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

const DEFAULT_DATA: StoredData = {
  users: [
    { login: 'admin', password: 'admin123', role: 'admin', firstLoginDate: null, expiresAt: null, isActive: true, lastLoginAt: null },
    { login: 'demo', password: 'demo123', role: 'demo', firstLoginDate: null, expiresAt: null, isActive: true, lastLoginAt: null },
    { login: 'DD', password: '112233', role: 'user', firstLoginDate: null, expiresAt: null, isActive: true, lastLoginAt: null },
    { login: 'Lyno', password: '223345', role: 'user', firstLoginDate: null, expiresAt: null, isActive: true, lastLoginAt: null },
    { login: 'Elcapo', password: '234673', role: 'user', firstLoginDate: null, expiresAt: null, isActive: true, lastLoginAt: null },
    { login: 'PJ', password: '775553', role: 'user', firstLoginDate: null, expiresAt: null, isActive: true, lastLoginAt: null },
    { login: 'Hans', password: '547633', role: 'user', firstLoginDate: null, expiresAt: null, isActive: true, lastLoginAt: null },
    { login: 'patco', password: '12345', role: 'user', firstLoginDate: null, expiresAt: null, isActive: true, lastLoginAt: null },
    { login: 'lebeni', password: '78945', role: 'user', firstLoginDate: null, expiresAt: null, isActive: true, lastLoginAt: null },
  ],
  logs: [],
  activeSessions: [],
  lastUpdated: null
};

export async function loadUsersData(forceReload: boolean = false): Promise<StoredData> {
  if (cachedData && !forceReload) return cachedData;

  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${DATA_FILE_PATH}`,
      { next: { revalidate: 0 } } // Désactiver le cache Next.js
    );
    if (res.ok) {
      cachedData = await res.json();
      console.log('📂 Données chargées depuis GitHub');
      return cachedData!;
    }
  } catch (e) {
    console.error('Erreur chargement:', e);
  }
  return DEFAULT_DATA;
}

export async function saveUsersData(data: StoredData): Promise<boolean> {
  // Invalider le cache avant sauvegarde
  cachedData = null;
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    console.warn('⚠️ GITHUB_TOKEN non configuré');
    if (process.env.NODE_ENV === 'development') {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const filePath = path.join(process.cwd(), DATA_FILE_PATH);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log('💾 Sauvegarde locale');
        cachedData = data;
      } catch {}
    }
    return true;
  }

  try {
    const getRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${DATA_FILE_PATH}`,
      { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' } }
    );
    let sha = '';
    if (getRes.ok) sha = (await getRes.json()).sha;

    const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
    const saveRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${DATA_FILE_PATH}`,
      {
        method: 'PUT',
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `📊 MAJ utilisateurs ${new Date().toLocaleString('fr-FR')}`,
          content,
          sha: sha || undefined,
          branch: GITHUB_BRANCH
        })
      }
    );
    
    if (saveRes.ok) {
      // Mettre à jour le cache local après sauvegarde réussie
      cachedData = data;
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
