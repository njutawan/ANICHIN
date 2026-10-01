# Migrasi Database (Prisma Migrate)

AniChin memakai **Prisma Migrate** dengan PostgreSQL. Semua perubahan skema
`prisma/schema.prisma` harus punya berkas migrasi di `prisma/migrations/`.

---

## Struktur folder

```
prisma/migrations/
├── migration_lock.toml              # provider = "postgresql"
└── 20261001000000_init/
    └── migration.sql                # 15 tabel + 53 index + 14 foreign key
```

> **Penting soal penamaan.** Prisma hanya membaca berkas yang namanya **tepat**
> `migration.sql` di dalam folder bernama `<14 digit timestamp>_<nama>`
> (contoh resmi dari Prisma: `20201207184859_initial_migration`). Folder/berkas
> dengan nama lain (mis. `pg_init/init.sql`) **diabaikan total** oleh
> `prisma migrate deploy` — itu sebabnya struktur di atas dirapikan.

---

## Alur sehari-hari

### 1. Development (buat migrasi baru)

```bash
# setelah mengubah prisma/schema.prisma:
npx prisma migrate dev --name tambah_tabel_x
```

Perintah ini: membuat folder migrasi baru → menjalankannya ke DB lokal →
regenerasi Prisma Client.

### 2. Produksi (jalankan migrasi yang sudah ada)

```bash
npx prisma migrate deploy          # atau: bun run db:migrate:prod
```

`migrate deploy` **tidak** membuat migrasi baru dan tidak pernah menghapus data —
aman dijalankan otomatis. Sudah otomatis dipanggil di:

- `docker-compose.prod.yml` / `docker-compose.staging.yml` → service `migrate`
  (container `web` menunggu sampai service ini selesai).
- `.github/workflows/deploy.yml` → langkah deploy SSH.
- `scripts/start-postgres.ts` (dev, embedded PostgreSQL).

### 3. Cek status

```bash
npx prisma migrate status
```

---

## ⚠️ Database yang sudah terisi (wajib dibaca sekali)

Database yang tabelnya dibuat lewat `prisma db push`, `psql -f init.sql`, atau
cara manual lain **belum tercatat** di tabel `_prisma_migrations`. Kalau
`migrate deploy` dijalankan langsung, Prisma berhenti dengan error:

```
P3005: The database schema is not empty. Read more about how to baseline an
existing database: https://pris.ly/d/baselining
```

**Solusinya: baseline** — tandai migrasi pertama sebagai "sudah diterapkan"
tanpa menjalankan SQL-nya (karena tabelnya sudah ada):

```bash
# 1. Pastikan DATABASE_URL menunjuk ke database yang sudah terisi
export DATABASE_URL="postgresql://user:pass@host:5432/anichin?schema=public"

# 2. Tandai migrasi init sebagai sudah diterapkan (TIDAK menjalankan SQL-nya)
npx prisma migrate resolve --applied 20261001000000_init

# 3. Verifikasi — semua migrasi harus berstatus "applied"
npx prisma migrate status
```

Untuk **database baru/kosong**, jangan pakai `resolve` — cukup `migrate deploy`
dan biarkan SQL-nya dijalankan dari nol.

---

## Troubleshooting

| Gejala | Arti | Tindakan |
| --- | --- | --- |
| `P3005` database schema is not empty | DB sudah ada isinya tapi belum pernah dimigrasikan | Baseline: `prisma migrate resolve --applied 20261001000000_init` |
| `P3009` migrate found failed migrations | Ada migrasi yang gagal di tengah jalan | Perbaiki penyebabnya, lalu `prisma migrate resolve --applied <nama>` atau `--rolled-back <nama>` |
| `P1001` can't reach database server | `DATABASE_URL` salah / DB belum jalan | Cek `DATABASE_URL` dan status container `db` |
| `Environment variable not found: DATABASE_URL` | Prisma CLI tidak menemukan env var | Export dulu: `set -a && . ./.env && set +a` (lihat catatan di `prisma.config.ts`) |
| Tabel sudah ada tapi `migrate deploy` gagal | DB dibuat manual, bukan lewat migrate | Baseline (lihat di atas) |

---

## Referensi

- [Prisma Migrate — docs](https://www.prisma.io/docs/orm/prisma-migrate)
- [Baselining an existing database](https://www.prisma.io/docs/orm/prisma-migrate/workflows/baselining)
