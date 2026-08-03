import { NextResponse } from 'next/server';

// SECURITY: This endpoint is disabled in production.
// It leaked service role key prefixes, env var names, and token metadata.
// Use Vercel/Supabase dashboard for environment debugging instead.

export async function GET() {
  return NextResponse.json(
    { error: 'Endpoint disabled for security reasons' },
    { status: 403 }
  );
}
