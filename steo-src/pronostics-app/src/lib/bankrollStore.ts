/**
 * Bankroll Store - Persistance fichier pour la gestion du bankroll
 * 
 * Fonctionnalités:
 * - Sauvegarde automatique dans /data/bankroll/
 * - Historique des transactions
 * - Calcul automatique du ROI
 * - Sync avec les résultats des pronostics
 */

import fs from 'fs';
import path from 'path';

// Types
export interface Transaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'bet' | 'winning' | 'bet_loss' | 'bonus';
  amount: number;
  date: string;
  predictionId?: string;
  description?: string;
  odds?: number;
  sport?: string;
}

export interface BankrollStats {
  initialDeposit: number;
  currentBalance: number;
  totalBets: number;
  totalWinnings: number;
  totalLosses: number;
  roi: number;
  winRate: number;
  avgOdds: number;
  profitLoss: number;
  bestWin: number;
  worstLoss: number;
  currentStreak: number;
  maxStreak: number;
  // Stats par sport
  bySport: Record<string, {
    bets: number;
    wins: number;
    losses: number;
    profit: number;
    roi: number;
  }>;
  // Stats par période
  daily: PeriodStats;
  weekly: PeriodStats;
  monthly: PeriodStats;
}

export interface PeriodStats {
  profit: number;
  bets: number;
  wins: number;
  roi: number;
}

export interface BankrollData {
  userId: string;
  balance: number;
  initialDeposit: number;
  transactions: Transaction[];
  lastUpdated: string;
}

// Chemin du stockage
const DATA_DIR = path.join(process.cwd(), 'data', 'bankroll');

// S'assurer que le dossier existe
function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Chemin du fichier utilisateur
function getUserFilePath(userId: string): string {
  return path.join(DATA_DIR, `${userId}.json`);
}

/**
 * Récupère les données bankroll d'un utilisateur
 */
export function getBankroll(userId: string = 'default'): BankrollData {
  ensureDataDir();
  const filePath = getUserFilePath(userId);
  
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Erreur lecture bankroll:', error);
    }
  }
  
  // Créer un nouveau bankroll
  const newBankroll: BankrollData = {
    userId,
    balance: 0,
    initialDeposit: 0,
    transactions: [],
    lastUpdated: new Date().toISOString(),
  };
  
  saveBankroll(newBankroll);
  return newBankroll;
}

/**
 * Sauvegarde les données bankroll
 */
export function saveBankroll(data: BankrollData): void {
  ensureDataDir();
  const filePath = getUserFilePath(data.userId);
  
  data.lastUpdated = new Date().toISOString();
  
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Erreur sauvegarde bankroll:', error);
  }
}

/**
 * Ajoute une transaction
 */
export function addTransaction(
  userId: string,
  transaction: Omit<Transaction, 'id' | 'date'>
): Transaction {
  const bankroll = getBankroll(userId);
  
  const newTransaction: Transaction = {
    ...transaction,
    id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    date: new Date().toISOString(),
  };
  
  // Mettre à jour le solde
  switch (transaction.type) {
    case 'deposit':
    case 'winning':
    case 'bonus':
      bankroll.balance += transaction.amount;
      break;
    case 'withdrawal':
    case 'bet':
    case 'bet_loss':
      bankroll.balance -= transaction.amount;
      break;
  }
  
  // Mettre à jour le dépôt initial si c'est le premier
  if (transaction.type === 'deposit' && bankroll.transactions.filter(t => t.type === 'deposit').length === 0) {
    bankroll.initialDeposit = transaction.amount;
  }
  
  bankroll.transactions.push(newTransaction);
  saveBankroll(bankroll);
  
  return newTransaction;
}

/**
 * Calcule les statistiques du bankroll
 */
