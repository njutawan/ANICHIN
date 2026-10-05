/**
 * Helper kecil untuk membaca kode error Prisma tanpa meng-import runtime
 * `@prisma/client` (yang membawa query engine ke bundle).
 *
 * Dipakai untuk dua kasus yang sebelumnya berakhir sebagai `500`:
 *
 * - **Cursor tidak dikenal** (`cursor: { id }` menunjuk baris yang tidak ada):
 *   Prisma melempar `P2025` ("needed to inline the cursor ... was not found").
 *   Itu kesalahan *request*, bukan kesalahan server → harus `400`.
 * - **Baris sudah terhapus** (dua perangkat menekan Hapus bersamaan):
 *   `delete` melempar `P2025` → harus `404`, bukan `500`.
 *
 * Sengaja tidak memakai `instanceof` supaya tetap bekerja saat `@prisma/client`
 * di-mock di test maupun saat bundler mengganti kelasnya.
 */
export function prismaErrorCode(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/** `P2025` = "record required but not found" (cursor tidak valid / baris hilang). */
export function isRecordNotFound(err: unknown): boolean {
  return prismaErrorCode(err) === 'P2025';
}
