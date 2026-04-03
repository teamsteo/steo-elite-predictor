import { NextResponse } from 'next/server';

export async function GET() {
  const githubToken = process.env.GITHUB_TOKEN;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  return NextResponse.json({
    // GitHub
    hasGithubToken: !!githubToken,
    githubTokenLength: githubToken ? githubToken.length : 0,
    
    // Supabase
    hasSupabaseUrl: !!supabaseUrl,
    supabaseUrlPrefix: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : null,
    
    hasSupabaseServiceKey: !!supabaseKey,
    supabaseServiceKeyLength: supabaseKey ? supabaseKey.length : 0,
    supabaseServiceKeyPrefix: supabaseKey ? supabaseKey.substring(0, 10) + '...' : null,
    
    hasSupabaseAnonKey: !!supabaseAnonKey,
    supabaseAnonKeyLength: supabaseAnonKey ? supabaseAnonKey.length : 0,
    
    // Environment
    nodeEnv: process.env.NODE_ENV,
    
    // All env keys (for debugging - values hidden)
    envKeys: Object.keys(process.env).filter(k => 
      k.includes('SUPABASE') || k.includes('DATABASE') || k.includes('GITHUB')
    ).sort()
  });
}
