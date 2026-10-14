// Optimized Backtest Runner - EUR/USD with Realistic Parameters
const https = require('https');

const SYMBOL = 'EURUSD=X';

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

// ============================================
// TECHNICAL ANALYSIS FUNCTIONS
// ============================================

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

function calculateRSI(closes, period = 14) {
  const result = [];
  for (let i = 0; i < period; i++) result.push(50);
  
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period; avgLoss /= period;
  
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push(100 - (100 / (1 + rs)));
  
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - (100 / (1 + rs)));
  }
  return result;
}

function calculateATR(candles, period = 14) {
  const trs = candles.map((c, i) => 
    i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - candles[i-1].close), Math.abs(c.low - candles[i-1].close))
  );
  return calculateEMA(trs, period);
}

function calculateStochastic(candles, period = 14) {
  const result = [];
  for (let i = 0; i < period - 1; i++) result.push({ k: 50, d: 50 });
  
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const high = Math.max(...slice.map(c => c.high));
    const low = Math.min(...slice.map(c => c.low));
    const k = low === high ? 50 : ((candles[i].close - low) / (high - low)) * 100;
    result.push({ k, d: k });
  }
  
  // Smooth %D
  for (let i = period + 2; i < result.length; i++) {
    result[i].d = (result[i-2].k + result[i-1].k + result[i].k) / 3;
  }
  return result;
}

function calculateADX(candles, period = 14) {
  const plusDM = [], minusDM = [], trs = [];
  
  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i-1].high;
    const downMove = candles[i-1].low - candles[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trs.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i-1].close),
      Math.abs(candles[i].low - candles[i-1].close)
    ));
  }
  
  const smoothedTR = calculateEMA(trs, period);
  const smoothedPlusDM = calculateEMA(plusDM, period);
  const smoothedMinusDM = calculateEMA(minusDM, period);
  
  const result = [50];
  for (let i = period; i < smoothedTR.length; i++) {
    if (smoothedTR[i] && smoothedTR[i] > 0) {
      const plusDI = (smoothedPlusDM[i] / smoothedTR[i]) * 100;
      const minusDI = (smoothedMinusDM[i] / smoothedTR[i]) * 100;
      const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
      result.push(dx);
    } else {
      result.push(result[result.length - 1]);
    }
  }
  return result;
}

