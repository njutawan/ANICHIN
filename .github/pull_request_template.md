<!--
Ringkas saja. Checklist ini menutup hal-hal yang paling sering bikin CI merah
atau regresi keamanan. Hapus bagian yang tidak relevan.
-->

## Ringkasan

<!-- Apa yang berubah dan kenapa (1-3 kalimat). -->

## Jenis perubahan

- [ ] Perbaikan bug
- [ ] Fitur baru
- [ ] Keamanan / hardening
- [ ] Performa
- [ ] Dokumentasi / tooling
- [ ] Dependensi (biasanya dari Dependabot)

## Checklist

- [ ] `bun run lint` bersih
- [ ] `bunx tsc --noEmit` bersih
- [ ] `bun run test` hijau (tambahkan test untuk perilaku baru)
- [ ] `bun run build` berhasil (atau `DEPLOY_TARGET=standalone bun run build`)
- [ ] Tidak menambah secret/`.env` ke repo
- [ ] Perubahan pada `src/proxy.ts`, `src/lib/auth.ts`, atau `/api/admin/*` sudah ditinjau ulang

## Dampak & cara uji

<!-- Langkah verifikasi manual (kalau ada). Untuk perubahan komentar/ulasan,
     sebutkan pengguna mana yang bisa melihat/menghapus. -->

## Catatan untuk reviewer

<!-- Risiko, migrasi DB, perubahan env baru, atau hal yang sengaja tidak dikerjakan. -->
