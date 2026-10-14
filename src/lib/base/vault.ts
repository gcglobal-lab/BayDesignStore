import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Admins can look up a team member's current password (owner's decision: passwords are
 * set and handed out by the admin only). Sign-in still checks the scrypt hash; this is
 * a separate AES-256-GCM encrypted copy whose key never leaves the server.
 *
 * Key: PASSWORD_VAULT_KEY if set, otherwise derived from SESSION_SECRET. Changing either
 * makes stored copies unreadable (the passwords themselves keep working).
 * Stored as `v1:iv:tag:ciphertext` (base64url).
 */
function key(): Buffer {
  const material = process.env.PASSWORD_VAULT_KEY?.trim() || `${process.env.SESSION_SECRET ?? ''}:bay-design-password-vault`;
  if (material.length < 32) throw new Error('SESSION_SECRET (or PASSWORD_VAULT_KEY) must be at least 32 characters.');
  return createHash('sha256').update(material).digest();
}

export function sealPassword(password: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join(':');
}

/** The password, or null if there is no copy or it can't be decrypted with the current key. */
export function openPassword(sealed: string | null | undefined): string | null {
  const parts = (sealed ?? '').split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(parts[1], 'base64url'));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
