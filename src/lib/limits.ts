/**
 * Batas panjang input pengguna — dipakai bersama server (Zod) dan klien.
 *
 * Dipisah dari `validation.ts` supaya komponen klien bisa memakai angka yang
 * sama tanpa ikut membundel Zod ke browser. `validation.ts` me-re-export nilai
 * ini agar pemanggil lama tidak berubah.
 */
export const COMMENT_MIN_LENGTH = 3;
export const COMMENT_MAX_LENGTH = 300;
export const REVIEW_MIN_LENGTH = 5;
export const REVIEW_MAX_LENGTH = 500;
