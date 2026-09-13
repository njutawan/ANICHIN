/**
 * Two-Factor Authentication (TOTP) utilities.
 *
 * Provides:
 *  - TOTP secret generation + otpauth URL building (otplib)
 *  - TOTP token verification (±1 window = 30s drift tolerance)
 *  - One-time backup code generation (8 codes, format `XXXX-XXXX` hex)
 *  - QR code rendering as a data: URL (qrcode package)
 *  - AES-256-GCM encryption for storing the TOTP secret at rest
 *
 * Environment:
 *   TWO_FACTOR_ENCRYPTION_KEY — 64-char hex string (32 bytes).
 *   If unset in dev, a random key is generated once per process and a warning
 *   is logged. In production the missing key triggers a hard error at first use
 *   (so secrets cannot be silently unprotected).
 */

import { logger } from '@/lib/logger';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import crypto from 'crypto';

const ISSUER = 'AniChin';

// ±30s epoch tolerance = ±1 TOTP step (default step is 30s). This lets users
// whose device clock is slightly off still authenticate.
const EPOCH_TOLERANCE_SEC = 30;

// ---------------------------------------------------------------------------
// TOTP primitives
// ---------------------------------------------------------------------------


/**
 * Generate a new TOTP secret and the corresponding otpauth:// URL.
 * The URL is consumed by authenticator apps (Google Authenticator, Authy, 1Password).
 */
export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
}
export function generateTwoFactorSecret(email: string): TwoFactorSetup {
  const secret = generateSecret();
  const otpauthUrl = generateURI({
    issuer: ISSUER,
    label: email,
    secret,
  });
  return { secret, otpauthUrl };
}

/**
 * Verify a 6-digit TOTP token against the stored secret.
 * Accepts tokens within ±1 step (±30s) of the current time.
 */
export function verifyTwoFactorToken(token: string, secret: string): boolean {
  if (!token || !secret) return false;
  // Strip whitespace, normalize (some authenticators paste with spaces).
  const cleanToken = String(token).replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanToken)) return false;
  try {
    const result = verifySync({
      secret,
      token: cleanToken,
      epochTolerance: EPOCH_TOLERANCE_SEC,
    });
    return result.valid === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Backup codes
// ---------------------------------------------------------------------------

/**
 * Generate 8 single-use backup codes, each formatted as `XXXX-XXXX` (hex).
 * Returned to the user once during 2FA enable flow; the user must store them
 * securely. (Note: the current schema does not persist backup codes; they are
 * shown once and the verify endpoint only checks TOTP tokens for now.)
 */
export function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // 4 bytes = 8 hex chars → split into two halves with a dash
    const bytes = crypto.randomBytes(4);
    const hex = bytes.toString('hex').toUpperCase(); // 8 chars
    codes.push(`${hex.slice(0, 4)}-${hex.slice(4, 8)}`);
  }
  return codes;
}

// ---------------------------------------------------------------------------
// QR code
// ---------------------------------------------------------------------------

/**
 * Render an otpauth:// URL as a PNG data: URL for embedding in <img src="...">.
 */
export async function generateQrCodeDataURL(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
}

// ---------------------------------------------------------------------------
// Encryption (AES-256-GCM)
// ---------------------------------------------------------------------------

const KEY_BYTES = 32; // 256-bit key for AES-256-GCM
const IV_BYTES = 12; // 96-bit IV is recommended for GCM

let cachedKey: Buffer | null = null;
let warnedAboutMissingKey = false;

/**
 * Resolve the encryption key (32 bytes) for protecting TOTP secrets at rest.
 *
 * Source: `process.env.TWO_FACTOR_ENCRYPTION_KEY` (64-char hex string).
 * - Production: must be set, otherwise we throw (never fall back to random).
 * - Development: if missing, generate a random key once per process and warn.
 *   This means secrets encrypted in one dev session cannot be decrypted in
 *   another (acceptable for dev).
 */
function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const envKey = process.env.TWO_FACTOR_ENCRYPTION_KEY;

  if (!envKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'TWO_FACTOR_ENCRYPTION_KEY missing in production. Set a 64-char hex string (32 bytes).'
      );
    }
    if (!warnedAboutMissingKey) {
      logger.warn(
        '[two-factor] TWO_FACTOR_ENCRYPTION_KEY not set — using a random ephemeral key. ' +
          'Encrypted secrets will NOT survive a server restart in dev.'
      );
      warnedAboutMissingKey = true;
    }
    cachedKey = crypto.randomBytes(KEY_BYTES);
    return cachedKey;
  }

  if (!/^[0-9a-fA-F]{64}$/.test(envKey)) {
    throw new Error(
      'TWO_FACTOR_ENCRYPTION_KEY must be a 64-char hex string (32 bytes).'
    );
  }

  cachedKey = Buffer.from(envKey, 'hex');
  return cachedKey;
}

/**
 * Encrypt a TOTP secret (base32 string) for storage in the DB.
 * Output format: `iv:authTag:ciphertext` (all hex).
 *
 * AES-256-GCM provides both confidentiality (ciphertext) and authenticity
 * (auth tag) — tampering with the stored value will fail decryption.
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) throw new Error('encryptSecret: empty plaintext');
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

/**
 * Decrypt a stored TOTP secret.
 * Input format: `iv:authTag:ciphertext` (all hex).
 * Returns the original plaintext (base32 secret), or throws on tampering /
 * wrong key.
 */
export function decryptSecret(payload: string): string {
  if (!payload) throw new Error('decryptSecret: empty payload');
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('decryptSecret: invalid payload format (expected iv:authTag:ciphertext)');
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

// ---------------------------------------------------------------------------
// In-memory pending-secret store (for the setup → enable handshake)
// ---------------------------------------------------------------------------

export interface PendingSecret {
  secret: string;
  otpauthUrl: string;
  expiresAt: number;
}

const PENDING_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Module-level Map survives across hot reloads within the same process.
// Keyed by user ID. For multi-instance prod deployments, swap this out for a
// Redis-backed store (same pattern as rate-limit-store).
const pendingSecrets = new Map<string, PendingSecret>();

function sweepExpired(): void {
  const now = Date.now();
  for (const [k, v] of pendingSecrets.entries()) {
    if (v.expiresAt < now) pendingSecrets.delete(k);
  }
}

/**
 * Stash a freshly generated TOTP secret for a user, valid for 5 minutes.
 * The user must call /enable with a valid 6-digit token before the TTL expires.
 */
export function setPendingSecret(
  userId: string,
  secret: string,
  otpauthUrl: string
): void {
  sweepExpired();
  pendingSecrets.set(userId, {
    secret,
    otpauthUrl,
    expiresAt: Date.now() + PENDING_TTL_MS,
  });
}

/**
 * Retrieve (without removing) the pending secret for a user.
 * Returns null if no entry exists or it has expired.
 */
export function getPendingSecret(userId: string): PendingSecret | null {
  const entry = pendingSecrets.get(userId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    pendingSecrets.delete(userId);
    return null;
  }
  return entry;
}

/**
 * Remove the pending secret after a successful enable (or user cancel).
 */
export function clearPendingSecret(userId: string): void {
  pendingSecrets.delete(userId);
}
