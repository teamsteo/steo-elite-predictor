import { NextRequest, NextResponse } from 'next/server';
import { validateUser } from '@/lib/users';
import { hasActiveSession, registerSession } from '@/lib/userPersistence';

const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const SESSION_MS = 20 * 60 * 1000;

function isRateLimited(ip: string): boolean {
  const a = loginAttempts.get(ip);
  if (!a) return false;
  if (Date.now() - a.lastAttempt > LOCKOUT_MS) { loginAttempts.delete(ip); return false; }
  return a.count >= MAX_ATTEMPTS;
}

function recordAttempt(ip: string, success: boolean) {
  if (success) { loginAttempts.delete(ip); return; }
  const a = loginAttempts.get(ip);
  if (a) {
    a.count++;
    a.lastAttempt = Date.now();
  } else {
    loginAttempts.set(ip, { count: 1, lastAttempt: Date.now() });
  }
}

function genToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

  if (isRateLimited(ip)) {
    return NextResponse.json({ success: false, error: 'Trop de tentatives. Réessayez dans 15 min.' }, { status: 429 });
  }

  try {
    const { username, password } = await request.json();
    if (!username || !password) {
      recordAttempt(ip, false);
      return NextResponse.json({ success: false, error: 'Identifiant et mot de passe requis' }, { status: 400 });
    }

    // ===== VÉRIFICATION SESSION ACTIVE =====
    const alreadyConnected = await hasActiveSession(username.trim());
    if (alreadyConnected) {
      recordAttempt(ip, false);
      return NextResponse.json({ 
        success: false, 
        error: 'Ce compte est déjà connecté sur un autre appareil. Veuillez d\'abord vous déconnecter.' 
      }, { status: 403 });
    }

    const result = await validateUser(username.trim(), password);

    if (!result.success) {
      recordAttempt(ip, false);
      await new Promise(r => setTimeout(r, 500));
      return NextResponse.json({ success: false, error: result.error }, { status: 401 });
    }

    recordAttempt(ip, true);

    const token = genToken();
    const expiry = Date.now() + SESSION_MS;
    const subscription = result.user!.role === 'admin' || result.user!.role === 'demo' ? 'premium' : 'standard';

    // ===== ENREGISTRER LA SESSION =====
    await registerSession(token, result.user!.login, SESSION_MS);

    const res = NextResponse.json({
      success: true,
      user: {
        id: `${result.user!.role}-user`,
        username: result.user!.login,
        name: result.user!.login,
        role: result.user!.role,
        subscription,
        daysRemaining: result.daysRemaining,
        expiresAt: result.user!.expiresAt
      }
    });

    res.cookies.set('steo_elite_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', expires: new Date(expiry) });
    res.cookies.set('steo_elite_session_data', JSON.stringify({ expiry, user: result.user!.login, role: result.user!.role, daysRemaining: result.daysRemaining }), { httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: SESSION_MS / 1000 });

    return res;
  } catch (e) {
    console.error('Login error:', e);
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}
