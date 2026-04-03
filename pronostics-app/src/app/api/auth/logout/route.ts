import { NextRequest, NextResponse } from 'next/server';
import { removeSession } from '@/lib/userPersistence';

/**
 * POST - Déconnexion
 * Supprime les cookies de session et la session enregistrée
 */
export async function POST(request: NextRequest) {
  // Récupérer le token du cookie
  const token = request.cookies.get('steo_elite_session')?.value;
  
  // Supprimer la session du stockage
  if (token) {
    await removeSession(token);
  }
  
  const response = NextResponse.json({ success: true });
  
  // Supprimer les cookies
  response.cookies.delete('steo_elite_session');
  response.cookies.delete('steo_elite_session_data');
  
  return response;
}
