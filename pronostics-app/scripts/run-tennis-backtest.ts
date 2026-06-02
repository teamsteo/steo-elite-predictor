#!/usr/bin/env npx ts-node
/**
 * Tennis Backtesting Script - Executable standalone
 * 
 * Usage:
 *   npx ts-node scripts/run-tennis-backtest.ts
 *   npm run tennis:backtest
 * 
 * Options:
 *   --years=2025,2026    Years to backtest (default: 2025,2026)
 *   --bankroll=1000      Starting bankroll (default: 1000)
 *   --verbose            Show detailed output
 */

import { runBacktest } from '../lib/tennis-backtesting';
import { getPerformanceReport } from '../lib/tennis-auto-learning';
import * as fs from 'fs';
import * as path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const yearsArg = args.find(a => a.startsWith('--years='));
const bankrollArg = args.find(a => a.startsWith('--bankroll='));
const verbose = args.includes('--verbose');

const years = yearsArg 
  ? yearsArg.split('=')[1].split(',').map(Number)
  : [2025, 2026];

const startingBankroll = bankrollArg 
  ? parseInt(bankrollArg.split('=')[1])
  : 1000;

// Ensure data directory exists
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Main function
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🎾 TENNIS BACKTESTING SYSTEM v2026');
  console.log('='.repeat(60));
  console.log(`📅 Years: ${years.join(', ')}`);
  console.log(`💰 Starting Bankroll: $${startingBankroll}`);
  console.log(`📊 Verbose: ${verbose}`);
  console.log('');

  try {
    // Run backtest
    const results = await runBacktest(years, startingBankroll);
    
    // Get current performance metrics
    const performance = getPerformanceReport();
    
    console.log('\n' + '='.repeat(60));
    console.log('📈 DETAILED RESULTS');
    console.log('='.repeat(60));
    
    // Accuracy by confidence
    console.log('\n🎯 By Confidence Level:');
    for (const [conf, data] of Object.entries(results.byConfidence)) {
      const emoji = conf === 'very_high' ? '🔥' : conf === 'high' ? '⭐' : conf === 'medium' ? '📊' : '⚠️';
      console.log(`  ${emoji} ${conf.padEnd(12)}: ${data.accuracy.toFixed(1)}% (${data.correct}/${data.total}) | ROI: ${data.roi.toFixed(1)}%`);
    }
    
    // By surface
    console.log('\n🏟️ By Surface:');
    for (const [surface, data] of Object.entries(results.bySurface)) {
      if (data.total >= 10) {
        console.log(`  ${surface.padEnd(10)}: ${data.accuracy.toFixed(1)}% (${data.correct}/${data.total})`);
      }
    }
    
    // By tournament level
    console.log('\n🏆 By Tournament Level:');
    const levelNames: Record<string, string> = {
      'G': 'Grand Slam',
      'M': 'Masters 1000',
      'A': 'ATP 500/250',
      'D': 'Davis Cup',
      'F': 'ATP Finals',
    };
    for (const [level, data] of Object.entries(results.byLevel)) {
      if (data.total >= 20) {
        const name = levelNames[level] || level;
        console.log(`  ${name.padEnd(15)}: ${data.accuracy.toFixed(1)}% (${data.correct}/${data.total})`);
      }
    }
    
    // Bankroll simulation
    console.log('\n💰 Bankroll Simulation:');
    console.log(`  Starting:      $${results.bankrollSimulation.startingBankroll.toFixed(2)}`);
    console.log(`  Final:         $${results.bankrollSimulation.finalBankroll.toFixed(2)}`);
    console.log(`  Total Staked:  $${results.bankrollSimulation.totalStaked.toFixed(2)}`);
    console.log(`  Total Return:  $${results.bankrollSimulation.totalReturn.toFixed(2)}`);
    console.log(`  ROI:           ${results.bankrollSimulation.roi.toFixed(1)}%`);
    console.log(`  Max Drawdown:  ${results.bankrollSimulation.maxDrawdown.toFixed(1)}%`);
    console.log(`  Winning Bets:  ${results.bankrollSimulation.winningBets}`);
    console.log(`  Losing Bets:   ${results.bankrollSimulation.losingBets}`);
    
    // Recommendations
    console.log('\n📋 Recommendations:');
    for (const rec of results.recommendations) {
      console.log(`  ${rec}`);
    }
    
    // Current learning metrics
    if (performance.metrics.verifiedPredictions > 0) {
      console.log('\n🧠 Current Learning Metrics:');
      console.log(`  ${performance.summary}`);
      for (const rec of performance.recommendations) {
        console.log(`  • ${rec}`);
      }
      
      console.log('\n📊 Current Model Weights:');
      for (const [factor, weight] of Object.entries(performance.metrics.modelWeights)) {
        console.log(`  ${factor.padEnd(10)}: ${(weight * 100).toFixed(1)}%`);
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    if (results.accuracy >= 60) {
      console.log('✅ GOOD: Model performing well');
    } else if (results.accuracy >= 55) {
      console.log('⚠️ MODERATE: Model needs improvement');
    } else {
      console.log('❌ POOR: Model needs significant adjustment');
    }
    
    if (results.bankrollSimulation.roi > 0) {
      console.log(`✅ Profitable: +${results.bankrollSimulation.roi.toFixed(1)}% ROI`);
    } else {
      console.log(`❌ Unprofitable: ${results.bankrollSimulation.roi.toFixed(1)}% ROI`);
    }
    console.log('='.repeat(60) + '\n');
    
    process.exit(0);
    
  } catch (error: any) {
    console.error('\n❌ Backtest failed:', error.message);
    if (verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run
main();
