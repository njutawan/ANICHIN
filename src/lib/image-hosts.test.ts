/**
 * Unit test whitelist host gambar (P1-5).
 *
 * Yang dijaga di sini: daftar default hanya berisi CDN yang memang dipakai,
 * env bisa menambah host sendiri (termasuk wildcard & port), dan gambar dari
 * host tak dikenal tetap ditandai `unoptimized` agar tidak berakhir HTTP 400.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_IMAGE_HOSTS,
  hostMatchesPattern,
  isAllowedRemoteImage,
  isRemoteImageSrc,
  needsUnoptimized,
  parseImageHosts,
  resolveImageRemotePatterns,
} from './image-hosts';

describe('DEFAULT_IMAGE_HOSTS', () => {
  it('berisi CDN gambar yang dipakai aplikasi, tanpa wildcard global', () => {
    expect([...DEFAULT_IMAGE_HOSTS]).toEqual([
      's4.anilist.co',
      'cdn.myanimelist.net',
      'image.tmdb.org',
    ]);
    expect(DEFAULT_IMAGE_HOSTS.some((h) => h.includes('*'))).toBe(false);
  });
});

describe('parseImageHosts', () => {
  it('menerima daftar dipisah koma/spasi dan menormalkan huruf besar', () => {
    expect(parseImageHosts('CDN.Example.com, img.lain.id')).toEqual([
      { protocol: 'https', hostname: 'cdn.example.com' },
      { protocol: 'https', hostname: 'img.lain.id' },
    ]);
  });

  it('menerima URL utuh dan membuang skema/path', () => {
    expect(parseImageHosts('https://img.other.id/path/to/x.jpg')).toEqual([
      { protocol: 'https', hostname: 'img.other.id' },
    ]);
  });

  it('mendukung wildcard subdomain dan port eksplisit', () => {
    expect(parseImageHosts('*.bunnycdn.com')).toEqual([
      { protocol: 'https', hostname: '*.bunnycdn.com' },
    ]);
    // Apex + wildcard sering ditulis berdampingan oleh operator.
    expect(parseImageHosts('bunnycdn.com, *.bunnycdn.com')).toEqual([
      { protocol: 'https', hostname: 'bunnycdn.com' },
      { protocol: 'https', hostname: '*.bunnycdn.com' },
    ]);
    expect(parseImageHosts('cdn.local:9000')).toEqual([
      { protocol: 'https', hostname: 'cdn.local', port: '9000' },
    ]);
  });

  it('mengabaikan nilai kosong / tidak valid tanpa melempar', () => {
    expect(parseImageHosts('')).toEqual([]);
    expect(parseImageHosts(null)).toEqual([]);
    expect(parseImageHosts(undefined)).toEqual([]);
    expect(parseImageHosts(' , , ')).toEqual([]);
  });
});

describe('resolveImageRemotePatterns', () => {
  it('memakai default saat env kosong', () => {
    expect(resolveImageRemotePatterns(undefined)).toHaveLength(DEFAULT_IMAGE_HOSTS.length);
  });

  it('menambahkan host dari env tepat setelah default', () => {
    const patterns = resolveImageRemotePatterns('cdn.saya.id');
    expect(patterns.map((p) => p.hostname)).toEqual([...DEFAULT_IMAGE_HOSTS, 'cdn.saya.id']);
    expect(patterns.every((p) => p.protocol === 'https')).toBe(true);
  });

  it('tidak menduplikasi host yang sudah ada di default', () => {
    const patterns = resolveImageRemotePatterns('s4.anilist.co, CDN.saya.id, cdn.saya.id');
    const hostnames = patterns.map((p) => p.hostname);
    expect(hostnames.filter((h) => h === 's4.anilist.co')).toHaveLength(1);
    expect(hostnames.filter((h) => h === 'cdn.saya.id')).toHaveLength(1);
  });
});

describe('hostMatchesPattern', () => {
  it('cocok persis dan case-insensitive', () => {
    expect(hostMatchesPattern('s4.anilist.co', 's4.anilist.co')).toBe(true);
    expect(hostMatchesPattern('S4.AniList.Co', 's4.anilist.co')).toBe(true);
    expect(hostMatchesPattern('evil-s4.anilist.co.attacker.net', 's4.anilist.co')).toBe(false);
  });

  it('wildcard cocok dengan subdomain saja (sama seperti Next)', () => {
    expect(hostMatchesPattern('a.bunnycdn.com', '*.bunnycdn.com')).toBe(true);
    expect(hostMatchesPattern('a.b.c.bunnycdn.com', '*.bunnycdn.com')).toBe(true);
    // Apex BUKAN bagian dari wildcard di Next — harus didaftarkan terpisah.
    expect(hostMatchesPattern('bunnycdn.com', '*.bunnycdn.com')).toBe(false);
    expect(hostMatchesPattern('notbunnycdn.com', '*.bunnycdn.com')).toBe(false);
  });
});

describe('isRemoteImageSrc / isAllowedRemoteImage / needsUnoptimized', () => {
  it('mengenali URL absolut', () => {
    expect(isRemoteImageSrc('https://s4.anilist.co/x.jpg')).toBe(true);
    expect(isRemoteImageSrc('http://localhost:3000/x.png')).toBe(true);
    expect(isRemoteImageSrc('/anime/poster.svg')).toBe(false);
    expect(isRemoteImageSrc('data:image/svg+xml;base64,AAA')).toBe(false);
    expect(isRemoteImageSrc(null)).toBe(false);
  });

  it('mengizinkan host di daftar dan menolak host lain', () => {
    expect(isAllowedRemoteImage('https://s4.anilist.co/file/x.jpg')).toBe(true);
    expect(isAllowedRemoteImage('https://img.attacker.net/track.jpg')).toBe(false);
    // Daftar eksplisit dipakai apa adanya (tanpa default) …
    expect(isAllowedRemoteImage('https://s4.anilist.co/file/x.jpg', parseImageHosts('cdn.saya.id'))).toBe(false);
    // … sedangkan resolver selalu menggabungkannya dengan default.
    expect(
      isAllowedRemoteImage('https://s4.anilist.co/file/x.jpg', resolveImageRemotePatterns('cdn.saya.id'))
    ).toBe(true);
  });

  it('menghormati tambahan host dari daftar yang diberikan', () => {
    const patterns = resolveImageRemotePatterns('cdn.saya.id, *.bunnycdn.com');
    expect(isAllowedRemoteImage('https://cdn.saya.id/a.jpg', patterns)).toBe(true);
    expect(isAllowedRemoteImage('https://vz.bunnycdn.com/a.jpg', patterns)).toBe(true);
    expect(isAllowedRemoteImage('https://lain.id/a.jpg', patterns)).toBe(false);
    // Konsisten dengan Next: apex dari wildcard butuh entri sendiri.
    expect(isAllowedRemoteImage('https://bunnycdn.com/a.jpg', patterns)).toBe(false);
    expect(
      isAllowedRemoteImage('https://bunnycdn.com/a.jpg', resolveImageRemotePatterns('*.bunnycdn.com, bunnycdn.com'))
    ).toBe(true);
  });

  it('URL remote yang tidak valid → tidak dioptimasi (aman)', () => {
    expect(isAllowedRemoteImage('https://')).toBe(false);
    expect(needsUnoptimized('https://')).toBe(true);
  });

  it('hanya gambar remote di luar daftar yang perlu unoptimized', () => {
    expect(needsUnoptimized('/anime/poster.svg')).toBe(false);
    expect(needsUnoptimized('https://s4.anilist.co/file/x.jpg')).toBe(false);
    expect(needsUnoptimized('https://img.attacker.net/x.jpg')).toBe(true);
    expect(needsUnoptimized('')).toBe(false);
    expect(needsUnoptimized(null)).toBe(false);
    expect(needsUnoptimized(undefined)).toBe(false);
  });
});
