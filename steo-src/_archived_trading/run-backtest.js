// Direct Backtest Runner - Tests EUR/USD with Strict Strategy
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
  console.log('\n' + '='.repeat(60));
  console.log('📊 BACKTEST EUR/USD - STRATEGIE STRICTE V2');
  console.log('='.repeat(60));
  console.log('\n🔧 Configuration:');
  console.log('   • Paire: EUR/USD');
  console.log('   • Timeframe: Daily');
  console.log('   • R:R Minimum: 1:3');
  console.log('   • Confluence Min: 75/100');
  console.log('   • Trend Filter: EMA 200 requis');
  console.log('\n⏳ Chargement des données...\n');

  try {
    const data = await fetchYahooData(SYMBOL, '1d', '6mo');
    
    if (!data.chart?.result?.[0]) {
      console.error('❌ Erreur: Impossible de récupérer les données');
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

    // Now we need to run the strict backtest
    // Since we can't import TS directly, let's implement the logic here
    
    console.log('\n🔄 Exécution du backtest...\n');
    
    const pipValue = 0.0001;
    const MIN_CONFLUENCE = 75;
    const RR_RATIO = 3;
    const ATR_MULTIPLIER = 1.5;
    
    const trades = [];
    
    // Simple indicator calculations
    function calculateEMA(data, period) {
      const result = [];
      const multiplier = 2 / (period + 1);
      let sum = 0;
      
      for (let i = 0; i < period; i++) {
        sum += data[i];
        result.push(null);
      }
      result[period - 1] = sum / period;
      
      for (let i = period; i < data.length; i++) {
        result.push((data[i] - result[i - 1]) * multiplier + result[i - 1]);
      }
      return result;
    }

    function calculateRSI(closes, period = 14) {
      const result = [];
      const gains = [];
      const losses = [];
      
      for (let i = 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        gains.push(change > 0 ? change : 0);
        losses.push(change < 0 ? Math.abs(change) : 0);
      }
      
      for (let i = 0; i < period; i++) result.push(50);
      
      let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
      let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
      
      for (let i = period; i < gains.length; i++) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
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

    // Calculate indicators for each point
    const closes = candles.map(c => c.close);
    const ema9 = calculateEMA(closes, 9);
    const ema21 = calculateEMA(closes, 21);
    const ema50 = calculateEMA(closes, 50);
    const ema200 = calculateEMA(closes, 200);
    const rsi = calculateRSI(closes);
    const atr = calculateATR(candles);
    
    // Scan for trades
    for (let i = 200; i < candles.length - 30; i++) {
      const currentPrice = candles[i].close;
      const currentATR = atr[i] || 0;
      const currentRSI = rsi[i] || 50;
      const currentEma200 = ema200[i];
      
      if (!currentEma200 || !currentATR) continue;
      
      // TREND FILTER
      const isAboveEma200 = currentPrice > currentEma200;
      const isBelowEma200 = currentPrice < currentEma200;
      
      // Calculate simple confluence
      let confluence = 0;
      
      // Trend filter (30 pts max)
      if (isAboveEma200 && ema9[i] > ema21[i]) {
        confluence += 25;
      } else if (isBelowEma200 && ema9[i] < ema21[i]) {
        confluence += 25;
      }
      
      // Momentum (20 pts)
      if (isAboveEma200) {
        if (currentRSI < 50) confluence += 10;
        if (currentRSI < 40) confluence += 5;
      } else if (isBelowEma200) {
        if (currentRSI > 50) confluence += 10;
        if (currentRSI > 60) confluence += 5;
      }
      
      // RSI condition (15 pts)
      if (isAboveEma200 && currentRSI < 35) confluence += 15;
      else if (isAboveEma200 && currentRSI < 45) confluence += 10;
      else if (isBelowEma200 && currentRSI > 65) confluence += 15;
      else if (isBelowEma200 && currentRSI > 55) confluence += 10;
      
      // Session (5 pts) - simplified
      confluence += 4;
      
      // Determine direction
      let direction = null;
      if (isAboveEma200 && confluence >= MIN_CONFLUENCE) {
        direction = 'BUY';
      } else if (isBelowEma200 && confluence >= MIN_CONFLUENCE) {
        direction = 'SELL';
      }
      
      if (!direction) continue;
      
      // Calculate SL and TP
      const slDistance = currentATR * ATR_MULTIPLIER;
      const tpDistance = slDistance * RR_RATIO;
      
      let stopLoss, takeProfit;
      if (direction === 'BUY') {
        stopLoss = currentPrice - slDistance;
        takeProfit = currentPrice + tpDistance;
      } else {
        stopLoss = currentPrice + slDistance;
        takeProfit = currentPrice - tpDistance;
      }
      
      // Simulate trade
      let outcome = 'loss';
      let exitPrice = stopLoss;
      
      for (let j = 1; j <= 30 && i + j < candles.length; j++) {
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
      
      trades.push({
        date: new Date(candles[i].timestamp * 1000).toLocaleDateString('fr-FR'),
        direction,
        entry: currentPrice.toFixed(5),
        confluence,
        trendFilter: isAboveEma200 ? '↑ BULL' : '↓ BEAR',
        outcome,
        pnl: pnl.toFixed(1)
      });
      
      i += 5; // Avoid overtrading
    }
    
    // Calculate stats
    const wins = trades.filter(t => t.outcome === 'win');
    const losses = trades.filter(t => t.outcome === 'loss');
    const totalPips = trades.reduce((sum, t) => sum + parseFloat(t.pnl), 0);
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + parseFloat(t.pnl), 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + parseFloat(t.pnl), 0) / losses.length) : 0;
    const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
    const profitFactor = avgLoss > 0 ? (avgWin * wins.length) / (avgLoss * losses.length) : 0;
    const expectancy = (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss);
    const breakEvenWR = 100 / (1 + RR_RATIO);
    
    // Display results
    console.log('═'.repeat(60));
    console.log('📈 RÉSULTATS DU BACKTEST');
    console.log('═'.repeat(60));
    
    console.log('\n📊 Statistiques Générales:');
    console.log(`   Total Trades:     ${trades.length}`);
    console.log(`   Gagnants:         ${wins.length} (${winRate.toFixed(1)}%)`);
    console.log(`   Perdants:         ${losses.length}`);
    console.log(`   Pips Totaux:      ${totalPips.toFixed(1)}`);
    
    console.log('\n💰 Analyse de Rentabilité:');
    console.log(`   Gain Moyen:       +${avgWin.toFixed(1)} pips`);
    console.log(`   Perte Moyenne:    -${avgLoss.toFixed(1)} pips`);
    console.log(`   Profit Factor:    ${profitFactor.toFixed(2)}`);
    console.log(`   Expectative:      ${expectancy >= 0 ? '+' : ''}${expectancy.toFixed(1)} pips/trade`);
    
    console.log('\n🎯 Analyse Mathématique:');
    console.log(`   Win Rate Break-even: ${breakEvenWR.toFixed(1)}% (avec R:R 1:3)`);
    console.log(`   Win Rate Actuel:     ${winRate.toFixed(1)}%`);
    console.log(`   Marge:               ${winRate > breakEvenWR ? '+' : ''}${(winRate - breakEvenWR).toFixed(1)}% vs break-even`);
    
    console.log('\n📊 Verdict:');
    if (expectancy > 0) {
      console.log('   ✅ STRATÉGIE RENTABLE - Edge positif détecté');
    } else if (expectancy > -5) {
      console.log('   ⚠️  STRATÉGIE NEUTRE - Ajustements recommandés');
    } else {
      console.log('   ❌ STRATÉGIE NON RENTABLE - Révision nécessaire');
    }
    
    if (trades.length > 0) {
      console.log('\n📋 Derniers Trades:');
      console.log('─'.repeat(60));
      trades.slice(-10).forEach(t => {
        const icon = t.outcome === 'win' ? '✓' : '✗';
        const pnlColor = parseFloat(t.pnl) >= 0 ? '+' : '';
        console.log(`   ${icon} ${t.date} | ${t.direction === 'BUY' ? 'ACHAT' : 'VENTE'} | ${t.trendFilter} | Conf: ${t.confluence} | ${pnlColor}${t.pnl} pips`);
      });
    }
    
    console.log('\n' + '═'.repeat(60));
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

runBacktest();
