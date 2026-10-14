// Enhanced Backtest Runner - EUR/USD with Multiple Strategies
const https = require('https');

const SYMBOL = 'EURUSD=X';
const TIMEFRAME = '1D';

// Fetch data from Yahoo Finance
function fetchYahooData(symbol, interval, range) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`;
    
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function runBacktest() {
  console.log('\n' + '═'.repeat(70));
  console.log('           📊 BACKTEST EUR/USD - ANALYSE COMPLÈTE');
  console.log('═'.repeat(70));
  console.log('\n🔧 Configuration:');
  console.log('   • Paire: EUR/USD');
  console.log('   • Timeframe: Daily (1D)');
  console.log('   • R:R Ratio: 1:2 et 1:3');
  console.log('   • Confluence Min: 50/100 (ajustable)');
  console.log('   • Trend Filter: EMA 50 et EMA 200');
  console.log('\n⏳ Chargement des données historiques...\n');

  try {
    // Fetch 2 years of data
    const data = await fetchYahooData(SYMBOL, '1d', '2y');
    
    if (!data.chart?.result?.[0]) {
      console.error('❌ Erreur: Impossible de récupérer les données');
      console.log('Response:', JSON.stringify(data).substring(0, 500));
      return;
    }

    const result = data.chart.result[0];
    const quote = result.indicators.quote[0];
    const timestamps = result.timestamp;

    // Build candles
    const candles = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quote.open[i] !== null && quote.high[i] !== null && 
          quote.low[i] !== null && quote.close[i] !== null) {
        candles.push({
          timestamp: timestamps[i],
          open: quote.open[i],
          high: quote.high[i],
          low: quote.low[i],
          close: quote.close[i],
          volume: quote.volume[i] || 0
        });
      }
    }

    console.log(`✅ ${candles.length} bougies chargées`);
    console.log(`   Période: ${new Date(candles[0].timestamp * 1000).toLocaleDateString('fr-FR')} - ${new Date(candles[candles.length-1].timestamp * 1000).toLocaleDateString('fr-FR')}`);
    console.log(`   Prix actuel: ${candles[candles.length-1].close.toFixed(5)}`);

    // ============================================
    // INDICATOR CALCULATIONS
    // ============================================
    
    const pipValue = 0.0001;
    
    function calculateEMA(data, period) {
      const result = [];
      const multiplier = 2 / (period + 1);
      let sum = 0;
      
      for (let i = 0; i < period && i < data.length; i++) {
        sum += data[i];
        result.push(null);
      }
      if (data.length >= period) {
        result[period - 1] = sum / period;
        
        for (let i = period; i < data.length; i++) {
          result.push((data[i] - result[i - 1]) * multiplier + result[i - 1]);
        }
      }
      return result;
    }

    function calculateSMA(data, period) {
      const result = [];
      for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
          result.push(null);
        } else {
          const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
          result.push(sum / period);
        }
      }
      return result;
    }

    function calculateRSI(closes, period = 14) {
      const result = [];
      
      for (let i = 0; i < period; i++) result.push(50);
      
      let avgGain = 0;
      let avgLoss = 0;
      
      // Initial average
      for (let i = 1; i <= period; i++) {
        const change = closes[i] - closes[i - 1];
        if (change > 0) avgGain += change;
        else avgLoss += Math.abs(change);
      }
      avgGain /= period;
      avgLoss /= period;
      
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.push(100 - (100 / (1 + rs)));
      
      // Continue with smoothed average
      for (let i = period + 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? Math.abs(change) : 0;
        
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        result.push(100 - (100 / (1 + rs)));
      }
      return result;
    }

    function calculateATR(candles, period = 14) {
      const trs = [];
      for (let i = 0; i < candles.length; i++) {
        if (i === 0) {
          trs.push(candles[i].high - candles[i].low);
        } else {
          const tr = Math.max(
            candles[i].high - candles[i].low,
            Math.abs(candles[i].high - candles[i - 1].close),
            Math.abs(candles[i].low - candles[i - 1].close)
          );
          trs.push(tr);
        }
      }
      return calculateEMA(trs, period);
    }

    function calculateMACD(closes, fast = 12, slow = 26, signal = 9) {
      const emaFast = calculateEMA(closes, fast);
      const emaSlow = calculateEMA(closes, slow);
      const macdLine = [];
      
      for (let i = 0; i < closes.length; i++) {
        if (emaFast[i] !== null && emaSlow[i] !== null) {
          macdLine.push(emaFast[i] - emaSlow[i]);
        } else {
          macdLine.push(null);
        }
      }
      
      const validMacd = macdLine.filter(v => v !== null);
      const signalLine = calculateEMA(validMacd, signal);
      
      return { macdLine, signalLine };
    }

    function calculateBollingerBands(closes, period = 20, stdDev = 2) {
      const sma = calculateSMA(closes, period);
      const upper = [];
      const lower = [];
      
      for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) {
          upper.push(null);
          lower.push(null);
        } else {
          const slice = closes.slice(i - period + 1, i + 1);
          const mean = sma[i];
          const variance = slice.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / period;
          const std = Math.sqrt(variance);
          upper.push(mean + stdDev * std);
          lower.push(mean - stdDev * std);
        }
      }
      return { upper, middle: sma, lower };
    }

    // Calculate all indicators
    const closes = candles.map(c => c.close);
    const ema9 = calculateEMA(closes, 9);
    const ema21 = calculateEMA(closes, 21);
    const ema50 = calculateEMA(closes, 50);
    const ema200 = calculateEMA(closes, 200);
    const rsi = calculateRSI(closes);
    const atr = calculateATR(candles);
    const macd = calculateMACD(closes);
    const bollinger = calculateBollingerBands(closes);
    
    console.log('\n🔄 Exécution des stratégies de backtest...\n');

    // ============================================
    // STRATEGY 1: TREND FOLLOWING
    // ============================================
    
    const trendTrades = [];
    const MIN_CONFLUENCE_TREND = 50;
    
    for (let i = 50; i < candles.length - 20; i++) {
      const currentPrice = candles[i].close;
      const currentATR = atr[i];
      const currentRSI = rsi[i] || 50;
      const currentEma50 = ema50[i];
      const currentEma200 = ema200[i];
      
      if (!currentEma50 || !currentATR || !currentEma200) continue;
      
      let confluence = 0;
      let direction = null;
      
      // Long setup
      if (currentPrice > currentEma50 && currentPrice > currentEma200) {
        confluence += 20; // Above both EMAs
        
        if (ema9[i] > ema21[i]) confluence += 15; // EMA crossover bullish
        if (currentRSI < 70 && currentRSI > 40) confluence += 10; // RSI not overbought
        if (currentRSI < 50) confluence += 10; // RSI oversold in uptrend (pullback)
        if (candles[i].close > candles[i].open) confluence += 5; // Bullish candle
        
        if (confluence >= MIN_CONFLUENCE_TREND) {
          direction = 'BUY';
        }
      }
      // Short setup
      else if (currentPrice < currentEma50 && currentPrice < currentEma200) {
        confluence += 20; // Below both EMAs
        
        if (ema9[i] < ema21[i]) confluence += 15; // EMA crossover bearish
        if (currentRSI > 30 && currentRSI < 60) confluence += 10; // RSI not oversold
        if (currentRSI > 50) confluence += 10; // RSI overbought in downtrend (pullback)
        if (candles[i].close < candles[i].open) confluence += 5; // Bearish candle
        
        if (confluence >= MIN_CONFLUENCE_TREND) {
          direction = 'SELL';
        }
      }
      
      if (!direction) continue;
      
      // Calculate SL and TP (1:2 RR)
      const slDistance = currentATR * 1.5;
      const tpDistance = slDistance * 2;
      
      let stopLoss, takeProfit;
      if (direction === 'BUY') {
        stopLoss = currentPrice - slDistance;
        takeProfit = currentPrice + tpDistance;
      } else {
        stopLoss = currentPrice + slDistance;
        takeProfit = currentPrice - tpDistance;
      }
      
      // Simulate trade
      let outcome = 'breakeven';
      let exitPrice = currentPrice;
      
      for (let j = 1; j <= 20 && i + j < candles.length; j++) {
        const bar = candles[i + j];
        
        if (direction === 'BUY') {
          if (bar.low <= stopLoss) {
            outcome = 'loss';
            exitPrice = stopLoss;
            break;
          }
          if (bar.high >= takeProfit) {
            outcome = 'win';
            exitPrice = takeProfit;
            break;
          }
        } else {
          if (bar.high >= stopLoss) {
            outcome = 'loss';
            exitPrice = stopLoss;
            break;
          }
          if (bar.low <= takeProfit) {
            outcome = 'win';
            exitPrice = takeProfit;
            break;
          }
        }
      }
      
      const pnl = direction === 'BUY' 
        ? (exitPrice - currentPrice) / pipValue 
        : (currentPrice - exitPrice) / pipValue;
      
      trendTrades.push({
        date: new Date(candles[i].timestamp * 1000).toLocaleDateString('fr-FR'),
        direction,
        entry: currentPrice.toFixed(5),
        confluence,
        outcome,
        pnl,
        strategy: 'Trend Following'
      });
      
      i += 3; // Skip some candles to avoid overtrading
    }

    // ============================================
    // STRATEGY 2: MEAN REVERSION (RSI + Bollinger)
    // ============================================
    
    const meanReversionTrades = [];
    
    for (let i = 30; i < candles.length - 15; i++) {
      const currentPrice = candles[i].close;
      const currentRSI = rsi[i] || 50;
      const bbUpper = bollinger.upper[i];
      const bbLower = bollinger.lower[i];
      const bbMiddle = bollinger.middle[i];
      const currentATR = atr[i];
      
      if (!bbUpper || !bbLower || !currentATR) continue;
      
      let direction = null;
      let confluence = 0;
      
      // Oversold - Buy signal
      if (currentRSI < 30 && currentPrice < bbLower) {
        confluence = 30;
        if (candles[i].close > candles[i].open) confluence += 15; // Bullish reversal candle
        if (currentPrice < candles[i-1].low) confluence += 10; // Made new low
        direction = 'BUY';
      }
      // Overbought - Sell signal
      else if (currentRSI > 70 && currentPrice > bbUpper) {
        confluence = 30;
        if (candles[i].close < candles[i].open) confluence += 15; // Bearish reversal candle
        if (currentPrice > candles[i-1].high) confluence += 10; // Made new high
        direction = 'SELL';
      }
      
      if (!direction) continue;
      
      // Calculate SL and TP (1:2 RR)
      const slDistance = currentATR * 1.2;
      const tpDistance = slDistance * 2;
      
      let stopLoss, takeProfit;
      if (direction === 'BUY') {
        stopLoss = currentPrice - slDistance;
        takeProfit = bbMiddle; // Target middle band
        if (takeProfit < currentPrice + tpDistance) {
          takeProfit = currentPrice + tpDistance;
        }
      } else {
        stopLoss = currentPrice + slDistance;
        takeProfit = bbMiddle;
        if (takeProfit > currentPrice - tpDistance) {
          takeProfit = currentPrice - tpDistance;
        }
      }
      
      // Simulate trade
      let outcome = 'breakeven';
      let exitPrice = currentPrice;
      
      for (let j = 1; j <= 15 && i + j < candles.length; j++) {
        const bar = candles[i + j];
        
        if (direction === 'BUY') {
          if (bar.low <= stopLoss) {
            outcome = 'loss';
            exitPrice = stopLoss;
            break;
          }
          if (bar.high >= takeProfit) {
            outcome = 'win';
            exitPrice = takeProfit;
            break;
          }
        } else {
          if (bar.high >= stopLoss) {
            outcome = 'loss';
            exitPrice = stopLoss;
            break;
          }
          if (bar.low <= takeProfit) {
            outcome = 'win';
            exitPrice = takeProfit;
            break;
          }
        }
      }
      
      const pnl = direction === 'BUY' 
        ? (exitPrice - currentPrice) / pipValue 
        : (currentPrice - exitPrice) / pipValue;
      
      meanReversionTrades.push({
        date: new Date(candles[i].timestamp * 1000).toLocaleDateString('fr-FR'),
        direction,
        entry: currentPrice.toFixed(5),
        confluence,
        outcome,
        pnl,
        strategy: 'Mean Reversion'
      });
      
      i += 2;
    }

    // ============================================
    // STRATEGY 3: BREAKOUT
    // ============================================
    
    const breakoutTrades = [];
    
    for (let i = 20; i < candles.length - 15; i++) {
      // Look for 20-period high/low breakout
      const lookback = 20;
      const highs = candles.slice(i - lookback, i).map(c => c.high);
      const lows = candles.slice(i - lookback, i).map(c => c.low);
      const highestHigh = Math.max(...highs);
      const lowestLow = Math.min(...lows);
      
      const currentPrice = candles[i].close;
      const currentATR = atr[i];
      const currentRSI = rsi[i] || 50;
      
      if (!currentATR) continue;
      
      let direction = null;
      let confluence = 0;
      
      // Bullish breakout
      if (currentPrice > highestHigh) {
        confluence = 25;
        if (candles[i].close > candles[i].open) confluence += 15; // Strong close
        if (currentRSI > 50 && currentRSI < 70) confluence += 10; // Momentum but not overbought
        if (candles[i].volume > candles.slice(i-10, i).reduce((s,c) => s + c.volume, 0) / 10) confluence += 10; // Volume spike
        direction = 'BUY';
      }
      // Bearish breakout
      else if (currentPrice < lowestLow) {
        confluence = 25;
        if (candles[i].close < candles[i].open) confluence += 15; // Strong close
        if (currentRSI < 50 && currentRSI > 30) confluence += 10; // Momentum but not oversold
        if (candles[i].volume > candles.slice(i-10, i).reduce((s,c) => s + c.volume, 0) / 10) confluence += 10; // Volume spike
        direction = 'SELL';
      }
      
      if (!direction || confluence < 35) continue;
      
      // Calculate SL and TP (1:2.5 RR)
      const slDistance = currentATR * 1.2;
      const tpDistance = slDistance * 2.5;
      
      let stopLoss, takeProfit;
      if (direction === 'BUY') {
        stopLoss = currentPrice - slDistance;
        takeProfit = currentPrice + tpDistance;
      } else {
        stopLoss = currentPrice + slDistance;
        takeProfit = currentPrice - tpDistance;
      }
      
      // Simulate trade
      let outcome = 'breakeven';
      let exitPrice = currentPrice;
      
      for (let j = 1; j <= 15 && i + j < candles.length; j++) {
        const bar = candles[i + j];
        
        if (direction === 'BUY') {
          if (bar.low <= stopLoss) {
            outcome = 'loss';
            exitPrice = stopLoss;
            break;
          }
          if (bar.high >= takeProfit) {
            outcome = 'win';
            exitPrice = takeProfit;
            break;
          }
        } else {
          if (bar.high >= stopLoss) {
            outcome = 'loss';
            exitPrice = stopLoss;
            break;
          }
          if (bar.low <= takeProfit) {
            outcome = 'win';
            exitPrice = takeProfit;
            break;
          }
        }
      }
      
      const pnl = direction === 'BUY' 
        ? (exitPrice - currentPrice) / pipValue 
        : (currentPrice - exitPrice) / pipValue;
      
      breakoutTrades.push({
        date: new Date(candles[i].timestamp * 1000).toLocaleDateString('fr-FR'),
        direction,
        entry: currentPrice.toFixed(5),
        confluence,
        outcome,
        pnl,
        strategy: 'Breakout'
      });
      
      i += 3;
    }

    // ============================================
    // CALCULATE STATS FOR EACH STRATEGY
    // ============================================
    
    function calculateStats(trades, strategyName) {
      if (trades.length === 0) {
        return { strategyName, totalTrades: 0, winRate: 0, totalPips: 0, profitFactor: 0, expectancy: 0 };
      }
      
      const wins = trades.filter(t => t.outcome === 'win');
      const losses = trades.filter(t => t.outcome === 'loss');
      const totalPips = trades.reduce((sum, t) => sum + t.pnl, 0);
      const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
      const winRate = (wins.length / trades.length) * 100;
      const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : 0;
      const expectancy = (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss);
      
      return { strategyName, totalTrades: trades.length, wins: wins.length, losses: losses.length, winRate, totalPips, avgWin, avgLoss, profitFactor, expectancy };
    }

    const trendStats = calculateStats(trendTrades, 'Trend Following');
    const mrStats = calculateStats(meanReversionTrades, 'Mean Reversion');
    const breakoutStats = calculateStats(breakoutTrades, 'Breakout');

    // ============================================
    // DISPLAY RESULTS
    // ============================================
    
    console.log('═'.repeat(70));
    console.log('                    📈 RÉSULTATS DU BACKTEST');
    console.log('═'.repeat(70));
    
    // Trend Following Results
    console.log('\n┌─────────────────────────────────────────────────────────────────┐');
    console.log('│              🎯 STRATÉGIE 1: TREND FOLLOWING                    │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log(`│  Total Trades:     ${trendStats.totalTrades.toString().padStart(4)}                                    │`);
    console.log(`│  Gagnants:         ${trendStats.wins.toString().padStart(4)}  (${trendStats.winRate.toFixed(1)}%)                          │`);
    console.log(`│  Perdants:         ${trendStats.losses.toString().padStart(4)}                                    │`);
    console.log(`│  Pips Totaux:      ${trendStats.totalPips >= 0 ? '+' : ''}${trendStats.totalPips.toFixed(1).padStart(7)}                              │`);
    console.log(`│  Gain Moyen:       +${trendStats.avgWin.toFixed(1)} pips                         │`);
    console.log(`│  Perte Moyenne:    -${trendStats.avgLoss.toFixed(1)} pips                         │`);
    console.log(`│  Profit Factor:    ${trendStats.profitFactor.toFixed(2)}                                  │`);
    console.log(`│  Expectative:      ${trendStats.expectancy >= 0 ? '+' : ''}${trendStats.expectancy.toFixed(1)} pips/trade                    │`);
    console.log(`│  Verdict:          ${trendStats.expectancy > 0 ? '✅ RENTABLE' : trendStats.expectancy > -5 ? '⚠️ NEUTRE' : '❌ NON RENTABLE'}                            │`);
    console.log('└─────────────────────────────────────────────────────────────────┘');

    // Mean Reversion Results
    console.log('\n┌─────────────────────────────────────────────────────────────────┐');
    console.log('│              🔄 STRATÉGIE 2: MEAN REVERSION                     │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log(`│  Total Trades:     ${mrStats.totalTrades.toString().padStart(4)}                                    │`);
    console.log(`│  Gagnants:         ${mrStats.wins.toString().padStart(4)}  (${mrStats.winRate.toFixed(1)}%)                          │`);
    console.log(`│  Perdants:         ${mrStats.losses.toString().padStart(4)}                                    │`);
    console.log(`│  Pips Totaux:      ${mrStats.totalPips >= 0 ? '+' : ''}${mrStats.totalPips.toFixed(1).padStart(7)}                              │`);
    console.log(`│  Gain Moyen:       +${mrStats.avgWin.toFixed(1)} pips                         │`);
    console.log(`│  Perte Moyenne:    -${mrStats.avgLoss.toFixed(1)} pips                         │`);
    console.log(`│  Profit Factor:    ${mrStats.profitFactor.toFixed(2)}                                  │`);
    console.log(`│  Expectative:      ${mrStats.expectancy >= 0 ? '+' : ''}${mrStats.expectancy.toFixed(1)} pips/trade                    │`);
    console.log(`│  Verdict:          ${mrStats.expectancy > 0 ? '✅ RENTABLE' : mrStats.expectancy > -5 ? '⚠️ NEUTRE' : '❌ NON RENTABLE'}                            │`);
    console.log('└─────────────────────────────────────────────────────────────────┘');

    // Breakout Results
    console.log('\n┌─────────────────────────────────────────────────────────────────┐');
    console.log('│              🚀 STRATÉGIE 3: BREAKOUT                           │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log(`│  Total Trades:     ${breakoutStats.totalTrades.toString().padStart(4)}                                    │`);
    console.log(`│  Gagnants:         ${breakoutStats.wins.toString().padStart(4)}  (${breakoutStats.winRate.toFixed(1)}%)                          │`);
    console.log(`│  Perdants:         ${breakoutStats.losses.toString().padStart(4)}                                    │`);
    console.log(`│  Pips Totaux:      ${breakoutStats.totalPips >= 0 ? '+' : ''}${breakoutStats.totalPips.toFixed(1).padStart(7)}                              │`);
    console.log(`│  Gain Moyen:       +${breakoutStats.avgWin.toFixed(1)} pips                         │`);
    console.log(`│  Perte Moyenne:    -${breakoutStats.avgLoss.toFixed(1)} pips                         │`);
    console.log(`│  Profit Factor:    ${breakoutStats.profitFactor.toFixed(2)}                                  │`);
    console.log(`│  Expectative:      ${breakoutStats.expectancy >= 0 ? '+' : ''}${breakoutStats.expectancy.toFixed(1)} pips/trade                    │`);
    console.log(`│  Verdict:          ${breakoutStats.expectancy > 0 ? '✅ RENTABLE' : breakoutStats.expectancy > -5 ? '⚠️ NEUTRE' : '❌ NON RENTABLE'}                            │`);
    console.log('└─────────────────────────────────────────────────────────────────┘');

    // Overall Summary
    const allTrades = [...trendTrades, ...meanReversionTrades, ...breakoutTrades];
    const allStats = calculateStats(allTrades, 'Combined');
    
    console.log('\n╔═════════════════════════════════════════════════════════════════╗');
    console.log('║              📊 RÉSUMÉ GLOBAL - TOUTES STRATÉGIES               ║');
    console.log('╠═════════════════════════════════════════════════════════════════╣');
    console.log(`║  Total Trades:     ${allStats.totalTrades.toString().padStart(4)}                                          ║`);
    console.log(`║  Win Rate Global:  ${allStats.winRate.toFixed(1)}%                                       ║`);
    console.log(`║  Pips Totaux:      ${allStats.totalPips >= 0 ? '+' : ''}${allStats.totalPips.toFixed(1).padStart(7)}                                        ║`);
    console.log(`║  Profit Factor:    ${allStats.profitFactor.toFixed(2)}                                          ║`);
    console.log(`║  Expectative:      ${allStats.expectancy >= 0 ? '+' : ''}${allStats.expectancy.toFixed(1)} pips/trade                              ║`);
    console.log('╠═════════════════════════════════════════════════════════════════╣');
    console.log(`║  CONCLUSION:      ${allStats.expectancy > 0 ? '✅ STRATÉGIES COMBINÉES RENTABLES' : '⚠️ OPTIMISATION RECOMMANDÉE'}                    ║`);
    console.log('╚═════════════════════════════════════════════════════════════════╝');

    // Recent trades details
    if (allTrades.length > 0) {
      console.log('\n📋 DERNIERS TRADES SIMULÉS:');
      console.log('─'.repeat(70));
      console.log('   Date       | Direction | Stratégie        | Confluence | Résultat | Pips');
      console.log('─'.repeat(70));
      
      allTrades.slice(-15).forEach(t => {
        const icon = t.outcome === 'win' ? '✓' : t.outcome === 'loss' ? '✗' : '○';
        const pnlStr = t.pnl >= 0 ? `+${t.pnl.toFixed(1)}` : t.pnl.toFixed(1);
        console.log(`   ${icon} ${t.date} | ${(t.direction === 'BUY' ? 'ACHAT' : 'VENTE').padEnd(8)} | ${t.strategy.padEnd(16)} | ${t.confluence.toString().padStart(2)}/100    | ${t.outcome.padEnd(7)} | ${pnlStr}`);
      });
    }

    // Best strategy recommendation
    console.log('\n💡 RECOMMANDATION:');
    const strategies = [
      { name: 'Trend Following', stats: trendStats },
      { name: 'Mean Reversion', stats: mrStats },
      { name: 'Breakout', stats: breakoutStats }
    ].filter(s => s.stats.totalTrades > 0)
     .sort((a, b) => b.stats.expectancy - a.stats.expectancy);
    
    if (strategies.length > 0) {
      const best = strategies[0];
      console.log(`   Meilleure stratégie: ${best.name}`);
      console.log(`   Expectative: ${best.stats.expectancy >= 0 ? '+' : ''}${best.stats.expectancy.toFixed(1)} pips/trade`);
      console.log(`   Win Rate: ${best.stats.winRate.toFixed(1)}%`);
    }
    
    console.log('\n' + '═'.repeat(70));
    console.log('                    Backtest terminé avec succès');
    console.log('═'.repeat(70) + '\n');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    console.error(error.stack);
  }
}

runBacktest();
