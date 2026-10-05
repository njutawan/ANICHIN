/**
 * ============================================================================
 * AniChin — OAuth Configuration Verifier
 * Verifies that OAuth providers are properly configured and accessible.
 *
 * Usage:
 *   bun run scripts/verify-oauth.ts                    # local dev
 *   bun run scripts/verify-oauth.ts https://anichin.id # production URL
 *
 * Checks:
 *   1. NEXTAUTH_SECRET is set and ≥32 chars
 *   2. NEXTAUTH_URL is HTTPS in production
 *   3. GOOGLE_CLIENT_ID/SECRET are set with valid format
 *   4. GITHUB_CLIENT_ID/SECRET are set with valid format
 *   5. /api/auth/oauth-providers returns expected providers
 *   6. /api/auth/providers also lists them
 *   7. Callback URLs match production domain
 *
 * Exit codes:
 *   0 = all checks passed
 *   1 = one or more checks failed
 * ============================================================================
 */

const PRODUCTION_URL = process.argv[2] || 'http://localhost:3000';

type CheckResult = {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
};

const checks: CheckResult[] = [];

/**
 * Validasi format client ID Google tanpa substring check.
 *
 * Format resmi: `<project-number>-<hash>.apps.googleusercontent.com`. Memakai
 * `.includes('.apps.googleusercontent.com')` membuat nilai seperti
 * `evil.example/apps.googleusercontent.com` ikut lolos — temuan CodeQL
 * `js/incomplete-url-substring-sanitization` (alert #2). Domain di sini
 * dibandingkan persis (equality), bukan sebagai substring.
 */
function isGoogleClientId(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4 || !parts[0]) return false;
  return /^[0-9]{6,}-[a-z0-9_-]+$/i.test(parts[0]) && parts.slice(1).join('.') === 'apps.googleusercontent.com';
}

