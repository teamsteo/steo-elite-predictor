import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');

  if (!CRON_SECRET || !secret || !timingSafeEqual(Buffer.from(secret), Buffer.from(CRON_SECRET))) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase non configuré' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('🔄 Migration: Adding is_value_bet and edge_value columns...');

    // Step 1: Test if columns already exist
    const { error: testError } = await supabase
      .from('predictions')
      .select('is_value_bet, edge_value')
      .limit(1);

    if (!testError) {
      console.log('✅ Columns already exist!');
      const { count: total } = await supabase
        .from('predictions')
        .select('*', { count: 'exact', head: true });
      const { count: vbCount } = await supabase
        .from('predictions')
        .select('*', { count: 'exact', head: true })
        .eq('is_value_bet', true);
      
      return NextResponse.json({
        success: true,
        message: 'Columns already exist',
        total_predictions: total,
        value_bet_predictions: vbCount,
      });
    }

    // Step 2: Columns don't exist — provide SQL for manual execution
    const sqlStatements = [
      'ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS is_value_bet BOOLEAN DEFAULT false;',
      'ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS edge_value NUMERIC(8,2) DEFAULT 0;',
      'CREATE INDEX IF NOT EXISTS idx_predictions_is_value_bet ON public.predictions(is_value_bet);',
      'COMMENT ON COLUMN public.predictions.is_value_bet IS \'True if ML model detected a value bet (model prob > market implied prob by >5%)\';',
      'COMMENT ON COLUMN public.predictions.edge_value IS \'Edge percentage (model prob - market implied prob)\';',
    ];

    console.log('⚠️ Columns do not exist. SQL provided for manual execution.');
    return NextResponse.json({
      success: false,
      message: 'Columns do not exist yet. Run the SQL below in Supabase Dashboard > SQL Editor.',
      sql_to_run: sqlStatements,
      dashboard_url: `${supabaseUrl.replace('/rest/v1', '')}/project/sql`,
    });

  } catch (err: any) {
    console.error('❌ Migration error:', err);
    return NextResponse.json({
      success: false,
      error: err.message,
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret');

  if (!CRON_SECRET || !secret || !timingSafeEqual(Buffer.from(secret), Buffer.from(CRON_SECRET))) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase non configuré' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { error } = await supabase
    .from('predictions')
    .select('is_value_bet, edge_value')
    .limit(1);

  if (error) {
    return NextResponse.json({
      migrated: false,
      error: error.message,
      sql_needed: [
        'ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS is_value_bet BOOLEAN DEFAULT false;',
        'ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS edge_value NUMERIC(8,2) DEFAULT 0;',
        'CREATE INDEX IF NOT EXISTS idx_predictions_is_value_bet ON public.predictions(is_value_bet);',
      ],
    });
  }

  const { count: total } = await supabase
    .from('predictions')
    .select('*', { count: 'exact', head: true });
  const { count: vbCount } = await supabase
    .from('predictions')
    .select('*', { count: 'exact', head: true })
    .eq('is_value_bet', true);

  return NextResponse.json({
    migrated: true,
    total_predictions: total,
    value_bet_predictions: vbCount,
  });
}
