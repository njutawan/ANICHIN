const PLACEHOLDER_PREFIX = /^(?:change[-_ ]?me|replace[-_ ]?with|your[-_ ]|example|password|secret(?:123)?)/i;

function isLoopbackOrUnspecifiedHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === '::' || host === '::1') return true;

  // WHATWG URL canonicalizes IPv4-mapped/compatible IPv6 dotted tails to hex,
  // e.g. ::ffff:127.0.0.1 -> ::ffff:7f00:1.
  const embeddedIpv4 = host.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (embeddedIpv4) {
    const firstOctet = Number.parseInt(embeddedIpv4[1], 16) >> 8;
    return firstOctet === 0 || firstOctet === 127;
  }

  const firstIpv4Octet = host.match(/^(\d{1,3})\./);
  return firstIpv4Octet !== null && [0, 127].includes(Number(firstIpv4Octet[1]));
}

export function isWeakSecret(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return true;
  if (PLACEHOLDER_PREFIX.test(normalized) || /change[-_ ]in[-_ ]production/i.test(normalized)) {
    return true;
  }
  if (new Set(normalized).size < 8) return true;
  return false;
}

export function validateAuthSecret(value: string | undefined): void {
  if (!value) {
    throw new Error('NEXTAUTH_SECRET is required in production. Generate a unique secret with `openssl rand -hex 32`.');
  }
  if (value.length < 32) {
    throw new Error('NEXTAUTH_SECRET must be at least 32 characters in production.');
  }
  if (isWeakSecret(value)) {
    throw new Error('NEXTAUTH_SECRET is a known placeholder or weak value; generate a unique secret.');
  }
}

type RuntimeEnv = Record<string, string | undefined>;

function requireSecret(env: RuntimeEnv, name: string, minimumLength = 32): void {
  const value = env[name];
  if (!value) throw new Error(`${name} is required in production.`);
  if (value.length < minimumLength) {
    throw new Error(`${name} must be at least ${minimumLength} characters in production.`);
  }
  if (isWeakSecret(value)) {
    throw new Error(`${name} is a known placeholder or weak value; generate a unique secret.`);
  }
}

/** Fail closed before serving production traffic when security-critical config is missing. */
export function validateProductionEnvironment(env: RuntimeEnv = process.env): void {
  if (env.NODE_ENV !== 'production' || env.NEXT_PHASE === 'phase-production-build') return;

  validateAuthSecret(env.NEXTAUTH_SECRET);

  let baseUrl: URL;
  try {
    if (!env.NEXTAUTH_URL) throw new Error('missing');
    baseUrl = new URL(env.NEXTAUTH_URL);
  } catch {
    throw new Error('NEXTAUTH_URL must be an absolute HTTPS URL in production.');
  }
  const hostname = baseUrl.hostname.toLowerCase().replace(/\.$/, '');
  const reservedExampleHost =
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    isLoopbackOrUnspecifiedHost(hostname) ||
    ['example.com', 'example.net', 'example.org'].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    ) ||
    ['example', 'test', 'invalid'].includes(hostname) ||
    hostname.endsWith('.example') ||
    hostname.endsWith('.test') ||
    hostname.endsWith('.invalid');
  if (
    baseUrl.protocol !== 'https:' ||
    baseUrl.username ||
    baseUrl.password ||
    !hostname ||
    reservedExampleHost ||
    !['', '/'].includes(baseUrl.pathname) ||
    baseUrl.search ||
    baseUrl.hash
  ) {
    throw new Error('NEXTAUTH_URL must be a public HTTPS origin (no credentials, path, query, or placeholder host).');
  }

  requireSecret(env, 'TWO_FACTOR_ENCRYPTION_KEY', 64);
  if (!/^[0-9a-fA-F]{64}$/.test(env.TWO_FACTOR_ENCRYPTION_KEY ?? '')) {
    throw new Error('TWO_FACTOR_ENCRYPTION_KEY must be exactly 64 hexadecimal characters.');
  }

  // Email ownership cannot be enforced if verification mail cannot be sent.
  for (const key of ['SMTP_HOST', 'SMTP_USER']) {
    if (!env[key]?.trim()) throw new Error(`${key} is required in production for email verification.`);
  }
  requireSecret(env, 'SMTP_PASS', 16);

  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required in production.');
  }
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(env.DATABASE_URL);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL in production.');
  }
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL in production.');
  }
  let databasePassword = databaseUrl.password;
  try {
    databasePassword = decodeURIComponent(databasePassword);
  } catch {
    throw new Error('DATABASE_URL contains invalid credential encoding.');
  }
  if (databasePassword.length < 32 || isWeakSecret(databasePassword)) {
    throw new Error('DATABASE_URL must use a unique database password of at least 32 characters.');
  }
}
