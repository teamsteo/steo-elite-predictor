import { NextResponse } from 'next/server';
import BankrollStore, { calculateStats, addTransaction, getBankroll } from '@/lib/bankrollStore';

/**
 * GET - Récupérer la bankroll avec statistiques complètes
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default';
    const action = searchParams.get('action');
    
    // Action: statistiques détaillées
    if (action === 'stats') {
      const stats = calculateStats(userId);
      return NextResponse.json(stats);
    }
    
    // Action: statistiques par sport
    if (action === 'bySport') {
      const stats = calculateStats(userId);
      return NextResponse.json(stats.bySport);
    }
    
    // Action: historique paginé
    if (action === 'history') {
      const bankroll = getBankroll(userId);
      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '50');
      const offset = (page - 1) * limit;
      
      const transactions = bankroll.transactions
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(offset, offset + limit);
      
      return NextResponse.json({
        transactions,
        total: bankroll.transactions.length,
        page,
        totalPages: Math.ceil(bankroll.transactions.length / limit),
      });
    }
    
    // Par défaut: retourner bankroll complet avec stats
    const bankroll = getBankroll(userId);
    const stats = calculateStats(userId);
    
    return NextResponse.json({
      balance: bankroll.balance,
      initialDeposit: bankroll.initialDeposit,
      transactions: bankroll.transactions.slice(0, 50), // Dernières 50 transactions
      stats: {
        roi: stats.roi,
        winRate: stats.winRate,
        profitLoss: stats.profitLoss,
        totalBets: stats.totalBets,
        totalWinnings: stats.totalWinnings,
        totalLosses: stats.totalLosses,
        avgOdds: stats.avgOdds,
        currentStreak: stats.currentStreak,
        bestWin: stats.bestWin,
        worstLoss: stats.worstLoss,
        bySport: stats.bySport,
        daily: stats.daily,
        weekly: stats.weekly,
        monthly: stats.monthly,
      },
      lastUpdated: bankroll.lastUpdated,
    });
    
  } catch (error) {
    console.error('Erreur GET bankroll:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/**
 * POST - Mettre à jour la bankroll
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, amount, description, action, userId = 'default', predictionId, odds, sport } = body;
    
    // Action de réinitialisation
    if (action === 'reset') {
      BankrollStore.reset(userId);
      return NextResponse.json({
        success: true,
        message: 'Bankroll réinitialisée',
        balance: 0,
      });
    }
    
    // Valider le type
    const validTypes = ['deposit', 'withdrawal', 'bet', 'winning', 'bet_loss', 'bonus'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: 'Invalid transaction type' }, { status: 400 });
    }
    
    // Valider le montant
    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }
    
    // Ajouter la transaction
    const transaction = addTransaction(userId, {
      type,
      amount,
      description,
      predictionId,
      odds,
      sport,
    });
    
    // Récupérer les stats mises à jour
    const stats = calculateStats(userId);
    
    return NextResponse.json({
      success: true,
      transaction,
      balance: stats.currentBalance,
      stats: {
        roi: stats.roi,
        winRate: stats.winRate,
        profitLoss: stats.profitLoss,
      },
    });
    
  } catch (error) {
    console.error('Erreur POST bankroll:', error);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

/**
 * PUT - Mettre à jour après résultat de pronostic
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { userId = 'default', predictionId, isWin, stake, odds, sport } = body;
    
    if (!predictionId || typeof isWin !== 'boolean') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // Mettre à jour le bankroll
    BankrollStore.updateAfterResult(userId, predictionId, isWin, stake, odds, sport);
    
    const stats = calculateStats(userId);
    
    return NextResponse.json({
      success: true,
      message: isWin ? 'Gain enregistré' : 'Perte enregistrée',
      balance: stats.currentBalance,
      stats: {
        roi: stats.roi,
        winRate: stats.winRate,
        profitLoss: stats.profitLoss,
      },
    });
    
  } catch (error) {
    console.error('Erreur PUT bankroll:', error);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
