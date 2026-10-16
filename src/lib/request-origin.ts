/**
 * Origin/Fetch Metadata guard for browser-initiated state changes.
 *
 * SameSite cookies help, but they are not a complete CSRF defense for every
 * deployment/browser. Browser POST/PATCH/PUT/DELETE requests carry Origin; the
 * check below compares its parsed origin (not a string prefix) to the public
 * application origin. Non-browser requests that omit Origin remain supported.
 */

type RequestLike = {
  method: string;
  url?: string;
  headers: Pick<Headers, 'get'>;
  nextUrl?: { origin?: string };
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function parseOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/** Return true when this mutation is clearly from a different browser origin. */
export function isCrossOriginMutation(request: RequestLike): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return false;

  const fetchSite = request.headers.get('sec-fetch-site')?.toLowerCase();
  if (fetchSite === 'cross-site') return true;

  const originHeader = request.headers.get('origin');
  // `same-site` includes sibling subdomains, which are not same-origin. If a
  // browser omits Origin, reject rather than treating that metadata as proof.
  if (fetchSite === 'same-site' && !originHeader) return true;
  // Origin: null is intentionally rejected; it is common for sandboxed or
  // opaque-origin documents and must not be treated as a trusted same-site.
  if (originHeader === 'null') return true;
  if (!originHeader) return false;

  const requestOrigin = parseOrigin(originHeader);
  if (!requestOrigin) return true;

  const configuredOrigins = [process.env.NEXTAUTH_URL, process.env.NEXT_PUBLIC_SITE_URL]
    .map(parseOrigin)
    .filter((origin): origin is string => origin !== null);

  // In local development/tests there may be no canonical URL configured.
  // NextRequest derives this origin from the URL; production deployments are
  // expected to set NEXTAUTH_URL and startup validation enforces HTTPS.
  const fallbackOrigin = parseOrigin(request.nextUrl?.origin ?? request.url);
  const allowedOrigins = configuredOrigins.length > 0
    ? configuredOrigins
    : fallbackOrigin
      ? [fallbackOrigin]
      : [];

  return !allowedOrigins.includes(requestOrigin);
}
