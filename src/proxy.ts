import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * Security Headers Middleware
 * Applies defensive HTTP headers to ALL responses.
 *
 * Security audit (AppSec) — Round 14 + Round 21 (nonce-based CSP):
 * 1. CSP (Content Security Policy) — prevents XSS, data injection
 *    - PRODUCTION: nonce-based (no 'unsafe-inline' / 'unsafe-eval' for scripts)
 *    - DEVELOPMENT: allows 'unsafe-inline' + 'unsafe-eval' (Turbopack HMR needs them)
 * 2. HSTS — forces HTTPS, prevents protocol downgrade
 * 3. X-Content-Type-Options — prevents MIME sniffing
 * 4. X-Frame-Options — prevents clickjacking (legacy + CSP frame-ancestors)
 * 5. Referrer-Policy — controls referrer leakage
 * 6. Permissions-Policy — restricts browser APIs
 * 7. X-DNS-Prefetch-Control — disables DNS prefetch for privacy
 * 8. Cross-Origin policies — isolates resources
 */

// Trusted domains for scripts, styles, images, and connections
const SELF = "'self'";
const TRUSTED_SCRIPT_DOMAINS = ['https://chunk-server.com'];
const TRUSTED_STYLES = [SELF, "'unsafe-inline'"]; // styles still need unsafe-inline (Next.js inline styles)
const TRUSTED_IMAGES = [SELF, 'data:', 'blob:', 'https:'];
// Media sources — blob: is required for HLS.js MediaSource playback, https: for
// direct MP4/native-HLS streams hosted on CDNs (e.g. Mux test streams).
const TRUSTED_MEDIA = [SELF, 'blob:', 'https:'];
const TRUSTED_FONTS = [SELF, 'data:', 'https://fonts.gstatic.com', 'https://fonts.googleapis.com'];
const TRUSTED_CONNECT = [SELF, 'https:'];
const TRUSTED_FRAMES = [SELF, 'https://www.youtube.com', 'https://www.youtube-nocookie.com'];

/**
 * Generate a cryptographic nonce for CSP.
 * Uses Web Crypto API (Edge Runtime compatible).
 *
 * NOTE: Next.js picks up the nonce from the **request** header
 * `content-security-policy` (see `next/dist/server/app-render/app-render.js`
 * → `parseRequestHeaders`). `x-nonce` alone is NOT read by Next — it is only
 * kept for our own server components that want to apply the nonce manually.
 * Nonces also require dynamic rendering: a statically prerendered page is
 * built once (at build time) and can never carry a per-request nonce, so all
 * DB-backed pages opt into `dynamic = 'force-dynamic'` in the root layout.
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  // Convert to base64
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Build CSP header value.
 * In production: uses nonce (removes 'unsafe-inline' + 'unsafe-eval' for scripts).
 * In development: allows 'unsafe-inline' + 'unsafe-eval' (Turbopack HMR requirement).
 */
function buildCSP(nonce: string): string {
  const isProduction = process.env.NODE_ENV === 'production';

  const scriptSrc = isProduction
    ? [SELF, `'nonce-${nonce}'`, ...TRUSTED_SCRIPT_DOMAINS, "'strict-dynamic'"]
    : [SELF, "'unsafe-inline'", "'unsafe-eval'", ...TRUSTED_SCRIPT_DOMAINS];

  return [
    `default-src ${SELF}`,
    `script-src ${scriptSrc.join(' ')}`,
    `style-src ${TRUSTED_STYLES.join(' ')}`,
    `img-src ${TRUSTED_IMAGES.join(' ')}`,
    `media-src ${TRUSTED_MEDIA.join(' ')}`,
    `font-src ${TRUSTED_FONTS.join(' ')}`,
    `connect-src ${TRUSTED_CONNECT.join(' ')}`,
    `frame-src ${TRUSTED_FRAMES.join(' ')}`,
    `object-src 'none'`,
    `base-uri 'none'`,
    `form-action ${SELF}`,
    `frame-ancestors ${SELF}`,
    `upgrade-insecure-requests`,
    `block-all-mixed-content`,
  ].join('; ');
}

/**
 * Locale yang direpresentasikan URL — dipakai root layout untuk `<html lang>`
 * dan provider i18n untuk render pertama. Hanya locale yang punya kamus
 * (src/lib/i18n.ts) yang boleh muncul di sini.
 */