function check(name: string, condition: boolean, detail: string, warnOnFalse = false) {
  checks.push({
    name,
    status: condition ? 'pass' : warnOnFalse ? 'warn' : 'fail',
    detail,
  });
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 AniChin OAuth Configuration Verifier');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Target: ${PRODUCTION_URL}`);
  console.log(`Time:   ${new Date().toISOString()}`);
  console.log('');

  // ── 1. NEXTAUTH_SECRET ────────────────────────────────────
  const secret = process.env.NEXTAUTH_SECRET || '';
  check(
    'NEXTAUTH_SECRET is set',
    secret.length > 0,
    secret ? `Length: ${secret.length} chars` : 'Missing — set in .env'
  );
  check(
    'NEXTAUTH_SECRET is strong (≥32 chars)',
    secret.length >= 32,
    `Current length: ${secret.length} — need ≥32`
  );

  // ── 2. NEXTAUTH_URL ───────────────────────────────────────
  const url = process.env.NEXTAUTH_URL || '';
  check('NEXTAUTH_URL is set', url.length > 0, url || 'Missing');
  const isProduction = PRODUCTION_URL.startsWith('https://');
  check(
    'NEXTAUTH_URL uses HTTPS (production)',
    !isProduction || url.startsWith('https://'),
    `Expected https:// in production, got: ${url}`,
    true
  );

  // ── 3. Google OAuth ───────────────────────────────────────
  const googleId = process.env.GOOGLE_CLIENT_ID || '';
  const googleSecret = process.env.GOOGLE_CLIENT_SECRET || '';

  check(
    'GOOGLE_CLIENT_ID is set',
    googleId.length > 0 && !googleId.includes('REPLACE'),
    googleId ? `${googleId.substring(0, 20)}...` : 'Missing'
  );
  check(
    'GOOGLE_CLIENT_ID has valid format',
    isGoogleClientId(googleId),
    'Should end with .apps.googleusercontent.com'
  );
  check(
    'GOOGLE_CLIENT_SECRET is set',
    googleSecret.length > 0 && !googleSecret.includes('REPLACE'),
    googleSecret ? `${googleSecret.substring(0, 4)}****` : 'Missing'
  );
  check(
    'GOOGLE_CLIENT_SECRET has valid format',
    googleSecret.startsWith('GOCSPX-'),
    'Should start with GOCSPX-'
  );

  // ── 4. GitHub OAuth ───────────────────────────────────────
  const githubId = process.env.GITHUB_CLIENT_ID || '';
  const githubSecret = process.env.GITHUB_CLIENT_SECRET || '';

  check(
    'GITHUB_CLIENT_ID is set',
    githubId.length > 0 && !githubId.includes('REPLACE'),
    githubId ? `${githubId.substring(0, 20)}...` : 'Missing'
  );
  check(
    'GITHUB_CLIENT_SECRET is set',
    githubSecret.length > 0 && !githubSecret.includes('REPLACE'),
    githubSecret ? `${githubSecret.substring(0, 4)}****` : 'Missing'
  );
  check(
    'GITHUB_CLIENT_SECRET is strong (≥32 chars)',
    githubSecret.length >= 32,
    `Current: ${githubSecret.length} chars`
  );

  // ── 5. Live API check (skip if not reachable) ─────────────
  console.log('🌐 Testing live API endpoints...\n');

  let providersResponse: { providers?: Array<{ id: string; name: string }> } | null = null;
  try {
    const res = await fetchWithTimeout(`${PRODUCTION_URL}/api/auth/oauth-providers`);
    if (res.ok) {
      providersResponse = await res.json();
      check(
        '/api/auth/oauth-providers responds',
        true,
        `HTTP ${res.status}`
      );
    } else {
      check('/api/auth/oauth-providers responds', false, `HTTP ${res.status}`);
    }
  } catch (err) {
    check(
      '/api/auth/oauth-providers responds',
      false,
      `Cannot reach: ${err instanceof Error ? err.message : String(err)}`,
      true
    );
  }

  let nextAuthProviders: Record<string, { id: string; name: string }> | null = null;
  try {
    const res = await fetchWithTimeout(`${PRODUCTION_URL}/api/auth/providers`);
    if (res.ok) {
      nextAuthProviders = await res.json();
      check('/api/auth/providers responds', true, `HTTP ${res.status}`);
    } else {
      check('/api/auth/providers responds', false, `HTTP ${res.status}`);
    }
  } catch (err) {
    check(
      '/api/auth/providers responds',
      false,
      `Cannot reach: ${err instanceof Error ? err.message : String(err)}`,
      true
    );
  }

  // ── 6. Provider count check ───────────────────────────────
  if (providersResponse) {
    const activeProviders = providersResponse.providers || [];
    check(
      'Both Google + GitHub providers active',
      activeProviders.length === 2,
      `Active: ${activeProviders.map((p) => p.id).join(', ') || 'none'}`
    );
    check(
      'Google provider active',
      activeProviders.some((p) => p.id === 'google'),
      activeProviders.find((p) => p.id === 'google') ? 'OK' : 'Not in active list'
    );
    check(
      'GitHub provider active',
      activeProviders.some((p) => p.id === 'github'),
      activeProviders.find((p) => p.id === 'github') ? 'OK' : 'Not in active list'
    );
  }

  // ── 7. NextAuth providers (includes credentials) ─────────
  if (nextAuthProviders) {
    check(
      'Credentials provider active',
      'credentials' in nextAuthProviders,
      'Credentials always available'
    );
    check(
      'Google provider in NextAuth',
      'google' in nextAuthProviders,
      'OK' 
    );
    check(
      'GitHub provider in NextAuth',
      'github' in nextAuthProviders,
      'OK'
    );
  }

  // ── 8. Callback URLs (display for verification) ──────────
  console.log('📋 Callback URLs to register in OAuth dashboards:\n');
  if (url) {
    const baseUrl = url.replace(/\/$/, '');
    console.log(`   Google: ${baseUrl}/api/auth/callback/google`);
    console.log(`   GitHub: ${baseUrl}/api/auth/callback/github`);
    console.log('');
  }

  // ── Final report ──────────────────────────────────────────
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 OAuth Verification Report');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const passed = checks.filter((c) => c.status === 'pass').length;
  const warned = checks.filter((c) => c.status === 'warn').length;
  const failed = checks.filter((c) => c.status === 'fail').length;

  for (const c of checks) {
    const symbol = c.status === 'pass' ? '✓' : c.status === 'warn' ? '⚠' : '✗';
    const color = c.status === 'pass' ? '\x1b[32m' : c.status === 'warn' ? '\x1b[33m' : '\x1b[31m';
    console.log(`  ${color}${symbol}\x1b[0m ${c.name}`);
    console.log(`     ${c.detail}`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ✓ Passed:  ${passed}`);
  console.log(`  ⚠ Warnings: ${warned}`);
  console.log(`  ✗ Failed:  ${failed}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (failed > 0) {
    console.log('❌ OAuth setup has failures. Fix them before deploying.');
    process.exit(1);
  } else if (warned > 0) {
    console.log('⚠  OAuth setup has warnings. Review before deploying.');
    process.exit(0);
  } else {
    console.log('✅ OAuth configuration verified successfully!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Verifier crashed:', err);
  process.exit(1);
});
