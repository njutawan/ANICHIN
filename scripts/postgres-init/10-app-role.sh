#!/bin/sh
# ============================================================================
# AniChin — buat role aplikasi DB dengan hak minimum (F-16 di docs/SECURITY-AUDIT.md)
#
# Temuan: service `web` (aplikasi Next.js) terhubung ke PostgreSQL memakai role
# PEMILIK database (POSTGRES_USER). Bug/RCE di aplikasi karena itu bisa
# `DROP TABLE`, `ALTER TABLE`, `TRUNCATE`, atau menulis ke tabel apa pun — satu
# kredensial yang bocor langsung berarti kehilangan seluruh data.
#
# Skrip ini memisahkan peran:
#   - role APLIKASI (`POSTGRES_APP_USER`, default <owner>_app) yang hanya boleh
#     CONNECT + SELECT/INSERT/UPDATE/DELETE pada tabel (DML), dipakai `web`;
#   - role MIGRASI/owner (POSTGRES_USER) yang tetap punya DDL, dipakai hanya
#     oleh service `migrate` (prisma migrate deploy) dan `backup-cron` (pg_dump)
#     dengan kredensial BERBEDA.
#
# Role aplikasi tidak pernah diberi CREATE/ALTER/DROP/TRUNCATE, bukan pemilik
# objek, dan tidak boleh SUPERUSER/CREATEDB/CREATEROLE.
#
# Idempoten: aman dijalankan berkali-kali (password role aplikasi di-reset ke
# nilai POSTGRES_APP_PASSWORD dan privilege di-apply ulang).
#
# Dipakai dua cara:
#   1. OTOMATIS oleh entrypoint image postgres di container `db` saat data dir
#      masih kosong — compose me-mount ./scripts/postgres-init ke
#      /docker-entrypoint-initdb.d.
#   2. Untuk database yang SUDAH ADA (skrip initdb tidak jalan lagi):
#        docker compose -f docker-compose.prod.yml exec -T db \
#          sh /docker-entrypoint-initdb.d/10-app-role.sh
#      scripts/compose-deploy.sh melakukan ini otomatis sebelum `up`.
#
# Catatan implementasi: password TIDAK pernah masuk argv maupun dirangkai ke
# dalam string SQL. `\getenv` membaca env container, lalu `format(%I, %L)` +
# `\gexec` melakukan quoting identifier/literal di sisi server — jadi password
# yang berisi kutip/backslash tetap aman.
# ============================================================================
set -eu

# Default nama role aplikasi; bisa ditimpa lewat POSTGRES_APP_USER.
: "${POSTGRES_APP_USER:=${POSTGRES_USER:-postgres}_app}"
export POSTGRES_APP_USER

if [ -z "${POSTGRES_APP_PASSWORD:-}" ]; then
  # Bukan kegagalan fatal di sini: pada `docker run` manual env ini memang bisa
  # kosong. Compose sendiri menolak start tanpa POSTGRES_APP_PASSWORD
  # (${POSTGRES_APP_PASSWORD:?...}), jadi jalur deploy tetap gagal keras.
  echo "10-app-role: POSTGRES_APP_PASSWORD kosong — role aplikasi tidak dibuat." >&2
  echo "10-app-role: isi dengan 'openssl rand -hex 32' supaya service web tidak memakai role pemilik DB." >&2
  exit 0
fi

# psql memakai env PGUSER/PGDATABASE: arahkan ke role owner database ini.
export PGUSER="${POSTGRES_USER:-postgres}"
export PGDATABASE="${POSTGRES_DB:-postgres}"

echo "10-app-role: menyiapkan role '${POSTGRES_APP_USER}' (hak DML saja) di database '${PGDATABASE}'…"

psql -v ON_ERROR_STOP=1 --no-psqlrc <<'SQL'
\getenv app_user POSTGRES_APP_USER
\getenv app_password POSTGRES_APP_PASSWORD
\getenv app_db POSTGRES_DB
\getenv owner_role POSTGRES_USER

-- 1. Buat role aplikasi tanpa hak istimewa apa pun.
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L', :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')
\gexec

-- Sudah ada? Pastikan atributnya tetap benar dan passwordnya sinkron dengan env.
SELECT format('ALTER ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L', :'app_user', :'app_password')
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')
\gexec

-- 2. Hak dasar: hanya boleh connect dan memakai schema public sebagai pengguna.
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'app_db', :'app_user')
\gexec

SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'app_user')
\gexec

-- Tanpa CREATE di schema: aplikasi tidak bisa membuat tabel/skema sendiri.
-- (Di PostgreSQL 16 PUBLIC sudah tidak punya CREATE di schema public, tetapi
-- database lama bisa saja masih memberikannya ke PUBLIC.)
SELECT format('REVOKE CREATE ON SCHEMA public FROM %I', :'app_user')
\gexec

-- 3. DML pada tabel & sequence yang sudah ada sekarang.
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', :'app_user')
\gexec

SELECT format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', :'app_user')
\gexec

-- 4. Privilege default: tabel/sequence yang dibuat migrasi BERIKUTNYA (oleh role
--    owner) otomatis memberi DML ke role aplikasi. Tanpa langkah ini, migrasi
--    baru menghasilkan tabel yang tidak bisa dibaca aplikasi.
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', :'owner_role', :'app_user')
\gexec

SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', :'owner_role', :'app_user')
\gexec

-- 5. Ringkasan hasil (verifikasi manual di log deploy).
SELECT rolname AS role_aplikasi, rolcanlogin AS bisa_login, rolsuper AS superuser,
       rolcreatedb AS bisa_buat_db, rolcreaterole AS bisa_buat_role
FROM pg_roles WHERE rolname = :'app_user';

SELECT count(*) AS jumlah_tabel_dengan_dml FROM information_schema.role_table_grants
WHERE grantee = :'app_user' AND privilege_type = 'SELECT';
SQL

echo "10-app-role: selesai — role '${POSTGRES_APP_USER}' siap dipakai service web."
