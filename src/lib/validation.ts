/**
 * Skema validasi Zod untuk endpoint yang menerima input pengguna.
 *
 * Dipakai bersama oleh route handler dan test sehingga batas panjang hanya
 * didefinisikan SEKALI (sebelumnya route memvalidasi `<= 1000` tapi menyimpan
 * `slice(0, 300)` — input yang lolos validasi terpotong diam-diam).
 */
import { z } from 'zod';
import {
  COMMENT_MAX_LENGTH,
  COMMENT_MIN_LENGTH,
  REVIEW_MAX_LENGTH,
  REVIEW_MIN_LENGTH,
} from './limits';

/**
 * Batas panjang yang benar-benar disimpan (dipakai validasi + sanitasi).
 * Nilainya tinggal di `./limits` (tanpa dependensi) supaya komponen klien bisa
 * memakai angka yang sama tanpa ikut membundel Zod ke browser.
 */
export {
  COMMENT_MAX_LENGTH,
  COMMENT_MIN_LENGTH,
  REVIEW_MAX_LENGTH,
  REVIEW_MIN_LENGTH,
} from './limits';

/** Slug anime: huruf kecil, angka, dan tanda hubung. */
export const animeSlugSchema = z
  .string()
  .trim()
  .min(1, 'Slug wajib diisi.')
  .max(200, 'Slug terlalu panjang.')
  .regex(/^[a-z0-9-]+$/, 'Format slug tidak valid.');

/** Nomor episode: integer 1..9999 (menolak NaN/desimal/string). */
export const episodeNumberSchema = z
  .number()
  .int('Nomor episode harus bilangan bulat.')
  .min(1, 'Nomor episode minimal 1.')
  .max(9999, 'Nomor episode di luar rentang.');

export const commentPayloadSchema = z.object({
  animeSlug: animeSlugSchema,
  episodeNumber: episodeNumberSchema,
  comment: z
    .string()
    .trim()
    .min(COMMENT_MIN_LENGTH, 'Komentar terlalu pendek.')
    .max(COMMENT_MAX_LENGTH, `Komentar maksimal ${COMMENT_MAX_LENGTH} karakter.`),
});

export const reviewPayloadSchema = z.object({
  animeSlug: animeSlugSchema,
  rating: z
    .number()
    .int('Rating harus bilangan bulat.')
    .min(1, 'Rating minimal 1.')
    .max(10, 'Rating maksimal 10.'),
  comment: z
    .string()
    .trim()
    .min(REVIEW_MIN_LENGTH, 'Ulasan terlalu pendek.')
    .max(REVIEW_MAX_LENGTH, `Ulasan maksimal ${REVIEW_MAX_LENGTH} karakter.`),
});

/** Batas paginasi untuk endpoint daftar (GET). */
export const LIST_DEFAULT_LIMIT = 20;
export const LIST_MAX_LIMIT = 50;

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(LIST_MAX_LIMIT).default(LIST_DEFAULT_LIMIT),
  cursor: z.string().trim().max(64).optional(),
});

/** Ambil pesan error pertama yang ramah pengguna dari ZodError. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Data tidak valid.';
}
