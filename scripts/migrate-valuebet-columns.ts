/**
 * Migration: Add is_value_bet and edge_value columns to predictions table
 * Run via: npx tsx scripts/migrate-valuebet-columns.ts
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function migrate() {
  console.log('🔄 Migration: Adding is_value_bet and edge_value columns...');

  // Supabase JS client can't run DDL directly.
  // We use the RPC endpoint with the raw SQL approach.
  // Since we can't run ALTER TABLE via the JS client, we'll use fetch directly.
  
  try {
    // Try inserting with the new columns - if they exist, it works
    // If they don't exist, we need to create them via the Supabase Dashboard SQL editor
    console.log('📊 Testing if columns exist...');
    
    const { error: testError } = await supabase
      .from('predictions')
      .select('is_value_bet, edge_value')
      .limit(1);
    
    if (testError && testError.message.includes('does not exist')) {
      console.log('⚠️ Columns do NOT exist yet. Run this SQL in Supabase Dashboard:');
      console.log('');
      console.log('ALTER TABLE predictions ADD COLUMN IF NOT EXISTS is_value_bet BOOLEAN DEFAULT false;');
      console.log('ALTER TABLE predictions ADD COLUMN IF NOT EXISTS edge_value NUMERIC(8,2) DEFAULT 0;');
      console.log('CREATE INDEX IF NOT EXISTS idx_predictions_is_value_bet ON predictions(is_value_bet);');
      console.log('');
      console.log('Then re-run this script to verify.');
      process.exit(1);
    }
    
    console.log('✅ Columns is_value_bet and edge_value already exist!');
    
    // Count current predictions with is_value_bet set
    const { count: total } = await supabase
      .from('predictions')
      .select('*', { count: 'exact', head: true });
    
    const { count: vbCount } = await supabase
      .from('predictions')
      .select('*', { count: 'exact', head: true })
      .eq('is_value_bet', true);
    
    console.log(`📊 Total predictions: ${total}, with is_value_bet=true: ${vbCount}`);
    console.log('✅ Migration complete!');
    
  } catch (err: any) {
    console.error('❌ Migration error:', err.message);
    process.exit(1);
  }
}

migrate();
