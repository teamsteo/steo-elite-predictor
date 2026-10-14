import { NextRequest, NextResponse } from 'next/server';
import { securityConfig, SESSION_DURATION } from '@/lib/auth';

/**
 * GET - Vérifier la session actuelle
 */
export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get(securityConfig.cookieName)?.value;
    const sessionData = request.cookies.get('steo_elite_session_data')?.value;

    if (!sessionToken || !sessionData) {
      return NextResponse.json({ authenticated: false });
    }

    // Parser les données de session
    const data = JSON.parse(sessionData);
    
    // Vérifier si la session n'a pas expiré
    if (!data.expiry || Date.now() > data.expiry) {
      const response = NextResponse.json({ authenticated: false });
      // Supprimer les cookies expirés
      response.cookies.delete(securityConfig.cookieName);
      response.cookies.delete('steo_elite_session_data');
      return response;
    }

    // Session valide
    return NextResponse.json({
      authenticated: true,
      user: {
        id: 'admin-user',
        email: 'admin@steo-elite.local',
        name: 'Administrateur',
        subscription: 'premium',
      },
      expiresAt: data.expiry,
    });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
