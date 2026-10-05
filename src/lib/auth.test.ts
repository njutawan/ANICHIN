/**
 * Unit tests for auth utilities.
 *
 * Only tests `isValidEmail` — a pure regex-based validator with no DB or
 * external dependencies. The full NextAuth config in auth.ts is intentionally
 * NOT tested here because it requires DB + cookie middleware.
 */
import { describe, it, expect } from 'vitest';
import { isGoogleClientId, isValidEmail } from '@/lib/auth';

describe('isValidEmail', () => {
  it('accepts valid emails', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('test.name+tag@domain.co.id')).toBe(true);
  });

  it('accepts emails with various valid local parts', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('user_name@domain.com')).toBe(true);
    expect(isValidEmail('user-name@domain.org')).toBe(true);
    expect(isValidEmail('user%tag@domain.io')).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(isValidEmail('notanemail')).toBe(false);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('@domain.com')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
  });

  it('rejects emails without a TLD', () => {
    expect(isValidEmail('user@localhost')).toBe(false);
    expect(isValidEmail('user@domain')).toBe(false);
  });

  it('rejects emails with spaces', () => {
    expect(isValidEmail('user @example.com')).toBe(false);
    expect(isValidEmail('user@ example.com')).toBe(false);
  });

  it('rejects emails longer than 254 chars', () => {
    const longEmail = 'a'.repeat(250) + '@b.co';
    expect(longEmail.length).toBeGreaterThan(254);
    expect(isValidEmail(longEmail)).toBe(false);
  });

  it('accepts emails at exactly the 254-char limit', () => {
    // Construct a 254-char email: 245-char local + "@b.co" (5 chars) + ".id" (3 chars) = 253... let's compute.
    // We want total length = 254.
    // local = 246 chars, domain "b.co" = 4 chars, plus '@' = 1 char → 246 + 1 + 4 = 251... adjust.
    const local = 'a'.repeat(249);
    const email = local + '@b.co';
    expect(email.length).toBe(249 + 1 + 4); // 254
    expect(isValidEmail(email)).toBe(true);
  });
});

describe('isGoogleClientId (alert CodeQL js/incomplete-url-substring-sanitization)', () => {
  it('menerima client ID Google yang valid', () => {
    expect(isGoogleClientId('123456789012-abcdefghijklmnop.apps.googleusercontent.com')).toBe(true);
    expect(isGoogleClientId('1-abc_DEF.apps.googleusercontent.com')).toBe(true);
  });

  it('menolak nilai yang hanya memuat domain sebagai substring', () => {
    // Dulu lolos karena memakai `.includes('.apps.googleusercontent.com')`.
    expect(isGoogleClientId('evil.example/apps.googleusercontent.com')).toBe(false);
    expect(isGoogleClientId('apps.googleusercontent.com.evil.example')).toBe(false);
    expect(isGoogleClientId('foo.apps.googleusercontent.com')).toBe(false);
    expect(isGoogleClientId('user@apps.googleusercontent.com')).toBe(false);
  });

  it('menolak nilai kosong / cacat', () => {
    expect(isGoogleClientId('')).toBe(false);
    expect(isGoogleClientId('apps.googleusercontent.com')).toBe(false);
    expect(isGoogleClientId('123456789012.apps.googleusercontent.com')).toBe(false);
  });
});
