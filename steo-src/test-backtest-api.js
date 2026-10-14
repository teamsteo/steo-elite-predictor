// Test backtest API locally
async function testBacktest() {
  try {
    const response = await fetch('http://localhost:3000/api/backtest?symbol=EURUSD=X&timeframe=1D');
    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(data, null, 2).slice(0, 500));
    
    // Check required fields
    const required = ['summary', 'patternStats', 'recommendedPatterns'];
    for (const field of required) {
      if (!data[field]) {
        console.error('Missing field:', field);
      } else {
        console.log('✓ Has field:', field);
      }
    }
    
    // Check summary fields
    const summaryFields = ['totalTrades', 'winRate', 'totalPips', 'profitFactor', 'maxDrawdown', 'sharpeRatio'];
    for (const field of summaryFields) {
      if (data.summary && data.summary[field] === undefined) {
        console.error('Missing summary field:', field);
      } else {
        console.log('✓ Has summary.' + field + ':', data.summary?.[field]);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testBacktest();
