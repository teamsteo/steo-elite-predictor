import { NextRequest, NextResponse } from 'next/server';
import { saveUsersData, invalidateCache } from '@/lib/userPersistence';

/**
 * Endpoint d'urgence pour réinitialiser les utilisateurs
 * SECURITY FIX: Uses ADMIN_SECRET env var (no hardcoded fallback),
 * timing-safe comparison, and no credential leak in response.
 */
const ADMIN_SECRET = process.env.ADMIN_SECRET;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function POST(request: NextRequest) {
  try {
    // SECURITY FIX: Require ADMIN_SECRET env var — no hardcoded fallback
    if (!ADMIN_SECRET) {
      console.error('ADMIN_SECRET environment variable is not set');
      return NextResponse.json({ error: 'Configuration error' }, { status: 500 });
    }

    const body = await request.json();
    const { secret } = body;

    if (!secret || typeof secret !== 'string') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // SECURITY FIX: Timing-safe comparison instead of !==
    if (!timingSafeEqual(secret, ADMIN_SECRET)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // Reset to admin user — password hash NOT exposed in response
    const newData = {
      users: [
        {
          login: 'admin',
          // SHA-256 of default password — must be changed on first login
          password: '114663ab194edcb3f61d409883ce4ae6c3c2f9854194095a5385011d15becbef',
          role: 'admin' as const,
          firstLoginDate: null,
          expiresAt: null,
          isActive: true,
          lastLoginAt: null
        }
      ],
      logs: [
        {
          id: Date.now().toString(36),
          timestamp: new Date().toISOString(),
          action: 'RESET',
          actor: 'system',
          target: 'all',
          details: 'Réinitialisation complète des utilisateurs'
        }
      ],
      activeSessions: [],
      lastUpdated: new Date().toISOString()
    };

    const success = await saveUsersData(newData);
    
    if (success) {
      invalidateCache();
      // SECURITY FIX: Do NOT leak credentials in response
      return NextResponse.json({ 
        success: true, 
        message: 'Utilisateurs réinitialisés avec succès. Changez le mot de passe admin immédiatement.' 
      });
    } else {
      return NextResponse.json({ 
        success: false, 
        error: 'Erreur lors de la sauvegarde' 
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Erreur reset users:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