async function runBacktest() {
  console.log('\n' + '═'.repeat(75));
  console.log('        📊 BACKTEST EUR/USD - STRATÉGIES OPTIMISÉES v3.0');
  console.log('═'.repeat(75));

  try {
    const data = await fetchYahooData(SYMBOL, '1d', '1y');
    
    if (!data.chart?.result?.[0]) {
      console.error('❌ Erreur: Impossible de récupérer les données');
      return;
    }

    const result = data.chart.result[0];
    const quote = result.indicators.quote[0];
    const timestamps = result.timestamp;

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

    console.log(`\n✅ ${candles.length} bougies chargées`);
    console.log(`   Période: ${new Date(candles[0].timestamp * 1000).toLocaleDateString('fr-FR')} - ${new Date(candles[candles.length-1].timestamp * 1000).toLocaleDateString('fr-FR')}`);
    console.log(`   Prix actuel: ${candles[candles.length-1].close.toFixed(5)}`);

    const pipValue = 0.0001;
    const closes = candles.map(c => c.close);
    
    // Calculate indicators
    const ema9 = calculateEMA(closes, 9);
    const ema21 = calculateEMA(closes, 21);
    const ema50 = calculateEMA(closes, 50);
    const ema200 = calculateEMA(closes, 200);
    const rsi = calculateRSI(closes);
    const atr = calculateATR(candles);
    const stoch = calculateStochastic(candles);
    const adx = calculateADX(candles);

    console.log('\n🔄 Exécution des stratégies...\n');

    // ============================================
    // STRATEGY 1: EMA CROSSOVER WITH FILTERS
    // ============================================
    
    const emaCrossTrades = [];
    
    for (let i = 50; i < candles.length - 10; i++) {
      const price = candles[i].close;
      const atrVal = atr[i];
      if (!ema9[i] || !ema21[i] || !ema50[i] || !atrVal) continue;
      
      // Bullish crossover
      if (ema9[i] > ema21[i] && ema9[i-1] <= ema21[i-1] && price > ema50[i]) {
        const sl = price - atrVal * 1.5;
        const tp = price + atrVal * 2; // 1:1.33 RR
        
        let exit = price, outcome = 'breakeven';
        for (let j = 1; j <= 10 && i + j < candles.length; j++) {
          if (candles[i+j].low <= sl) { exit = sl; outcome = 'loss'; break; }
          if (candles[i+j].high >= tp) { exit = tp; outcome = 'win'; break; }
        }
        
        emaCrossTrades.push({
          date: new Date(candles[i].timestamp * 1000).toLocaleDateString('fr-FR'),
          dir: 'BUY', entry: price, sl, tp, exit, outcome,
          pnl: (exit - price) / pipValue,
          strategy: 'EMA Cross'
        });
      }
      // Bearish crossover
      else if (ema9[i] < ema21[i] && ema9[i-1] >= ema21[i-1] && price < ema50[i]) {
        const sl = price + atrVal * 1.5;
        const tp = price - atrVal * 2;
        
        let exit = price, outcome = 'breakeven';
        for (let j = 1; j <= 10 && i + j < candles.length; j++) {
          if (candles[i+j].high >= sl) { exit = sl; outcome = 'loss'; break; }
          if (candles[i+j].low <= tp) { exit = tp; outcome = 'win'; break; }
        }
        
        emaCrossTrades.push({
          date: new Date(candles[i].timestamp * 1000).toLocaleDateString('fr-FR'),
          dir: 'SELL', entry: price, sl, tp, exit, outcome,
          pnl: (price - exit) / pipValue,
          strategy: 'EMA Cross'
        });
      }
    }

    // ============================================
    // STRATEGY 2: RSI REVERSAL WITH TREND FILTER
    // ============================================
    
    const rsiTrades = [];
    
    for (let i = 30; i < candles.length - 10; i++) {
      const price = candles[i].close;
      const atrVal = atr[i];
      const rsiVal = rsi[i];
      const ema50Val = ema50[i];
      const ema200Val = ema200[i];
      
      if (!atrVal || !ema50Val || !rsiVal) continue;
      
      // Oversold in uptrend
      if (rsiVal < 35 && price > ema50Val) {
        const sl = price - atrVal * 1.2;
        const tp = price + atrVal * 1.8;
        
        let exit = price, outcome = 'breakeven';
        for (let j = 1; j <= 10 && i + j < candles.length; j++) {
          if (candles[i+j].low <= sl) { exit = sl; outcome = 'loss'; break; }
          if (candles[i+j].high >= tp) { exit = tp; outcome = 'win'; break; }
        }
        
        rsiTrades.push({
          date: new Date(candles[i].timestamp * 1000).toLocaleDateString('fr-FR'),
          dir: 'BUY', entry: price, exit, outcome,
          pnl: (exit - price) / pipValue,
          strategy: 'RSI Reversal'
        });
        i += 2;
      }
      // Overbought in downtrend
      else if (rsiVal > 65 && price < ema50Val) {
        const sl = price + atrVal * 1.2;
        const tp = price - atrVal * 1.8;
        
        let exit = price, outcome = 'breakeven';
        for (let j = 1; j <= 10 && i + j < candles.length; j++) {
          if (candles[i+j].high >= sl) { exit = sl; outcome = 'loss'; break; }
          if (candles[i+j].low <= tp) { exit = tp; outcome = 'win'; break; }
        }
        
        rsiTrades.push({
          date: new Date(candles[i].timestamp * 1000).toLocaleDateString('fr-FR'),
          dir: 'SELL', entry: price, exit, outcome,
          pnl: (price - exit) / pipValue,
          strategy: 'RSI Reversal'
        });
        i += 2;
      }
    }

    // ============================================
    // STRATEGY 3: STOCHASTIC CROSS WITH ADX
    // ============================================
    
    const stochTrades = [];
    
    for (let i = 20; i < candles.length - 10; i++) {
      const price = candles[i].close;
      const atrVal = atr[i];
      const stochVal = stoch[i];
      const adxVal = adx[Math.min(i - 14, adx.length - 1)];
      
      if (!atrVal || !stochVal || !adxVal) continue;
      
      // Strong trend + oversold stochastic
      if (adxVal > 25 && stochVal.k < 25 && stochVal.d < 25 && stochVal.k > stochVal.d) {
        const sl = price - atrVal * 1.3;
        const tp = price + atrVal * 2;
        
        let exit = price, outcome = 'breakeven';
        for (let j = 1; j <= 10 && i + j < candles.length; j++) {
          if (candles[i+j].low <= sl) { exit = sl; outcome = 'loss'; break; }
          if (candles[i+j].high >= tp) { exit = tp; outcome = 'win'; break; }
        }
        
        stochTrades.push({
          date: new Date(candles[i].timestamp * 1000).toLocaleDateString('fr-FR'),
          dir: 'BUY', entry: price, exit, outcome,
          pnl: (exit - price) / pipValue,
          strategy: 'Stochastic'
        });
        i += 3;
      }
      // Strong trend + overbought stochastic
      else if (adxVal > 25 && stochVal.k > 75 && stochVal.d > 75 && stochVal.k < stochVal.d) {
        const sl = price + atrVal * 1.3;
        const tp = price - atrVal * 2;
        
        let exit = price, outcome = 'breakeven';
        for (let j = 1; j <= 10 && i + j < candles.length; j++) {
          if (candles[i+j].high >= sl) { exit = sl; outcome = 'loss'; break; }
          if (candles[i+j].low <= tp) { exit = tp; outcome = 'win'; break; }
        }
        
        stochTrades.push({
          date: new Date(candles[i].timestamp * 1000).toLocaleDateString('fr-FR'),
          dir: 'SELL', entry: price, exit, outcome,
          pnl: (price - exit) / pipValue,
          strategy: 'Stochastic'
        });
        i += 3;
      }
    }

    // ============================================
    // STRATEGY 4: SUPPORT/RESISTANCE BREAKOUT
    // ============================================
    
    const breakoutTrades = [];
    
    for (let i = 30; i < candles.length - 10; i++) {
      const price = candles[i].close;
      const atrVal = atr[i];
      
      if (!atrVal) continue;
      
      // Find recent high/low
      const lookback = 15;
      const recentHigh = Math.max(...candles.slice(i - lookback, i).map(c => c.high));
      const recentLow = Math.min(...candles.slice(i - lookback, i).map(c => c.low));
      const range = recentHigh - recentLow;
      
      // Breakout above resistance
      if (price > recentHigh && range > atrVal * 2) {
        const sl = recentHigh - atrVal;
        const tp = price + range * 0.5;
        
        let exit = price, outcome = 'breakeven';
        for (let j = 1; j <= 10 && i + j < candles.length; j++) {
          if (candles[i+j].low <= sl) { exit = sl; outcome = 'loss'; break; }
          if (candles[i+j].high >= tp) { exit = tp; outcome = 'win'; break; }
        }
        
        breakoutTrades.push({
          date: new Date(candles[i].timestamp * 1000).toLocaleDateString('fr-FR'),
          dir: 'BUY', entry: price, exit, outcome,
          pnl: (exit - price) / pipValue,
          strategy: 'Breakout'
        });
        i += 5;
      }
      // Breakdown below support
      else if (price < recentLow && range > atrVal * 2) {
        const sl = recentLow + atrVal;
        const tp = price - range * 0.5;
        
        let exit = price, outcome = 'breakeven';
        for (let j = 1; j <= 10 && i + j < candles.length; j++) {
          if (candles[i+j].high >= sl) { exit = sl; outcome = 'loss'; break; }
          if (candles[i+j].low <= tp) { exit = tp; outcome = 'win'; break; }
        }
        
        breakoutTrades.push({
          date: new Date(candles[i].timestamp * 1000).toLocaleDateString('fr-FR'),
          dir: 'SELL', entry: price, exit, outcome,
          pnl: (price - exit) / pipValue,
          strategy: 'Breakout'
        });
        i += 5;
      }
    }

    // ============================================
    // CALCULATE AND DISPLAY STATS
    // ============================================
    
    function calcStats(trades, name) {
      if (trades.length === 0) return { name, total: 0, wins: 0, losses: 0, winRate: 0, pips: 0, pf: 0, exp: 0 };
      
      const wins = trades.filter(t => t.outcome === 'win');
      const losses = trades.filter(t => t.outcome === 'loss');
      const pips = trades.reduce((s, t) => s + t.pnl, 0);
      const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
      const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
      const winRate = (wins.length / trades.length) * 100;
      const pf = avgLoss ? (avgWin * wins.length) / (avgLoss * losses.length) : 0;
      const exp = (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss);
      
      return { name, total: trades.length, wins: wins.length, losses: losses.length, winRate, pips, avgWin, avgLoss, pf, exp, trades };
    }

    const stats = [
      calcStats(emaCrossTrades, 'EMA Crossover'),
      calcStats(rsiTrades, 'RSI Reversal'),
      calcStats(stochTrades, 'Stochastic + ADX'),
      calcStats(breakoutTrades, 'Support/Resistance')
    ];

    console.log('═'.repeat(75));
    console.log('                    📈 RÉSULTATS PAR STRATÉGIE');
    console.log('═'.repeat(75));

    stats.forEach(s => {
      const verdict = s.exp > 10 ? '✅ RENTABLE' : s.exp > 0 ? '⚠️ MARGINAL' : s.total === 0 ? '⚪ AUCUN TRADE' : '❌ NON RENTABLE';
      console.log(`\n┌───────────────────────────────────────────────────────────────────┐`);
      console.log(`│  📊 ${s.name.padEnd(25)}                              │`);
      console.log(`├───────────────────────────────────────────────────────────────────┤`);
      console.log(`│  Trades: ${s.total.toString().padStart(3)}   │  Wins: ${s.wins.toString().padStart(3)}   │  Losses: ${s.losses.toString().padStart(3)}   │  WR: ${s.winRate.toFixed(1).padStart(5)}%  │`);
      console.log(`│  Pips: ${s.pips >= 0 ? '+' : ''}${s.pips.toFixed(1).padStart(8)}  │  PF: ${s.pf.toFixed(2).padStart(5)}  │  Exp: ${s.exp >= 0 ? '+' : ''}${s.exp.toFixed(1).padStart(6)} pips  │`);
      console.log(`│  Verdict: ${verdict.padEnd(52)}│`);
      console.log(`└───────────────────────────────────────────────────────────────────┘`);
    });

    // Overall stats
    const allTrades = [...emaCrossTrades, ...rsiTrades, ...stochTrades, ...breakoutTrades];
    const allStats = calcStats(allTrades, 'GLOBAL');
    
    // Long vs Short analysis
    const longTrades = allTrades.filter(t => t.dir === 'BUY');
    const shortTrades = allTrades.filter(t => t.dir === 'SELL');
    const longStats = calcStats(longTrades, 'LONG');
    const shortStats = calcStats(shortTrades, 'SHORT');

    console.log('\n╔═════════════════════════════════════════════════════════════════════╗');
    console.log('║                    📊 ANALYSE LONG vs SHORT                        ║');
    console.log('╠═════════════════════════════════════════════════════════════════════╣');
    console.log(`║  🟢 LONG:  ${longStats.total.toString().padStart(3)} trades  │  WR: ${longStats.winRate.toFixed(1).padStart(5)}%  │  Pips: ${longStats.pips >= 0 ? '+' : ''}${longStats.pips.toFixed(1).padStart(7)}  │  Exp: ${longStats.exp >= 0 ? '+' : ''}${longStats.exp.toFixed(1).padStart(5)}  ║`);
    console.log(`║  🔴 SHORT: ${shortStats.total.toString().padStart(3)} trades  │  WR: ${shortStats.winRate.toFixed(1).padStart(5)}%  │  Pips: ${shortStats.pips >= 0 ? '+' : ''}${shortStats.pips.toFixed(1).padStart(7)}  │  Exp: ${shortStats.exp >= 0 ? '+' : ''}${shortStats.exp.toFixed(1).padStart(5)}  ║`);
    console.log('╚═════════════════════════════════════════════════════════════════════╝');

    console.log('\n╔═════════════════════════════════════════════════════════════════════╗');
    console.log('║                    📊 RÉSUMÉ GLOBAL                                 ║');
    console.log('╠═════════════════════════════════════════════════════════════════════╣');
    console.log(`║  Total Trades:     ${allStats.total.toString().padStart(4)}                                          ║`);
    console.log(`║  Win Rate:         ${allStats.winRate.toFixed(1)}%                                        ║`);
    console.log(`║  Pips Totaux:      ${allStats.pips >= 0 ? '+' : ''}${allStats.pips.toFixed(1).padStart(8)}                                        ║`);
    console.log(`║  Profit Factor:    ${allStats.pf.toFixed(2)}                                          ║`);
    console.log(`║  Expectative:      ${allStats.exp >= 0 ? '+' : ''}${allStats.exp.toFixed(1)} pips/trade                              ║`);
    console.log('╠═════════════════════════════════════════════════════════════════════╣');
    
    const conclusion = allStats.exp > 15 ? '✅ STRATÉGIES RENTABLES' : 
                       allStats.exp > 0 ? '⚠️ RENTABILITÉ MARGINALE' : 
                       '❌ NÉCESSITE OPTIMISATION';
    console.log(`║  CONCLUSION:  ${conclusion.padEnd(48)}║`);
    console.log('╚═════════════════════════════════════════════════════════════════════╝');

    // Best trades
    if (allTrades.length > 0) {
      const sortedTrades = [...allTrades].sort((a, b) => b.pnl - a.pnl);
      
      console.log('\n🏆 TOP 5 MEILLEURS TRADES:');
      sortedTrades.slice(0, 5).forEach((t, i) => {
        console.log(`   ${i + 1}. ${t.date} | ${t.dir === 'BUY' ? '🟢 ACHAT' : '🔴 VENTE'} | ${t.strategy.padEnd(15)} | +${t.pnl.toFixed(1)} pips`);
      });
      
      console.log('\n📉 TOP 5 PIRE TRADES:');
      sortedTrades.slice(-5).reverse().forEach((t, i) => {
        console.log(`   ${i + 1}. ${t.date} | ${t.dir === 'BUY' ? '🟢 ACHAT' : '🔴 VENTE'} | ${t.strategy.padEnd(15)} | ${t.pnl.toFixed(1)} pips`);
      });
    }

    // Recommendation
    console.log('\n💡 RECOMMANDATIONS:');
    const profitable = stats.filter(s => s.exp > 0).sort((a, b) => b.exp - a.exp);
    
    if (profitable.length > 0) {
      console.log(`   Stratégie recommandée: ${profitable[0].name}`);
      console.log(`   Expectative: +${profitable[0].exp.toFixed(1)} pips/trade`);
      console.log(`   Win Rate: ${profitable[0].winRate.toFixed(1)}%`);
      
      if (longStats.exp > shortStats.exp) {
        console.log(`   Direction favorisée: LONG (exp: +${longStats.exp.toFixed(1)} pips)`);
      } else if (shortStats.exp > longStats.exp) {
        console.log(`   Direction favorisée: SHORT (exp: +${shortStats.exp.toFixed(1)} pips)`);
      }
    } else {
      console.log('   ⚠️ Aucune stratégie rentable détectée');
      console.log('   Recommandations:');
      console.log('   • Augmenter le ratio R:R (plus de prise de profit)');
      console.log('   • Réduire la taille du stop loss');
      console.log('   • Ajouter des filtres de tendance supplémentaires');
      console.log('   • Tester sur une autre période');
    }

    console.log('\n' + '═'.repeat(75));
    console.log('                    ✅ Backtest EUR/USD terminé');
    console.log('═'.repeat(75) + '\n');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

runBacktest();
