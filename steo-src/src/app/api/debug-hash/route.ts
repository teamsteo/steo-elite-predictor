import { NextResponse } from 'next/server';

// SECURITY: This endpoint is disabled in production.
// It exposed admin password hash for brute-force attacks.
// If needed for debugging, add CRON_SECRET authentication.

export async function POST() {
  return NextResponse.json(
    { error: 'Endpoint disabled for security reasons' },
    { status: 403 }
  );
}