function localeForPath(pathname: string): 'id' | 'en' {
  return pathname === '/en' || pathname.startsWith('/en/') ? 'en' : 'id';
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Admin route protection (auth + role check via JWT) ---
  // Middleware runs on Edge runtime — use getToken (JWT decode, no DB call)
  if (pathname.startsWith('/admin')) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token) {
      // Not authenticated → redirect to login with callback
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      loginUrl.searchParams.set('error', 'AccessDenied');
      const redirect = NextResponse.redirect(loginUrl);

      // Still apply security headers to the redirect response
      applySecurityHeaders(redirect, generateNonce());
      return redirect;
    }

    if (token.role !== 'admin') {
      // Authenticated but not admin → redirect to home with error
      const homeUrl = new URL('/?error=AdminRequired', request.url);
      const redirect = NextResponse.redirect(homeUrl);
      applySecurityHeaders(redirect, generateNonce());
      return redirect;
    }
  }

  // Generate per-request nonce for CSP
  const nonce = generateNonce();
  const csp = buildCSP(nonce);

  // Forward the policy + nonce on the REQUEST headers: this is what makes
  // Next.js add `nonce="…"` to its own inline/bootstrap <script> tags.
  // (Without this, `'strict-dynamic'` in production blocks every script and
  // the page renders but never hydrates.)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  // Dibaca root layout (src/app/layout.tsx) untuk `<html lang="…">`.
  requestHeaders.set('x-locale', localeForPath(pathname));

  // Get the response from the route handler
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Keep the nonce available to our own server components (e.g. JSON-LD blocks)
  response.headers.set('x-nonce', nonce);
  response.headers.set('Content-Language', localeForPath(pathname));

  // Apply security headers
  applySecurityHeaders(response, nonce);

  return response;
}

/**
 * Apply all security headers to a response.
 * Extracted so both normal responses and redirects get the same protection.
 */
function applySecurityHeaders(response: NextResponse, nonce: string) {

  // --- 1. Content Security Policy (CSP) ---
  // Nonce-based in production, permissive in dev (Turbopack HMR)
  response.headers.set('Content-Security-Policy', buildCSP(nonce));

  // --- 2. Strict-Transport-Security (HSTS) ---
  // Forces HTTPS for 1 year, includes subdomains, preload list eligible
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  );

  // --- 3. X-Content-Type-Options ---
  // Prevents MIME-type sniffing (browser guessing content type)
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // --- 4. X-Frame-Options ---
  // Prevents clickjacking — DENY framing by any origin
  // (CSP frame-ancestors is the modern equivalent, but this helps legacy browsers)
  response.headers.set('X-Frame-Options', 'DENY');

  // --- 5. Referrer-Policy ---
  // Only send origin (not full URL) when navigating to other sites
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // --- 6. Permissions-Policy (formerly Feature-Policy) ---
  // Restricts access to browser APIs — only allows what the app needs
  const permissions = [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()',
    'interest-cohort=()', // Disable FLoC
    'sync-xhr=()', // Disable synchronous XHR
    'document-domain=()',
  ].join(', ');
  response.headers.set('Permissions-Policy', permissions);

  // --- 7. X-DNS-Prefetch-Control ---
  // Disable DNS prefetch for privacy (prevents DNS leakage)
  response.headers.set('X-DNS-Prefetch-Control', 'off');

  // --- 8. Cross-Origin Isolation ---
  // Prevents cross-origin resource sharing abuse
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Embedder-Policy', 'unsafe-none');

  // --- 9. Remove server fingerprinting ---
  // Strip X-Powered-By header (Next.js adds this by default)
  response.headers.delete('X-Powered-By');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');

  return response;
}

export const config = {
  // Apply to all routes except static assets (which are handled by Next.js CDN)
  matcher: [
    /*
     * Match semua path KECUALI:
     * - _next/static, _next/image (aset build)
     * - favicon.ico, logo.svg, robots.txt, sitemap.xml
     * - berkas gambar di public/anime/*.svg|png|… (poster & banner)
     *
     * CATATAN PENTING: sebelumnya pola ini mengecualikan SELURUH prefix
     * `anime/`, sehingga halaman kanonik `/anime/<slug>` tidak pernah melewati
     * proxy → tidak dapat security header, dan tidak dapat nonce CSP (script
     * JSON-LD kehilangan nonce-nya). Sekarang hanya berkas berekstensi gambar
     * yang dikecualikan, bukan route halamannya.
     */
    '/((?!_next/static|_next/image|favicon.ico|logo.svg|robots.txt|sitemap.xml|anime/[^/]+\\.(?:svg|png|jpe?g|webp|avif|gif|ico)$).*)',
  ],
};
