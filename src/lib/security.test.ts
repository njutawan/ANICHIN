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
  sanitizeMediaUrl,
  PASSWORD_MAX_BYTES,
  utf8ByteLength,
  isPasswordTooLong,
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

// ---------------------------------------------------------------------------
// F-14 — validasi URL media admin (poster/banner/trailer)
// ---------------------------------------------------------------------------

describe('sanitizeMediaUrl (audit F-14)', () => {
  it('menerima URL http/https absolut', () => {
    expect(sanitizeMediaUrl('https://cdn.example.com/poster.jpg')).toBe(
      'https://cdn.example.com/poster.jpg'
    );
    expect(sanitizeMediaUrl('http://example.com/a.png')).toBe('http://example.com/a.png');
    expect(sanitizeMediaUrl('  https://example.com/x.jpg  ')).toBe('https://example.com/x.jpg');
  });

  it('menerima path internal situs', () => {
    expect(sanitizeMediaUrl('/images/poster.jpg')).toBe('/images/poster.jpg');
  });

  it('menolak skema berbahaya dan bentuk yang tidak terkontrol', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      '#fragmen',
      '//evil.example.com/poster.jpg',
      'bukan url',
      '',
      '   ',
      null,
      undefined,
      123,
    ]) {
      expect(sanitizeMediaUrl(bad as unknown)).toBeNull();
    }
  });

  it('menolak nilai yang terlalu panjang', () => {
    const long = `https://example.com/${'a'.repeat(2000)}.jpg`;
    expect(sanitizeMediaUrl(long)).toBeNull();
    expect(sanitizeMediaUrl(`https://example.com/${'a'.repeat(50)}.jpg`, 40)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// F-17 — batas bcrypt 72 byte
// ---------------------------------------------------------------------------

describe('batas panjang password bcrypt (audit F-17)', () => {
  it('menghitung byte UTF-8, bukan jumlah karakter', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('漢')).toBe(3);
    expect(utf8ByteLength('🎬')).toBe(4);
  });

  it('72 byte masih boleh, 73 byte tidak', () => {
    expect(PASSWORD_MAX_BYTES).toBe(72);
    expect(isPasswordTooLong('a'.repeat(72))).toBe(false);
    expect(isPasswordTooLong('a'.repeat(73))).toBe(true);
    expect(isPasswordTooLong('é'.repeat(36))).toBe(false); // 72 byte
    expect(isPasswordTooLong('é'.repeat(37))).toBe(true); // 74 byte
  });
});
