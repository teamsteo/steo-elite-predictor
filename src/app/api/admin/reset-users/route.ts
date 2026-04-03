import { NextRequest, NextResponse } from 'next/server';
import { saveUsersData, invalidateCache } from '@/lib/userPersistence';

/**
 * Endpoint d'urgence pour réinitialiser les utilisateurs
 * Usage: POST /api/admin/reset-users avec { "secret": "elite-reset-2026" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { secret } = body;

    // Secret simple pour éviter les abus
    if (secret !== 'elite-reset-2026') {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // Nouvel utilisateur admin avec mot de passe hashé (SHA-256 de "admin12")
    const newData = {
      users: [
        {
          login: 'admin',
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
      return NextResponse.json({ 
        success: true, 
        message: 'Utilisateurs réinitialisés. Nouveau compte: admin / admin12' 
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
