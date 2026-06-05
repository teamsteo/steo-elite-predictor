/**
 * Système de gestion des utilisateurs avec persistance JSON
 */

export interface User {
  login: string;
  password: string;
  role: 'admin' | 'demo' | 'user';
  firstLoginDate: string | null;
  expiresAt: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
}

const USER_VALIDITY_MONTHS = 3;

let activeUsers: Map<string, User> = new Map();
let isLoaded = false;

// Fonction pour forcer le rechargement des données
export async function forceReloadUsers(): Promise<void> {
  isLoaded = false;
  activeUsers = new Map();
  await loadUsersFromStorage();
}

const DEFAULT_USERS: User[] = [
  { login: 'admin', password: 'admin123', role: 'admin', firstLoginDate: null, expiresAt: null, isActive: true, lastLoginAt: null },
  { login: 'demo', password: 'demo123', role: 'demo', firstLoginDate: null, expiresAt: null, isActive: true, lastLoginAt: null },
  { login: 'DD', password: '112233', role: 'user', firstLoginDate: null, expiresAt: null, isActive: true, lastLoginAt: null },
  { login: 'Lyno', password: '223345', role: 'user', firstLoginDate: null, expiresAt: null, isActive: true, lastLoginAt: null },
  { login: 'Elcapo', password: '234673', role: 'user', firstLoginDate: null, expiresAt: null, isActive: true, lastLoginAt: null },
  { login: 'PJ', password: '775553', role: 'user', firstLoginDate: null, expiresAt: null, isActive: true, lastLoginAt: null },
  { login: 'Hans', password: '547633', role: 'user', firstLoginDate: null, expiresAt: null, isActive: true, lastLoginAt: null },
  { login: 'patco', password: '12345', role: 'user', firstLoginDate: null, expiresAt: null, isActive: true, lastLoginAt: null },
  { login: 'lebeni', password: '78945', role: 'user', firstLoginDate: null, expiresAt: null, isActive: true, lastLoginAt: null },
];

async function loadUsersFromStorage(): Promise<void> {
  if (isLoaded) return;
  try {
    const { loadUsersData, storedToUsers } = await import('./userPersistence');
    const data = await loadUsersData();
    if (data.users && data.users.length > 0) {
      activeUsers = storedToUsers(data.users);
    } else {
      DEFAULT_USERS.forEach(u => activeUsers.set(u.login.toLowerCase(), { ...u }));
    }
  } catch {
    DEFAULT_USERS.forEach(u => activeUsers.set(u.login.toLowerCase(), { ...u }));
  }
  isLoaded = true;
}

async function saveUsersToStorage(): Promise<boolean> {
  try {
    const { saveUsersData, loadUsersData, usersToStored } = await import('./userPersistence');
    const data = await loadUsersData();
    data.users = usersToStored(activeUsers);
    data.lastUpdated = new Date().toISOString();
    return await saveUsersData(data);
  } catch {
    return false;
  }
}

async function logAction(action: string, actor: string, target: string, details: string): Promise<void> {
  try {
    const { addActivityLog } = await import('./userPersistence');
    await addActivityLog(action, actor, target, details);
  } catch {}
}

export function getUserByLogin(login: string): User | undefined {
  return activeUsers.get(login.toLowerCase());
}

export function isAccountExpired(user: User): boolean {
  if (user.role === 'admin' || user.role === 'demo') return false;
  if (!user.expiresAt) return false;
  return new Date() > new Date(user.expiresAt);
}

export async function validateUser(login: string, password: string): Promise<{
  success: boolean;
  user?: User;
  error?: string;
  daysRemaining?: number;
}> {
  await loadUsersFromStorage();
  const user = getUserByLogin(login);

  if (!user) return { success: false, error: 'Identifiant incorrect' };
  if (user.password !== password) return { success: false, error: 'Mot de passe incorrect' };
  if (!user.isActive) return { success: false, error: 'Compte désactivé' };
  if (isAccountExpired(user)) return { success: false, error: 'Compte expiré' };

  const now = new Date();

  if (!user.firstLoginDate && user.role === 'user') {
    user.firstLoginDate = now.toISOString();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + USER_VALIDITY_MONTHS);
    user.expiresAt = expiresAt.toISOString();
    await logAction('FIRST_LOGIN', login, login, `Expire le ${expiresAt.toLocaleDateString('fr-FR')}`);
  }

  user.lastLoginAt = now.toISOString();

  let daysRemaining: number | undefined;
  if (user.expiresAt && user.role === 'user') {
    const diff = new Date(user.expiresAt).getTime() - now.getTime();
    daysRemaining = Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  await saveUsersToStorage();
  await logAction('LOGIN', login, login, 'Connexion');

  return { success: true, user: { ...user, password: '' }, daysRemaining };
}

