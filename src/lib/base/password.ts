import 'server-only';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing with scrypt (memory-hard, built into Node — no native addons).
 * Stored as `scrypt:N:r:p:salt:hash` (base64url) so the cost can be raised later
 * without breaking existing hashes. Must stay in sync with scripts/hash-password.mjs.
 */
const N = 32768;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAX_N = 1 << 20;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { N: n, r, p, maxmem: 256 * n * r }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join(':');
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = (stored ?? '').split(':');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    // Still spend the same time so a missing account can't be told apart from a wrong password.
    await derive(password, Buffer.alloc(16), N, R, P);
    return false;
  }
  const [, n, r, p, salt, hash] = parts;
  const cost = { n: Number(n), r: Number(r), p: Number(p) };
  if (!Number.isInteger(cost.n) || cost.n < 1024 || cost.n > MAX_N || (cost.n & (cost.n - 1)) !== 0) return false;
  if (!Number.isInteger(cost.r) || cost.r < 1 || cost.r > 32 || !Number.isInteger(cost.p) || cost.p < 1 || cost.p > 4) return false;
  const expected = Buffer.from(hash, 'base64url');
  if (expected.length !== KEY_LENGTH) return false;
  const actual = await derive(password, Buffer.from(salt, 'base64url'), cost.n, cost.r, cost.p);
  return timingSafeEqual(actual, expected);
}

/** Rules shared by every place a password is chosen. Returns an error message, or null if acceptable. */
export function checkPasswordStrength(password: string, loginId?: string): string | null {
  if (password.length < 10) return 'Use at least 10 characters.';
  if (password.length > 200) return 'Use at most 200 characters.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Use a mix of letters and numbers.';
  if (loginId && password.toLowerCase().includes(loginId.toLowerCase())) return 'Your password can’t contain your login ID.';
  if (/^(.)\1+$/.test(password) || /password|123456|qwerty|baydesign/i.test(password)) return 'That password is too easy to guess.';
  return null;
}

/** A random temporary password, e.g. for a new team member: 4 groups, letters + digits, easy to read aloud. */
export function generateTemporaryPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) out += '-';
    out += alphabet[bytes[i] % alphabet.length];
  }
  return /\d/.test(out) ? out : `${out.slice(0, -1)}7`;
}
