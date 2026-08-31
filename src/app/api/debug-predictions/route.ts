import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'check-30';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase non configure' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    if (mode === 'check-30') {
      // Check ALL predictions for Aug 30 by any method
      const { data: byCreated30, error: e1 } = await supabase
        .from('predictions')
        .select('match_id, home_team, away_team, predicted_result, status, created_at, match_date, source, risk_percentage')
        .gte('created_at', '2026-08-30T00:00:00Z')
        .lte('created_at', '2026-08-30T23:59:59Z');

      const { data: byMatch30, error: e2 } = await supabase
        .from('predictions')
        .select('match_id, home_team, away_team, predicted_result, status, created_at, match_date, source, risk_percentage')
        .gte('match_date', '2026-08-30T00:00:00Z')
        .lte('match_date', '2026-08-30T23:59:59Z');

      const { data: allRecent, error: e3 } = await supabase
        .from('predictions')
        .select('match_id, home_team, away_team, predicted_result, status, created_at, match_date, source')
        .gte('created_at', '2026-08-28T00:00:00Z')
        .order('created_at', { ascending: false });

      return NextResponse.json({
        byCreatedAug30: { count: byCreated30?.length || 0, error: e1?.message, data: byCreated30 },
        byMatchDateAug30: { count: byMatch30?.length || 0, error: e2?.message, data: byMatch30 },
        allRecent: { count: allRecent?.length || 0, data: allRecent },
      });
    }

    return NextResponse.json({ error: 'Mode inconnu' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
