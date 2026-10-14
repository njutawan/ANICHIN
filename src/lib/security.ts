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
 * Sanitasi URL media (poster/banner/trailer) dari input admin — audit F-14.
 *
 * Sebelumnya nilai ini hanya `.trim()` + potong 1000 karakter, sehingga bisa
 * tersimpan sebagai `javascript:`, `data:`, atau teks bebas. Nilainya dipakai
 * di `<img src>`/`<video src>`, metadata Next.js, dan JSON-LD — jadi bentuk yang
 * tidak terkontrol ikut menyebar ke halaman publik.
 *
 * Aturan:
 *   - hanya `http://` / `https://` absolut, atau path situs yang diawali `/`
 *     (menolak `//host` protocol-relative dan fragmen `#`),
 *   - maksimum `maxLength` karakter (default 1000) — mencegah metadata raksasa,
 *   - selain itu → `null` (pemanggil memutuskan 400 atau menyimpan null).
 */
export function sanitizeMediaUrl(value: unknown, maxLength = 1000): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw || raw.length > maxLength) return null;

  // Path internal situs (bukan protocol-relative, bukan fragmen).
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  // `//host/path` protocol-relative: bentuk yang menunjuk host luar tanpa
  // skema. sanitizeUrl meloloskannya (dianggap path), jadi ditolak di sini.
  if (raw.startsWith('//')) return null;

  const safe = sanitizeUrl(raw);
  if (!safe) return null;
  // sanitizeUrl juga meloloskan fragmen `#...` — tidak masuk akal untuk media.
  if (safe.startsWith('#')) return null;
  return safe;
}

/**
 * Batas panjang password dalam byte UTF-8 (audit F-17).
 *
 * bcrypt hanya memakai 72 byte pertama dan **mengabaikan sisanya tanpa error**,
 * jadi password 100 karakter sebenarnya sama kuatnya dengan 72 byte pertama.
 * Register menerima 128 karakter dan reset 1024, sehingga pengguna bisa merasa
 * memakai password panjang yang entropinya tidak pernah ikut ter-hash.
 *
 * Batas ini ditegakkan saat password **dibuat/diubah** (register + reset).
 * Login sengaja tidak ikut dibatasi supaya akun lama yang passwordnya
 * terlanjur panjang tetap bisa masuk.
 */
export const PASSWORD_MAX_BYTES = 72;

/**
 * Panjang byte UTF-8 dari sebuah string.
 *
 * Memakai TextEncoder (bukan Buffer) supaya aman dipakai di bundle browser
 * kalau nanti dipakai untuk validasi di klien.
 */
export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Password melebihi batas bcrypt (72 byte)? */
export function isPasswordTooLong(value: string): boolean {
  return utf8ByteLength(value) > PASSWORD_MAX_BYTES;
}

/**
 * Truncate text to prevent DoS via extremely long inputs.
 *
 * Memotong per code point (bukan per code unit) supaya emoji / karakter
 * non-BMP tidak terbelah menjadi surrogate pair yang rusak.
 */
function truncateInput(input: string, maxLength: number = 500): string {
  if (!input) return '';
  if (input.length <= maxLength) return input;
  return Array.from(input).slice(0, maxLength).join('');
}

/**
 * Terapkan `pattern` berulang sampai hasilnya tidak berubah lagi (fixed point).
 *
 * Alasan: satu kali `replace()` dengan pola multi-karakter tidak aman — sisa
 * string bisa membentuk ulang pola yang sedang dibuang. Contoh pada pola
 * `/<[^>]*>/g`: `"<<scr<script>ipt>"` masih menyisakan `<script>` setelah satu
 * pass. Ini temuan CodeQL `js/incomplete-multi-character-sanitization`
 * (alert #1 & #6), yang remediasinya resmi adalah mengulang sampai stabil.
 */
function replaceUntilStable(input: string, pattern: RegExp): string {
  let current = input;
  let previous: string;
  do {
    previous = current;
    current = current.replace(pattern, '');
  } while (current !== previous);
  return current;
}

/**
 * Sanitize free-form user text (komentar, ulasan) untuk disimpan di database.
 *
 * - membuang null byte & karakter kontrol (bisa merusak log/JSON/terminal),
 * - membuang zero-width char (dipakai untuk menyamarkan kata terlarang),
 * - membuang tag HTML (defense in depth; React tetap meng-escape saat render),
 * - truncate per code point dengan batas yang sama seperti yang divalidasi.
 *
 * PENTING: batas `maxLength` harus sama dengan batas validasi route, supaya
 * input yang lolos validasi tidak diam-diam terpotong lagi saat disimpan.
 */
export function sanitizeUserText(input: string, maxLength: number): string {
  if (!input) return '';
  const cleaned = replaceUntilStable(
    input
      .replace(/\u0000/g, '')
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
      .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''),
    /<[^>]*>/g
  );
  return truncateInput(cleaned.trim(), maxLength);
}

/**
 * Strip HTML tags from user input (for reviews, comments).
 * Removes <script>, <iframe>, on* attributes, and all HTML tags.
 */
function stripHtml(input: string): string {
  if (!input) return '';
  // Remove HTML tags — berulang sampai stabil supaya tag tidak bisa
  // "terbentuk kembali" dari sisa string (mis. `<<script>script>`).
  const withoutTags = replaceUntilStable(input, /<[^>]*>/g);
  // Double-encoded tags (mis. `&lt;script&gt;`) — idem, harus stabil.
  return replaceUntilStable(withoutTags, /&lt;[^&]*&gt;/g).trim();
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
