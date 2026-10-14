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
  normalizeBackupCode,
  isBackupCode,
  hashBackupCodes,
  matchBackupCodeHash,
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

  it('codes are in XXXXX-XXXXX format (5 byte / 40 bit per kode, F-10)', () => {
    const codes = generateBackupCodes();
    codes.forEach((code) => {
      expect(code).toMatch(/^[A-F0-9]{5}-[A-F0-9]{5}$/);
    });
  });

  it('generates unique codes', () => {
    const codes = generateBackupCodes();
    const unique = new Set(codes);
    // Statistically extremely unlikely to collide with 8 codes from 40 bits each.
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

// ---------------------------------------------------------------------------
// Kode cadangan 2FA (audit F-10)
// ---------------------------------------------------------------------------

describe('generateBackupCodes (F-10)', () => {
  it('menghasilkan format XXXXX-XXXXX (hex) yang unik', () => {
    const codes = generateBackupCodes(8);

    expect(codes).toHaveLength(8);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-F]{5}-[0-9A-F]{5}$/);
    }
    expect(new Set(codes).size).toBe(8);
  });

  it('entropi 5 byte per kode (format lama 4 byte dinaikkan)', () => {
    const codes = generateBackupCodes(20);
    // 40 bit ruang kunci: 20 kode acak tidak boleh bertabrakan.
    expect(new Set(codes).size).toBe(20);
  });
});

describe('normalizeBackupCode / isBackupCode (F-10)', () => {
  it('menormalkan huruf kecil, spasi, dan kode tanpa dash', () => {
    expect(normalizeBackupCode('abcde-f1234')).toBe('ABCDE-F1234');
    expect(normalizeBackupCode('ABCDE-F1234')).toBe('ABCDE-F1234');
    expect(normalizeBackupCode('abcde f1234')).toBe('ABCDE-F1234');
    expect(normalizeBackupCode('ABCDEF1234')).toBe('ABCDE-F1234');
    expect(normalizeBackupCode('  ABCDE-F1234  ')).toBe('ABCDE-F1234');
  });

  it('menolak input yang bukan kode cadangan', () => {
    for (const bad of ['', '12345', '123456', 'ABCDE-F123', 'ABCDE-F12345', 'ZZZZZ-FFFFF', 'ABCDE_F1234', null, undefined, 123456]) {
      expect(normalizeBackupCode(bad)).toBeNull();
      expect(isBackupCode(bad)).toBe(false);
    }
  });

  it('kode hasil generate selalu lolos normalisasi (round-trip)', () => {
    for (const code of generateBackupCodes(8)) {
      expect(normalizeBackupCode(code.toLowerCase())).toBe(code);
    }
  });
});

describe('hashBackupCodes / matchBackupCodeHash (F-10)', () => {
  it('hash bcrypt dan hanya cocok dengan kode yang benar', async () => {
    const [code] = generateBackupCodes(1);
    const [hash] = await hashBackupCodes([code]);

    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(hash).not.toContain(code);
    await expect(matchBackupCodeHash(code, [hash])).resolves.toBe(0);
    await expect(matchBackupCodeHash('FFFFF-FFFFF', [hash])).resolves.toBe(-1);
  });

  it('menemukan indeks hash yang cocok di antara beberapa kode', async () => {
    const codes = generateBackupCodes(4);
    const hashes = await hashBackupCodes(codes);

    await expect(matchBackupCodeHash(codes[0], hashes)).resolves.toBe(0);
    await expect(matchBackupCodeHash(codes[3], hashes)).resolves.toBe(3);
  });

  it('daftar hash kosong → -1', async () => {
    await expect(matchBackupCodeHash('ABCDE-F1234', [])).resolves.toBe(-1);
  });
});
