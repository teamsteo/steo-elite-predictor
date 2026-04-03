import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { password } = await request.json();
  
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashedPassword = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  
  const expected = '114663ab194edcb3f61d409883ce4ae6c3c2f9854194095a5385011d15becbef';
  
  return NextResponse.json({
    input: password,
    computedHash: hashedPassword,
    expectedHash: expected,
    match: hashedPassword === expected
  });
}
