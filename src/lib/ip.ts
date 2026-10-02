/**
 * Trusted client-IP resolution.
 *
 * MASALAH YANG DIPERBAIKI:
 * Sebelumnya semua rate limiter / login lockout / audit log memakai
 * `x-forwarded-for` mentah dan mengambil entri PALING KIRI:
 *
 *     const ip = req.headers.get('x-forwarded-for')?.split(',')[0]
 *
 * Entri paling kiri adalah nilai yang DIKIRIM KLIEN, sehingga penyerang cukup
 * mengirim `X-Forwarded-For: <acak>` setiap request untuk:
 *   - melewati rate limit (setiap request dianggap IP berbeda),
 *   - melewati login lockout (brute force tanpa batas),
 *   - meracuni audit log (IP hash palsu).
 *
 * STRATEGI:
 *   1. Pakai header yang ditulis oleh platform/edge dan tidak bisa dipalsukan
 *      dari luar: `x-vercel-forwarded-for`, `cf-connecting-ip`, `true-client-ip`.
 *   2. Fallback ke `x-forwarded-for`, tapi ambil entri dari arah KANAN
 *      sebanyak `TRUSTED_PROXY_HOPS` (default 1). Entri paling kanan adalah
 *      yang ditambahkan proxy tepercaya terdekat (Caddy/ALB/LB).
 *   3. `x-real-ip` sebagai fallback terakhir (Caddy mengisinya sendiri).
 *
 * Env:
 *   TRUSTED_PROXY_HOPS — jumlah proxy tepercaya di depan app (default 1).
 *                        Vercel/Netlify/Cloudflare = 1, CDN + LB = 2.
 */

const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^[0-9a-f:]+$/i;

type HeaderSource = Headers | Record<string, unknown> | undefined | null;

/** Baca header dari `Headers` maupun object biasa (NextAuth memakai keduanya). */
function readHeader(headers: HeaderSource, name: string): string | null {
  if (!headers) return null;
  const maybeHeaders = headers as Headers;
  if (typeof maybeHeaders.get === 'function') {
    return maybeHeaders.get(name);
  }
  const record = headers as Record<string, unknown>;
  const value = record[name] ?? record[name.toLowerCase()] ?? record[name.toUpperCase()];
  return typeof value === 'string' ? value : null;
}

/** Normalisasi + validasi format alamat IP. Mengembalikan null bila tidak valid. */
export function sanitizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let ip = raw.trim();
  if (!ip) return null;

  // "[2001:db8::1]:443" → "2001:db8::1"
  if (ip.startsWith('[')) {
    const end = ip.indexOf(']');
    if (end > 0) ip = ip.slice(1, end);
  } else if (ip.includes(':') && ip.includes('.') && /:\d+$/.test(ip)) {
    // "203.0.113.7:5312" → "203.0.113.7" (IPv4 + port)
    ip = ip.replace(/:\d+$/, '');
  }

  if (ip.length === 0 || ip.length > 45) return null;
  if (!IPV4_RE.test(ip) && !IPV6_RE.test(ip)) return null;

  return ip.toLowerCase();
}

function trustedProxyHops(): number {
  const parsed = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? '1', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 10);
}

/**
 * Resolve client IP dari header request.
 * Selalu mengembalikan string — `'unknown'` bila tidak ada header yang valid
 * (jangan pernah mengembalikan string kosong: itu membuat semua request tanpa
 * header berbagi satu bucket rate limit / satu hash audit).
 */
export function getClientIpFromHeaders(headers: HeaderSource): string {
  // 1. Header edge yang tidak bisa dipalsukan klien.
  for (const headerName of ['x-vercel-forwarded-for', 'cf-connecting-ip', 'true-client-ip']) {
    const value = readHeader(headers, headerName);
    if (value) {
      const ip = sanitizeIp(value.split(',')[0]);
      if (ip) return ip;
    }
  }

  // 2. X-Forwarded-For — ambil dari kanan sebanyak jumlah proxy tepercaya.
  const xff = readHeader(headers, 'x-forwarded-for');
  if (xff) {
    const parts = xff
      .split(',')
      .map((part) => sanitizeIp(part))
      .filter((ip): ip is string => ip !== null);
    if (parts.length > 0) {
      const index = Math.max(0, parts.length - trustedProxyHops());
      return parts[index] ?? parts[parts.length - 1];
    }
  }

  // 3. Fallback: x-real-ip (di-set oleh Caddy/Nginx dari koneksi TCP).
  const realIp = sanitizeIp(readHeader(headers, 'x-real-ip'));
  if (realIp) return realIp;

  return 'unknown';
}

/** Ambil client IP dari NextRequest / NextAuth request. */
export function getClientIp(req: { headers?: HeaderSource } | undefined | null): string {
  return getClientIpFromHeaders(req?.headers);
}