export function calculateStats(userId: string = 'default'): BankrollStats {
  const bankroll = getBankroll(userId);
  const transactions = bankroll.transactions;
  
  // Calculs de base
  const deposits = transactions.filter(t => t.type === 'deposit');
  const initialDeposit = deposits.length > 0 ? deposits[0].amount : 0;
  
  const bets = transactions.filter(t => t.type === 'bet');
  const winnings = transactions.filter(t => t.type === 'winning');
  const losses = transactions.filter(t => t.type === 'bet_loss');
  
  const totalBets = bets.reduce((sum, t) => sum + t.amount, 0);
  const totalWinnings = winnings.reduce((sum, t) => sum + t.amount, 0);
  const totalLosses = losses.reduce((sum, t) => sum + t.amount, 0);
  
  const profitLoss = totalWinnings - totalLosses;
  const roi = totalBets > 0 ? (profitLoss / totalBets) * 100 : 0;
  
  const winningBets = winnings.length;
  const losingBets = losses.length;
  const totalBetsCount = winningBets + losingBets;
  const winRate = totalBetsCount > 0 ? (winningBets / totalBetsCount) * 100 : 0;
  
  // Meilleur gain / pire perte
  const bestWin = winnings.length > 0 ? Math.max(...winnings.map(t => t.amount)) : 0;
  const worstLoss = losses.length > 0 ? Math.max(...losses.map(t => t.amount)) : 0;
  
  // Cote moyenne
  const oddsTransactions = [...bets, ...winnings].filter(t => t.odds);
  const avgOdds = oddsTransactions.length > 0 
    ? oddsTransactions.reduce((sum, t) => sum + (t.odds || 0), 0) / oddsTransactions.length 
    : 0;
  
  // Série actuelle
  let currentStreak = 0;
  let maxStreak = 0;
  let streakType: 'win' | 'loss' | null = null;
  
  const sortedTransactions = [...transactions]
    .filter(t => t.type === 'winning' || t.type === 'bet_loss')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  for (const t of sortedTransactions) {
    const isWin = t.type === 'winning';
    
    if (streakType === null) {
      streakType = isWin ? 'win' : 'loss';
      currentStreak = 1;
    } else if ((streakType === 'win' && isWin) || (streakType === 'loss' && !isWin)) {
      currentStreak++;
    } else {
      break;
    }
  }
  
  // Stats par sport
  const bySport: Record<string, { bets: number; wins: number; losses: number; profit: number; roi: number }> = {};
  
  for (const t of transactions) {
    if (!t.sport) continue;
    
    if (!bySport[t.sport]) {
      bySport[t.sport] = { bets: 0, wins: 0, losses: 0, profit: 0, roi: 0 };
    }
    
    if (t.type === 'bet') {
      bySport[t.sport].bets += t.amount;
    } else if (t.type === 'winning') {
      bySport[t.sport].wins++;
      bySport[t.sport].profit += t.amount;
    } else if (t.type === 'bet_loss') {
      bySport[t.sport].losses++;
      bySport[t.sport].profit -= t.amount;
    }
  }
  
  // Calculer ROI par sport
  for (const sport of Object.keys(bySport)) {
    const s = bySport[sport];
    s.roi = s.bets > 0 ? (s.profit / s.bets) * 100 : 0;
  }
  
  // Stats par période
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const dailyTxs = transactions.filter(t => new Date(t.date) >= today);
  const weeklyTxs = transactions.filter(t => new Date(t.date) >= weekAgo);
  const monthlyTxs = transactions.filter(t => new Date(t.date) >= monthAgo);
  
  const calculatePeriodStats = (txs: Transaction[]): PeriodStats => {
    const bets = txs.filter(t => t.type === 'bet').reduce((sum, t) => sum + t.amount, 0);
    const profit = txs.filter(t => t.type === 'winning').reduce((sum, t) => sum + t.amount, 0)
                    - txs.filter(t => t.type === 'bet_loss').reduce((sum, t) => sum + t.amount, 0);
    const wins = txs.filter(t => t.type === 'winning').length;
    
    return {
      profit,
      bets: txs.filter(t => t.type === 'bet').length,
      wins,
      roi: bets > 0 ? (profit / bets) * 100 : 0,
    };
  };
  
  return {
    initialDeposit,
    currentBalance: bankroll.balance,
    totalBets,
    totalWinnings,
    totalLosses,
    roi: Math.round(roi * 100) / 100,
    winRate: Math.round(winRate * 10) / 10,
    avgOdds: Math.round(avgOdds * 100) / 100,
    profitLoss: Math.round(profitLoss * 100) / 100,
    bestWin,
    worstLoss,
    currentStreak,
    maxStreak,
    bySport,
    daily: calculatePeriodStats(dailyTxs),
    weekly: calculatePeriodStats(weeklyTxs),
    monthly: calculatePeriodStats(monthlyTxs),
  };
}

/**
 * Met à jour le bankroll après un résultat de pronostic
 */
export function updateAfterResult(
  userId: string,
  predictionId: string,
  isWin: boolean,
  stake: number,
  odds: number,
  sport: string
): void {
  if (isWin) {
    const winnings = stake * (odds - 1);
    addTransaction(userId, {
      type: 'winning',
      amount: winnings,
      predictionId,
      odds,
      sport,
      description: `Gain pronostic ${predictionId}`,
    });
  } else {
    addTransaction(userId, {
      type: 'bet_loss',
      amount: stake,
      predictionId,
      odds,
      sport,
      description: `Perte pronostic ${predictionId}`,
    });
  }
}

/**
 * Réinitialise le bankroll
 */
export function resetBankroll(userId: string = 'default'): void {
  const filePath = getUserFilePath(userId);
  
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  
  // Créer un nouveau bankroll vide
  getBankroll(userId);
}

// Export par défaut
const BankrollStore = {
  get: getBankroll,
  save: saveBankroll,
  addTransaction,
  calculateStats,
  updateAfterResult,
  reset: resetBankroll,
};

export default BankrollStore;
