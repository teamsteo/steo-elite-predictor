// Middleware to protect routes
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/api/auth', '/api/cron', '/api/scrape-trigger', '/api/ml/', '/api/system/', '/api/espn-status', '/api/health', '/api/backup/'];
const STATIC_PATHS = ['/_next', '/favicon.ico', '/images', '/fonts'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static files
  if (STATIC_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Allow public paths (API routes)
  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // La page d'accueil (/) gère elle-même l'authentification avec steo_elite_session_data
  // Le dashboard intégré vérifie le cookie et affiche la page de connexion si nécessaire
  // Donc on laisse passer toutes les requêtes vers les pages

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
