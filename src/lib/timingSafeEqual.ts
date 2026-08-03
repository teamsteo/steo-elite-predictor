import { timingSafeEqual as cryptoTimingSafeEqual } from 'crypto';

/**
 * Timing-safe string comparison to prevent timing attacks.
 * Uses SHA-256 hash comparison to handle variable-length inputs safely.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);
  
  // Hash both inputs to fixed length to prevent length-based timing leaks
  const crypto = require('crypto');
  const aHash = crypto.createHash('sha256').update(aBuf).digest();
  const bHash = crypto.createHash('sha256').update(bBuf).digest();
  
  if (aHash.length !== bHash.length) return false;
  
  return cryptoTimingSafeEqual(aHash, bHash);
}
