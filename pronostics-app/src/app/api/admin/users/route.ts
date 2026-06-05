import { NextRequest, NextResponse } from 'next/server';
import {
  getAllUsers,
  getUserStats,
  updateUser,
  deleteUser,
  addUser,
  extendUserValidity,
  getActivityLogs
} from '@/lib/users';

/**
 * Vérifie si l'utilisateur est admin via le cookie de session
 */
function isAdmin(request: NextRequest): { isAdmin: boolean; username?: string } {
  const sessionData = request.cookies.get('steo_elite_session_data');

  if (!sessionData) {
    return { isAdmin: false };
  }

  try {
    const data = JSON.parse(decodeURIComponent(sessionData.value));
    return {
      isAdmin: data.role === 'admin',
      username: data.user
    };
  } catch {
    return { isAdmin: false };
  }
}

/**
 * GET - Récupérer tous les utilisateurs et logs
 */
export async function GET(request: NextRequest) {
  const { isAdmin: admin } = isAdmin(request);

  if (!admin) {
    return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
  }

  try {
    const users = await getAllUsers();
    const stats = await getUserStats();
    const logs = await getActivityLogs(50);

    return NextResponse.json({ users, stats, logs });
  } catch (error) {
    console.error('Erreur GET admin/users:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * POST - Actions sur les utilisateurs
 */
export async function POST(request: NextRequest) {
  const { isAdmin: admin, username: actor } = isAdmin(request);

  if (!admin) {
    return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { action, login, data } = body;

    switch (action) {
      case 'extend': {
        const months = data?.months || 1;
        const success = await extendUserValidity(login, months, actor || 'admin');
        return NextResponse.json({
          success,
          message: success ? `Validité prolongée de ${months} mois pour ${login}` : 'Impossible de prolonger ce compte'
        }, { status: success ? 200 : 400 });
      }

      case 'deactivate': {
        const success = await updateUser(login, { isActive: false }, actor || 'admin');
        return NextResponse.json({
          success,
          message: success ? `Compte ${login} désactivé` : 'Impossible de désactiver ce compte'
        }, { status: success ? 200 : 400 });
      }

      case 'reactivate': {
        const success = await updateUser(login, { isActive: true }, actor || 'admin');
        return NextResponse.json({
          success,
          message: success ? `Compte ${login} réactivé` : 'Impossible de réactiver ce compte'
        }, { status: success ? 200 : 400 });
      }

      case 'add': {
        if (!data?.login || !data?.password) {
          return NextResponse.json({ success: false, error: 'Login et mot de passe requis' }, { status: 400 });
        }
        const success = await addUser({
          login: data.login,
          password: data.password,
          role: data.role || 'user',
          isActive: data.isActive ?? true
        }, actor || 'admin');
        return NextResponse.json({
          success,
          message: success ? `Utilisateur ${data.login} créé` : 'Cet identifiant existe déjà'
        }, { status: success ? 200 : 400 });
      }

      case 'update': {
        const success = await updateUser(login, {
          password: data?.password,
          role: data?.role,
          isActive: data?.isActive
        }, actor || 'admin');
        return NextResponse.json({
          success,
          message: success ? `Utilisateur ${login} modifié` : 'Impossible de modifier cet utilisateur'
        }, { status: success ? 200 : 400 });
      }

      case 'delete': {
        const success = await deleteUser(login, actor || 'admin');
        return NextResponse.json({
          success,
          message: success ? `Utilisateur ${login} supprimé` : 'Impossible de supprimer cet utilisateur'
        }, { status: success ? 200 : 400 });
      }

      default:
        return NextResponse.json({ success: false, error: 'Action inconnue' }, { status: 400 });
    }
  } catch (error) {
    console.error('Erreur POST admin/users:', error);
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}
