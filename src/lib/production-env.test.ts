import { describe, expect, it } from 'vitest';
import { isWeakSecret, validateAuthSecret, validateProductionEnvironment } from './production-env';

const strongHex = '7f3a0e9c42b8d16f7a50c3e29b614d8f5e2a9c47b1d6038f4a7e5c2d9b0163af';
const validProductionEnv = {
  NODE_ENV: 'production',
  NEXTAUTH_URL: 'https://anichin.id',
  NEXTAUTH_SECRET: strongHex,
  DATABASE_URL: `postgresql://anichin_app:${strongHex}@db:5432/anichin?schema=public`,
  TWO_FACTOR_ENCRYPTION_KEY: strongHex,
  SMTP_HOST: 'smtp.example.net',
  SMTP_USER: 'mailer@example.net',
  SMTP_PASS: 'another-unique-smtp-password-with-32chars',
};

describe('production environment validation', () => {
  it('accepts strong production credentials and email configuration', () => {
    expect(() => validateProductionEnvironment(validProductionEnv)).not.toThrow();
  });

  it('does not enforce production configuration during tests or build-time collection', () => {
    expect(() => validateProductionEnvironment({ NODE_ENV: 'test' })).not.toThrow();
    expect(() => validateProductionEnvironment({
      ...validProductionEnv,
      NEXT_PHASE: 'phase-production-build',
      NEXTAUTH_SECRET: undefined,
    })).not.toThrow();
  });

  it('rejects a missing, short, or placeholder NextAuth secret', () => {
    expect(() => validateAuthSecret(undefined)).toThrow(/NEXTAUTH_SECRET is required/);
    expect(() => validateAuthSecret('too-short')).toThrow(/at least 32/);
    expect(() => validateAuthSecret('replace-with-openssl-rand-hex-32')).toThrow(/placeholder|weak/);
    expect(isWeakSecret('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(true);
  });

  it('requires HTTPS and rejects loopback, placeholders, credentials, and URL components', () => {
    for (const NEXTAUTH_URL of [
      'http://anichin.id',
      'https://localhost:3000',
      'https://127.0.0.1',
      'https://0.0.0.0',
      'https://[::1]',
      'https://[::]',
      'https://[::ffff:127.0.0.1]',
      'https://example.com',
      'https://user:password@anichin.id',
      'https://anichin.id/auth',
      'https://anichin.id?next=/admin',
      'https://anichin.id#fragment',
    ]) {
      expect(() => validateProductionEnvironment({ ...validProductionEnv, NEXTAUTH_URL }))
        .toThrow(/NEXTAUTH_URL/);
    }
    expect(() => validateProductionEnvironment({ ...validProductionEnv, TWO_FACTOR_ENCRYPTION_KEY: 'x'.repeat(64) }))
      .toThrow(/TWO_FACTOR_ENCRYPTION_KEY/);
  });

  it('fails closed when SMTP is incomplete or a DB URL uses a weak password', () => {
    expect(() => validateProductionEnvironment({ ...validProductionEnv, SMTP_PASS: '' }))
      .toThrow(/SMTP_PASS/);
    expect(() => validateProductionEnvironment({ ...validProductionEnv, SMTP_PASS: 'password123456789' }))
      .toThrow(/SMTP_PASS/);
    expect(() => validateProductionEnvironment({
      ...validProductionEnv,
      DATABASE_URL: 'postgresql://user:change-me@db:5432/anichin',
    })).toThrow(/DATABASE_URL/);
    expect(() => validateProductionEnvironment({
      ...validProductionEnv,
      DATABASE_URL: 'postgresql://user:short@db:5432/anichin',
    })).toThrow(/DATABASE_URL/);
  });
});