export async function getAllUsers(): Promise<Omit<User, 'password'>[]> {
  // Forcer le rechargement pour avoir les dernières données depuis GitHub
  isLoaded = false;
  await loadUsersFromStorage();
  return Array.from(activeUsers.values()).map(u => ({ ...u, password: '' }));
}

export async function getUserStats() {
  await loadUsersFromStorage();
  const users = Array.from(activeUsers.values());
  return {
    total: users.length,
    active: users.filter(u => u.isActive && !isAccountExpired(u)).length,
    expired: users.filter(u => isAccountExpired(u)).length,
    admin: users.filter(u => u.role === 'admin').length,
    demo: users.filter(u => u.role === 'demo').length,
    regular: users.filter(u => u.role === 'user').length
  };
}

export async function extendUserValidity(login: string, months: number, actor: string = 'admin'): Promise<boolean> {
  // Forcer le rechargement pour avoir les dernières données
  isLoaded = false;
  await loadUsersFromStorage();
  const user = getUserByLogin(login);
  if (!user || user.role !== 'user') return false;

  const now = new Date();
  const currentExpiry = user.expiresAt ? new Date(user.expiresAt) : now;
  currentExpiry.setMonth(currentExpiry.getMonth() + months);
  user.expiresAt = currentExpiry.toISOString();

  const saved = await saveUsersToStorage();
  if (saved) {
    await logAction('EXTEND', actor, login, `+${months} mois → ${currentExpiry.toLocaleDateString('fr-FR')}`);
    isLoaded = false; // Invalider le cache après modification
  }
  return saved;
}

export async function updateUser(login: string, data: Partial<{ password: string; role: 'admin' | 'demo' | 'user'; isActive: boolean }>, actor: string = 'admin'): Promise<boolean> {
  // Forcer le rechargement pour avoir les dernières données
  isLoaded = false;
  await loadUsersFromStorage();
  const user = getUserByLogin(login);
  if (!user || (user.role === 'admin' && login.toLowerCase() === 'admin')) return false;

  const changes: string[] = [];
  if (data.password) { user.password = data.password; changes.push('mdp modifié'); }
  if (data.role) { user.role = data.role; changes.push(`rôle: ${data.role}`); }
  if (data.isActive !== undefined) { user.isActive = data.isActive; changes.push(data.isActive ? 'activé' : 'désactivé'); }

  const saved = await saveUsersToStorage();
  if (saved) {
    await logAction('UPDATE', actor, login, changes.join(', ') || 'modifié');
    isLoaded = false; // Invalider le cache après modification
  }
  return saved;
}

export async function addUser(data: { login: string; password: string; role: 'admin' | 'demo' | 'user'; isActive: boolean }, actor: string = 'admin'): Promise<boolean> {
  // Forcer le rechargement pour avoir les dernières données
  isLoaded = false;
  await loadUsersFromStorage();
  
  if (activeUsers.has(data.login.toLowerCase())) return false;

  activeUsers.set(data.login.toLowerCase(), {
    login: data.login,
    password: data.password,
    role: data.role,
    firstLoginDate: null,
    expiresAt: null,
    isActive: data.isActive,
    lastLoginAt: null
  });

  const saved = await saveUsersToStorage();
  if (saved) {
    await logAction('CREATE', actor, data.login, `Rôle: ${data.role}`);
    // Invalider le cache pour forcer le rechargement au prochain appel
    isLoaded = false;
  }
  return saved;
}

export async function deleteUser(login: string, actor: string = 'admin'): Promise<boolean> {
  await loadUsersFromStorage();
  const user = getUserByLogin(login);
  if (!user || (user.role === 'admin' && login.toLowerCase() === 'admin')) return false;

  activeUsers.delete(login.toLowerCase());
  await saveUsersToStorage();
  await logAction('DELETE', actor, login, 'Supprimé');
  return true;
}

export async function getActivityLogs(limit: number = 50) {
  try {
    const { getActivityLogs: getLogs } = await import('./userPersistence');
    return await getLogs(limit);
  } catch {
    return [];
  }
}

if (typeof window === 'undefined') {
  loadUsersFromStorage().catch(() => {});
}
