import { NextRequest, NextResponse } from 'next/server';
import { loadUsersData, saveUsersData } from '@/lib/userPersistence';

const CRON_SECRET = process.env.CRON_SECRET || 'secretsteo-elitecron2026';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    const username = searchParams.get('username');
    
    // Vérifier le secret
    if (secret !== CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const data = await loadUsersData();
    const beforeCount = (data.activeSessions || []).length;
    
    if (username) {
      // Supprimer les sessions d'un utilisateur spécifique
      data.activeSessions = (data.activeSessions || []).filter(
        s => s.username.toLowerCase() !== username.toLowerCase()
      );
    } else {
      // Supprimer toutes les sessions
      data.activeSessions = [];
    }
    
    const afterCount = data.activeSessions.length;
    
    await saveUsersData(data);
    
    return NextResponse.json({
      success: true,
      message: `${beforeCount - afterCount} session(s) supprimée(s)`,
      remaining: afterCount
    });
    
  } catch (error) {
    console.error('Erreur clear sessions:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
