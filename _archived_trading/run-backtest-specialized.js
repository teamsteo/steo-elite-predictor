// Specialized Backtest - EUR/USD with LONG-Only & Optimized Shorts
const https = require('https');

const SYMBOL = 'EURUSD=X';

function fetchYahooData(symbol, interval, range) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`;
    
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } 
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ============================================
// TECHNICAL INDICATORS
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
  console.log('\n' + '═'.repeat(78));
  console.log('   📊 BACKTEST EUR/USD - STRATÉGIE SPÉCIALISÉE (LONG UNIQUEMENT + SHORTS FILTRÉS)');
  console.log('═'.repeat(78));

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

    // Determine overall trend
    const currentPrice = closes[closes.length - 1];
    const currentEma200 = ema200[ema200.length - 1];
    const overallTrend = currentPrice > currentEma200 ? 'HAUSSIER' : 'BAISSIER';
    
    console.log(`\n📈 ANALYSE DE TENDANCE:`);
    console.log(`   Prix actuel: ${currentPrice.toFixed(5)}`);
    console.log(`   EMA 200: ${currentEma200 ? currentEma200.toFixed(5) : 'N/A'}`);
    console.log(`   Tendance globale: ${overallTrend === 'HAUSSIER' ? '🟢 BULLISH' : '🔴 BEARISH'}`);

    console.log('\n🔄 Exécution des stratégies spécialisées...\n');

    // ============================================
    // STRATEGY 1: EMA CROSSOVER - LONG ONLY
    // ============================================
    
    const emaCrossLongTrades = [];
    const emaCrossShortFilteredTrades = [];
    
    for (let i = 50; i < candles.length - 10; i++) {
      const price = candles[i].close;
      const atrVal = atr[i];
      const ema200Val = ema200[i];
      
      if (!ema9[i] || !ema21[i] || !ema50[i] || !atrVal || !ema200Val) continue;
      
      // Bullish crossover - LONG SIGNAL
      if (ema9[i] > ema21[i] && ema9[i-1] <= ema21[i-1] && price > ema50[i]) {
        const sl = price - atrVal * 1.5;
        const tp = price + atrVal * 2;
        
        let exit = price, outcome = 'breakeven';
        for (let j = 1; j <= 10 && i + j < candles.length; j++) {
          if (candles[i+j].low <= sl) { exit = sl; outcome = 'loss'; break; }
          if (candles[i+j].high >= tp) { exit = tp; outcome = 'win'; break; }
        }
        
        emaCrossLongTrades.push({
          date: new Date(candles[i].timestamp * 1000).toLocaleDateString('fr-FR'),
          dir: 'BUY', entry: price, exit, outcome,
          pnl: (exit - price) / pipValue,
          strategy: 'EMA Cross LONG'
        });
      }
      
      // Bearish crossover - SHORT SIGNAL WITH STRICT EMA200 FILTER
      if (ema9[i] < ema21[i] && ema9[i-1] >= ema21[i-1] && price < ema50[i]) {
        // ONLY short if price is BELOW EMA200 (trend confirmation)
        if (price < ema200Val) {
          const sl = price + atrVal * 1.5;
          const tp = price - atrVal * 2;
          
          let exit = price, outcome = 'breakeven';
          for (let j = 1; j <= 10 && i + j < candles.length; j++) {
            if (candles[i+j].high >= sl) { exit = sl; outcome = 'loss'; break; }
            if (candles[i+j].low <= tp) { exit = tp; outcome = 'win'; break; }
          }
          
          emaCrossShortFilteredTrades.push({
            date: new Date(candles[i].timestamp * 1000).toLocaleDateString('fr-FR'),
            dir: 'SELL', entry: price, exit, outcome,
            pnl: (price - exit) / pipValue,
            strategy: 'EMA Cross SHORT (Filtré)'
          });
        }
      }
    }

    // ============================================
    // STRATEGY 2: STOCHASTIC + ADX - LONG ONLY
    // ============================================
    
    const stochLongTrades = [];
    const stochShortFilteredTrades = [];
    
    for (let i = 20; i < candles.length - 10; i++) {
      const price = candles[i].close;
      const atrVal = atr[i];
      const stochVal = stoch[i];
      const adxVal = adx[Math.min(i - 14, adx.length - 1)];
      const ema200Val = ema200[i];
      
      if (!atrVal || !stochVal || !adxVal || !ema200Val) continue;
      
      // Strong trend + oversold stochastic - LONG
      if (adxVal > 25 && stochVal.k < 25 && stochVal.d < 25 && stochVal.k > stochVal.d) {
        const sl = price - atrVal * 1.3;
        const tp = price + atrVal * 2;
        
        let exit = price, outcome = 'breakeven';
        for (let j = 1; j <= 10 && i + j < candles.length; j++) {
          if (candles[i+j].low <= sl) { exit = sl; outcome = 'loss'; break; }
          if (candles[i+j].high >= tp) { exit = tp; outcome = 'win'; break; }
        }
        
        stochLongTrades.push({
          date: new Date(candles[i].timestamp * 1000).toLocaleDateString('fr-FR'),
          dir: 'BUY', entry: price, exit, outcome,
          pnl: (exit - price) / pipValue,
          strategy: 'Stoch LONG'
        });
        i += 3;
      }
      
      // Strong trend + overbought stochastic - SHORT WITH EMA200 FILTER
      if (adxVal > 25 && stochVal.k > 75 && stochVal.d > 75 && stochVal.k < stochVal.d) {
        // ONLY short if price is BELOW EMA200
        if (price < ema200Val) {
          const sl = price + atrVal * 1.3;
          const tp = price - atrVal * 2;
          
          let exit = price, outcome = 'breakeven';
          for (let j = 1; j <= 10 && i + j < candles.length; j++) {
            if (candles[i+j].high >= sl) { exit = sl; outcome = 'loss'; break; }
            if (candles[i+j].low <= tp) { exit = tp; outcome = 'win'; break; }
          }
          
          stochShortFilteredTrades.push({
            date: new Date(candles[i].timestamp * 1000).toLocaleDateString('fr-FR'),
            dir: 'SELL', entry: price, exit, outcome,
            pnl: (price - exit) / pipValue,
            strategy: 'Stoch SHORT (Filtré)'
          });
        }
        i += 3;
      }
    }

    // ============================================
    // STRATEGY 3: RSI REVERSAL - LONG ONLY
    // ============================================
    
    const rsiLongTrades = [];
    const rsiShortFilteredTrades = [];
    
    for (let i = 30; i < candles.length - 10; i++) {
      const price = candles[i].close;
      const atrVal = atr[i];
      const rsiVal = rsi[i];
      const ema50Val = ema50[i];
      const ema200Val = ema200[i];
      
      if (!atrVal || !ema50Val || !rsiVal || !ema200Val) continue;
      
      // Oversold in uptrend - LONG
      if (rsiVal < 35 && price > ema50Val) {
        const sl = price - atrVal * 1.2;
        const tp = price + atrVal * 1.8;
        
        let exit = price, outcome = 'breakeven';
        for (let j = 1; j <= 10 && i + j < candles.length; j++) {
          if (candles[i+j].low <= sl) { exit = sl; outcome = 'loss'; break; }
          if (candles[i+j].high >= tp) { exit = tp; outcome = 'win'; break; }
        }
        
        rsiLongTrades.push({
          date: new Date(candles[i].timestamp * 1000).toLocaleDateString('fr-FR'),
          dir: 'BUY', entry: price, exit, outcome,
          pnl: (exit - price) / pipValue,
          strategy: 'RSI LONG'
        });
        i += 2;
      }
      
      // Overbought in downtrend - SHORT WITH EMA200 FILTER
      if (rsiVal > 65 && price < ema50Val && price < ema200Val) {
        const sl = price + atrVal * 1.2;
        const tp = price - atrVal * 1.8;
        
        let exit = price, outcome = 'breakeven';
        for (let j = 1; j <= 10 && i + j < candles.length; j++) {
          if (candles[i+j].high >= sl) { exit = sl; outcome = 'loss'; break; }
          if (candles[i+j].low <= tp) { exit = tp; outcome = 'win'; break; }
        }
        
        rsiShortFilteredTrades.push({
          date: new Date(candles[i].timestamp * 1000).toLocaleDateString('fr-FR'),
          dir: 'SELL', entry: price, exit, outcome,
          pnl: (price - exit) / pipValue,
          strategy: 'RSI SHORT (Filtré)'
        });
        i += 2;
      }
    }

    // ============================================
    // STRATEGY 4: BREAKOUT - LONG ONLY
    // ============================================
    
    const breakoutLongTrades = [];
    const breakoutShortFilteredTrades = [];
    
    for (let i = 30; i < candles.length - 10; i++) {
      const price = candles[i].close;
      const atrVal = atr[i];
      const ema200Val = ema200[i];
      
      if (!atrVal || !ema200Val) continue;
      
      const lookback = 15;
      const recentHigh = Math.max(...candles.slice(i - lookback, i).map(c => c.high));
      const recentLow = Math.min(...candles.slice(i - lookback, i).map(c => c.low));
      const range = recentHigh - recentLow;
      
      // Breakout above resistance - LONG
      if (price > recentHigh && range > atrVal * 2) {
        const sl = recentHigh - atrVal;
        const tp = price + range * 0.5;
        
        let exit = price, outcome = 'breakeven';
        for (let j = 1; j <= 10 && i + j < candles.length; j++) {
          if (candles[i+j].low <= sl) { exit = sl; outcome = 'loss'; break; }
          if (candles[i+j].high >= tp) { exit = tp; outcome = 'win'; break; }
        }
        
        breakoutLongTrades.push({
          date: new Date(candles[i].timestamp * 1000).toLocaleDateString('fr-FR'),
          dir: 'BUY', entry: price, exit, outcome,
          pnl: (exit - price) / pipValue,
          strategy: 'Breakout LONG'
        });
        i += 5;
      }
      
      // Breakdown below support - SHORT WITH EMA200 FILTER
      if (price < recentLow && range > atrVal * 2 && price < ema200Val) {
        const sl = recentLow + atrVal;
        const tp = price - range * 0.5;
        
        let exit = price, outcome = 'breakeven';
        for (let j = 1; j <= 10 && i + j < candles.length; j++) {
          if (candles[i+j].high >= sl) { exit = sl; outcome = 'loss'; break; }
          if (candles[i+j].low <= tp) { exit = tp; outcome = 'win'; break; }
        }
        
        breakoutShortFilteredTrades.push({
          date: new Date(candles[i].timestamp * 1000).toLocaleDateString('fr-FR'),
          dir: 'SELL', entry: price, exit, outcome,
          pnl: (price - exit) / pipValue,
          strategy: 'Breakout SHORT (Filtré)'
        });
        i += 5;
      }
    }

    // ============================================
    // CALCULATE STATS
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

    // Combine all LONG trades
    const allLongTrades = [...emaCrossLongTrades, ...stochLongTrades, ...rsiLongTrades, ...breakoutLongTrades];
    const longStats = calcStats(allLongTrades, 'LONG uniquement');
    
    // Combine all filtered SHORT trades
    const allShortFiltered = [...emaCrossShortFilteredTrades, ...stochShortFilteredTrades, ...rsiShortFilteredTrades, ...breakoutShortFilteredTrades];
    const shortStats = calcStats(allShortFiltered, 'SHORT filtrés');
    
    // Combined stats
    const allTrades = [...allLongTrades, ...allShortFiltered];
    const combinedStats = calcStats(allTrades, 'COMBINAISON');

    // ============================================
    // DISPLAY RESULTS
    // ============================================
    
    console.log('═'.repeat(78));
    console.log('                    📊 RÉSULTATS - SPÉCIALISATION vs COMBINAISON');
    console.log('═'.repeat(78));

    // LONG ONLY - RECOMMENDED
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║           🟢 OPTION A: LONG UNIQUEMENT (RECOMMANDÉ)                          ║');
    console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
    console.log(`║  Total Trades:     ${longStats.total.toString().padStart(3)}                                                     ║`);
    console.log(`║  Gagnants:         ${longStats.wins.toString().padStart(3)}  (${longStats.winRate.toFixed(1)}%)                                         ║`);
    console.log(`║  Perdants:         ${longStats.losses.toString().padStart(3)}                                                     ║`);
    console.log(`║  Pips Totaux:      ${longStats.pips >= 0 ? '+' : ''}${longStats.pips.toFixed(1).padStart(8)}                                               ║`);
    console.log(`║  Gain Moyen:       +${longStats.avgWin.toFixed(1)} pips                                            ║`);
    console.log(`║  Perte Moyenne:    -${longStats.avgLoss.toFixed(1)} pips                                            ║`);
    console.log(`║  Profit Factor:    ${longStats.pf.toFixed(2)}                                                   ║`);
    console.log(`║  Expectative:      ${longStats.exp >= 0 ? '+' : ''}${longStats.exp.toFixed(1)} pips/trade                                     ║`);
    console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
    const longVerdict = longStats.exp > 15 ? '✅ EXCELLENT - Edge significatif' : longStats.exp > 0 ? '✅ RENTABLE' : '⚠️ MARGINAL';
    console.log(`║  Verdict:  ${longVerdict.padEnd(62)}║`);
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

    // SHORT FILTERED
    console.log('\n┌──────────────────────────────────────────────────────────────────────────────┐');
    console.log('│           🔴 OPTION B: SHORTS FILTRÉS (EMA 200 requis)                       │');
    console.log('├──────────────────────────────────────────────────────────────────────────────┤');
    console.log(`│  Total Trades:     ${shortStats.total.toString().padStart(3)}                                                        │`);
    console.log(`│  Win Rate:         ${shortStats.winRate.toFixed(1)}%                                                    │`);
    console.log(`│  Pips Totaux:      ${shortStats.pips >= 0 ? '+' : ''}${shortStats.pips.toFixed(1).padStart(8)}                                                  │`);
    console.log(`│  Profit Factor:    ${shortStats.pf.toFixed(2)}                                                     │`);
    console.log(`│  Expectative:      ${shortStats.exp >= 0 ? '+' : ''}${shortStats.exp.toFixed(1)} pips/trade                                         │`);
    const shortVerdict = shortStats.exp > 0 ? '✅ Acceptable avec filtre' : '❌ Toujours non rentable';
    console.log(`│  Verdict:  ${shortVerdict.padEnd(56)}│`);
    console.log('└──────────────────────────────────────────────────────────────────────────────┘');

    // COMBINED
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║           📊 COMBINAISON: LONG + SHORT FILTRÉS                               ║');
    console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
    console.log(`║  Total Trades:     ${combinedStats.total.toString().padStart(3)}                                                     ║`);
    console.log(`║  Win Rate:         ${combinedStats.winRate.toFixed(1)}%                                                   ║`);
    console.log(`║  Pips Totaux:      ${combinedStats.pips >= 0 ? '+' : ''}${combinedStats.pips.toFixed(1).padStart(8)}                                               ║`);
    console.log(`║  Profit Factor:    ${combinedStats.pf.toFixed(2)}                                                   ║`);
    console.log(`║  Expectative:      ${combinedStats.exp >= 0 ? '+' : ''}${combinedStats.exp.toFixed(1)} pips/trade                                     ║`);
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

    // PERFORMANCE COMPARISON
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║           📈 COMPARAISON DE PERFORMANCE                                      ║');
    console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
    console.log('║  Stratégie           │ Trades │ Win Rate │ Pips      │ Profit Factor │ Exp   ║');
    console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
    console.log(`║  🟢 LONG uniquement   │  ${longStats.total.toString().padStart(3)}   │  ${longStats.winRate.toFixed(1).padStart(5)}% │  ${longStats.pips >= 0 ? '+' : ''}${longStats.pips.toFixed(1).padStart(7)} │     ${longStats.pf.toFixed(2).padStart(5)}     │ ${longStats.exp >= 0 ? '+' : ''}${longStats.exp.toFixed(1).padStart(5)} ║`);
    console.log(`║  🔴 SHORT filtrés     │  ${shortStats.total.toString().padStart(3)}   │  ${shortStats.winRate.toFixed(1).padStart(5)}% │  ${shortStats.pips >= 0 ? '+' : ''}${shortStats.pips.toFixed(1).padStart(7)} │     ${shortStats.pf.toFixed(2).padStart(5)}     │ ${shortStats.exp >= 0 ? '+' : ''}${shortStats.exp.toFixed(1).padStart(5)} ║`);
    console.log(`║  ⚡ COMBINAISON       │  ${combinedStats.total.toString().padStart(3)}   │  ${combinedStats.winRate.toFixed(1).padStart(5)}% │  ${combinedStats.pips >= 0 ? '+' : ''}${combinedStats.pips.toFixed(1).padStart(7)} │     ${combinedStats.pf.toFixed(2).padStart(5)}     │ ${combinedStats.exp >= 0 ? '+' : ''}${combinedStats.exp.toFixed(1).padStart(5)} ║`);
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

    // DETAILED TRADES
    if (allLongTrades.length > 0) {
      console.log('\n📋 DÉTAIL DES TRADES LONG:');
      console.log('─'.repeat(78));
      allLongTrades.slice(-10).forEach(t => {
        const icon = t.outcome === 'win' ? '✓' : t.outcome === 'loss' ? '✗' : '○';
        console.log(`   ${icon} ${t.date} | ${t.strategy.padEnd(20)} | ${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(1)} pips`);
      });
    }

    if (allShortFiltered.length > 0) {
      console.log('\n📋 DÉTAIL DES TRADES SHORT (filtrés):');
      console.log('─'.repeat(78));
      allShortFiltered.slice(-10).forEach(t => {
        const icon = t.outcome === 'win' ? '✓' : t.outcome === 'loss' ? '✗' : '○';
        console.log(`   ${icon} ${t.date} | ${t.strategy.padEnd(20)} | ${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(1)} pips`);
      });
    }

    // FINAL RECOMMENDATION
    console.log('\n' + '═'.repeat(78));
    console.log('💡 RECOMMANDATION FINALE:');
    console.log('═'.repeat(78));
    
    if (longStats.exp > 0 && longStats.exp >= shortStats.exp) {
      console.log(`\n   ✅ SPÉCIALISATION LONG UNIQUEMENT CONSEILLÉE`);
      console.log(`   ─────────────────────────────────────────────`);
      console.log(`   Profit Factor amélioré: ${longStats.pf.toFixed(2)} (vs 1.14 précédemment)`);
      console.log(`   Expectative: +${longStats.exp.toFixed(1)} pips/trade`);
      console.log(`   Performance: +${longStats.pips.toFixed(1)} pips sur la période`);
      console.log(`\n   🎯 Règle à appliquer:`);
      console.log(`   • Trader UNIQUEMENT dans le sens de la tendance EMA 200`);
      console.log(`   • En tendance haussière: BUY uniquement`);
      console.log(`   • En tendance baissière: SELL uniquement (avec confirmation EMA 200)`);
    }
    
    if (shortStats.exp > 0) {
      console.log(`\n   ⚠️ SHORTS FILTRÉS ACCEPTABLES`);
      console.log(`   ─────────────────────────────────────`);
      console.log(`   Condition: Prix < EMA 200 (confirmation tendance baissière)`);
      console.log(`   Profit Factor: ${shortStats.pf.toFixed(2)}`);
    }

    console.log('\n' + '═'.repeat(78));
    console.log('                    ✅ Backtest EUR/USD optimisé terminé');
    console.log('═'.repeat(78) + '\n');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

runBacktest();
