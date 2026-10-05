/**
 * Unit tests for security sanitization utilities.
 *
 * Covers: sanitizeForJSONLD, sanitizeUrl, sanitizeDisplayName, sanitizeComment.
 * These are pure functions with no DB / Redis / network dependencies.
 */
import { describe, it, expect } from 'vitest';
import {
  sanitizeForJSONLD,
  sanitizeUrl,
  sanitizeDisplayName,
  sanitizeComment,
  sanitizeUserText,
} from '@/lib/security';

describe('sanitizeForJSONLD', () => {
  it('escapes </script> tags', () => {
    expect(sanitizeForJSONLD('</script>')).toBe('\\u003c/script\\u003e');
  });

  it('escapes & character', () => {
    expect(sanitizeForJSONLD('a&b')).toBe('a\\u0026b');
  });

  it('escapes < and > characters', () => {
    expect(sanitizeForJSONLD('a<b>c')).toBe('a\\u003cb\\u003ec');
  });

  it('escapes unicode line separators (U+2028)', () => {
    expect(sanitizeForJSONLD('a\u2028b')).toBe('a\\u2028b');
  });

  it('escapes unicode paragraph separators (U+2029)', () => {
    expect(sanitizeForJSONLD('a\u2029b')).toBe('a\\u2029b');
  });

  it('handles empty string', () => {
    expect(sanitizeForJSONLD('')).toBe('');
  });

  it('preserves safe JSON content', () => {
    expect(sanitizeForJSONLD('{"name":"AniChin"}')).toBe('{"name":"AniChin"}');
  });
});

describe('sanitizeUrl', () => {
  it('allows https URLs', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
  });

  it('allows http URLs', () => {
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('allows relative URLs', () => {
    expect(sanitizeUrl('/path')).toBe('/path');
  });

  it('allows hash URLs', () => {
    expect(sanitizeUrl('#section')).toBe('#section');
  });

  it('rejects javascript: protocol', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
  });

  it('rejects vbscript: protocol', () => {
    expect(sanitizeUrl('vbscript:msgbox(1)')).toBe('');
  });

  it('rejects data: protocol', () => {
    expect(sanitizeUrl('data:text/html,<script>')).toBe('');
  });

  it('handles null/undefined', () => {
    expect(sanitizeUrl(null)).toBe('');
    expect(sanitizeUrl(undefined)).toBe('');
  });

  it('handles empty string', () => {
    expect(sanitizeUrl('')).toBe('');
  });

  it('trims whitespace before validating', () => {
    expect(sanitizeUrl('  /path  ')).toBe('/path');
  });
});

describe('sanitizeDisplayName', () => {
  it('returns "Anonim" for empty string', () => {
    expect(sanitizeDisplayName('')).toBe('Anonim');
  });

  it('returns "Anonim" for nullish input', () => {
    // The function signature says string, but we want to be defensive.
    expect(sanitizeDisplayName(null as unknown as string)).toBe('Anonim');
    expect(sanitizeDisplayName(undefined as unknown as string)).toBe('Anonim');
  });

  it('strips HTML tags', () => {
    expect(sanitizeDisplayName('<script>alert(1)</script>John')).toBe('alert(1)John');
  });

  it('removes <img> tags with attributes', () => {
    expect(sanitizeDisplayName('<img src=x onerror=alert(1)>John')).toBe('John');
  });

  it('limits to 30 characters', () => {
    const long = 'A'.repeat(100);
    const result = sanitizeDisplayName(long);
    expect(result.length).toBe(30);
  });

  it('preserves normal names', () => {
    expect(sanitizeDisplayName('Siti Rahmawati')).toBe('Siti Rahmawati');
  });

  it('strips double-encoded HTML entities', () => {
    expect(sanitizeDisplayName('&lt;script&gt;')).toBe('');
  });
});

describe('sanitizeComment', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeComment('')).toBe('');
  });

  it('strips HTML tags', () => {
    expect(sanitizeComment('<b>hello</b>')).toBe('hello');
  });

  it('strips script tags', () => {
    expect(sanitizeComment('<script>alert(1)</script>hi')).toBe('alert(1)hi');
  });

  it('limits to 500 characters', () => {
    const long = 'X'.repeat(1000);
    const result = sanitizeComment(long);
    expect(result.length).toBe(500);
  });

  it('preserves normal comment text', () => {
    expect(sanitizeComment('Episode ini keren banget!')).toBe(
      'Episode ini keren banget!'
    );
  });
});

describe('sanitasi multi-karakter stabil (alert CodeQL #1 & #6)', () => {
  it('sanitizeComment tidak menyisakan tag dari input bersarang', () => {
    // Satu pass replace() dulu menyisakan "<script>" dari input semacam ini.
    const result = sanitizeComment('<<script>script>alert(1)<</script>/script>');
    expect(result).not.toMatch(/<script/i);
    expect(result).not.toContain('<');
  });

  it('sanitizeUserText juga stabil untuk tag bersarang', () => {
    const result = sanitizeUserText('<<b>b>halo<</b>/b>', 500);
    expect(result).not.toContain('<');
  });

  it('sanitizeUserText membuang tag sekali jalan untuk input normal', () => {
    expect(sanitizeUserText('<b>Halo</b> <script>alert(1)</script> dunia', 500)).toBe('Halo alert(1) dunia');
  });
});
