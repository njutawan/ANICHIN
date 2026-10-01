/**
 * Unit tests for 2FA (TOTP) utilities.
 *
 * Requires TWO_FACTOR_ENCRYPTION_KEY env var so encryptSecret/decryptSecret
 * use a stable key. The env is set via vitest.config.ts (test.env) and also
 * defensively here in case the test runner is invoked differently.
 *
 * These tests are self-contained — no DB, no Redis, no external APIs.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateTwoFactorSecret,
  verifyTwoFactorToken,
  generateBackupCodes,
  encryptSecret,
  decryptSecret,
} from '@/lib/two-factor';

// Set a stable 64-char hex encryption key if not already provided by config.
// Must happen before any encryptSecret/decryptSecret call (getEncryptionKey
// caches on first invocation).
beforeAll(() => {
  if (!process.env.TWO_FACTOR_ENCRYPTION_KEY) {
    process.env.TWO_FACTOR_ENCRYPTION_KEY = 'a'.repeat(64);
  }
});

describe('generateTwoFactorSecret', () => {
  it('returns secret and otpauthUrl', () => {
    const result = generateTwoFactorSecret('test@anichin.id');
    expect(result.secret).toBeDefined();
    expect(typeof result.secret).toBe('string');
    expect(result.secret.length).toBeGreaterThan(16);
    expect(result.otpauthUrl).toContain('otpauth://totp/');
    expect(result.otpauthUrl).toContain('AniChin');
  });

  it('embeds the email as the label', () => {
    const email = 'unique-user@anichin.id';
    const result = generateTwoFactorSecret(email);
    // otpauth URLs encode the label; the email's local part appears verbatim.
    expect(result.otpauthUrl).toContain('unique-user');
    // The domain part appears either verbatim or percent-encoded.
    expect(
      result.otpauthUrl.includes('anichin.id') ||
        result.otpauthUrl.includes(encodeURIComponent('anichin.id'))
    ).toBe(true);
  });

  it('generates different secrets on successive calls', () => {
    const a = generateTwoFactorSecret('user1@anichin.id');
    const b = generateTwoFactorSecret('user2@anichin.id');
    expect(a.secret).not.toBe(b.secret);
  });
});

describe('verifyTwoFactorToken', () => {
  it('returns false for wrong token', () => {
    const { secret } = generateTwoFactorSecret('test@anichin.id');
    // '000000' is very unlikely to be the live TOTP for a random secret.
    expect(verifyTwoFactorToken('000000', secret)).toBe(false);
  });

  it('returns false for malformed token', () => {
    const { secret } = generateTwoFactorSecret('test@anichin.id');
    expect(verifyTwoFactorToken('abc', secret)).toBe(false);
    expect(verifyTwoFactorToken('12345', secret)).toBe(false);
    expect(verifyTwoFactorToken('1234567', secret)).toBe(false);
    expect(verifyTwoFactorToken('abcdef', secret)).toBe(false);
  });

  it('returns false for empty inputs', () => {
    const { secret } = generateTwoFactorSecret('test@anichin.id');
    expect(verifyTwoFactorToken('', secret)).toBe(false);
    expect(verifyTwoFactorToken('123456', '')).toBe(false);
  });

  it('strips whitespace before validating', () => {
    const { secret } = generateTwoFactorSecret('test@anichin.id');
    // '000 000' would normalize to '000000' — still wrong for a random secret.
    expect(verifyTwoFactorToken('000 000', secret)).toBe(false);
  });
});

describe('generateBackupCodes', () => {
  it('returns 8 codes', () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(8);
  });

  it('codes are in XXXX-XXXX format', () => {
    const codes = generateBackupCodes();
    codes.forEach((code) => {
      expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
    });
  });

  it('generates unique codes', () => {
    const codes = generateBackupCodes();
    const unique = new Set(codes);
    // Statistically extremely unlikely to collide with 8 codes from 32 bits each.
    expect(unique.size).toBe(8);
  });

  it('respects custom count', () => {
    expect(generateBackupCodes(5)).toHaveLength(5);
    expect(generateBackupCodes(1)).toHaveLength(1);
  });
});

describe('encryptSecret / decryptSecret', () => {
  it('roundtrips correctly', () => {
    const plaintext = 'JBSWY3DPEHPK3PXP';
    const encrypted = encryptSecret(plaintext);
    expect(encrypted).not.toBe(plaintext);
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('produces iv:authTag:ciphertext format', () => {
    const encrypted = encryptSecret('KRSXG5CTMVRXEZLU');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
    // IV (24 hex chars = 12 bytes), authTag (32 hex chars = 16 bytes), ciphertext (variable)
    expect(parts[0]).toMatch(/^[0-9a-f]{24}$/);
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/);
    expect(parts[2].length).toBeGreaterThan(0);
  });

  it('produces different ciphertexts for same plaintext (random IV)', () => {
    const a = encryptSecret('JBSWY3DPEHPK3PXP');
    const b = encryptSecret('JBSWY3DPEHPK3PXP');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(b)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('handles unicode plaintext', () => {
    const plaintext = '日本語テスト🌟';
    const encrypted = encryptSecret(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it('throws on empty plaintext', () => {
    expect(() => encryptSecret('')).toThrow(/empty plaintext/i);
  });

  it('throws on tampered ciphertext', () => {
    const encrypted = encryptSecret('JBSWY3DPEHPK3PXP');
    // Flip a bit in the ciphertext portion.
    const parts = encrypted.split(':');
    const tamperedCiphertext = parts[2].slice(0, -2) + (parts[2].endsWith('0') ? 'ff' : '00');
    const tampered = [parts[0], parts[1], tamperedCiphertext].join(':');
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('throws on malformed payload', () => {
    expect(() => decryptSecret('not-a-valid-payload')).toThrow(/invalid payload format/i);
    expect(() => decryptSecret('')).toThrow(/empty payload/i);
  });
});
