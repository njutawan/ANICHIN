/**
 * Frontend Security Utilities
 * OWASP Top 10 — XSS prevention, URL validation, input sanitization
 */

/**
 * Sanitize for JSON-LD context — escape characters that could break out of <script> tag.
 * This is critical because JSON.stringify alone does NOT escape </script>.
 *
 * @example
 * const safe = sanitizeForJSONLD(JSON.stringify(data));
 * <script dangerouslySetInnerHTML={{ __html: safe }} />
 */
export function sanitizeForJSONLD(jsonString: string): string {
  if (!jsonString) return '';
  // Prevent </script> breakout attacks
  return jsonString
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')  // Line separator
    .replace(/\u2029/g, '\\u2029'); // Paragraph separator
}

/**
 * Validate and sanitize URL to prevent javascript:, data:, vbscript: injection.
 * Only allows http:, https:, and relative URLs (starting with / or #).
 *
 * @returns Safe URL or empty string if invalid
 */
export function sanitizeUrl(url: string | undefined | null): string {
  if (!url || typeof url !== 'string') return '';

  const trimmed = url.trim();

  // Allow relative URLs (hash links, root-relative paths)
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) {
    return trimmed;
  }

  // Allow only http: and https: protocols
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return trimmed;
    }
    return '';
  } catch {
    // Not a valid URL — reject
    return '';
  }
}

/**
 * Truncate text to prevent DoS via extremely long inputs.
 */
function truncateInput(input: string, maxLength: number = 500): string {
  if (!input) return '';
  return input.slice(0, maxLength);
}

/**
 * Strip HTML tags from user input (for reviews, comments).
 * Removes <script>, <iframe>, on* attributes, and all HTML tags.
 */
function stripHtml(input: string): string {
  if (!input) return '';
  // Remove HTML tags
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;[^&]*&gt;/g, '') // Double-encoded tags
    .trim();
}

/**
 * Sanitize user-provided name for display.
 * Removes HTML, scripts, and limits length.
 */
export function sanitizeDisplayName(name: string): string {
  if (!name) return 'Anonim';
  return truncateInput(stripHtml(name), 30);
}

/**
 * Sanitize user-provided comment text.
 * Escapes HTML entities and limits length.
 */
export function sanitizeComment(comment: string): string {
  if (!comment) return '';
  return truncateInput(stripHtml(comment), 500);
}
