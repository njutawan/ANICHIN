# ============================================================================
# AniChin — Production Deployment Guide
# Step-by-step from zero to live production
# ============================================================================

# 📋 Prerequisites
# ─────────────────────────────────────────────────────────────
# - Linux server (Ubuntu 22.04+ recommended) with:
#   - 2+ vCPU, 4GB+ RAM, 20GB+ SSD
#   - Docker 24+ dan plugin `docker compose` v2 (`docker compose version`).
#     `docker-compose` v1 sudah EOL dan tidak lagi jadi jalur utama — semua
#     skrip di repo ini memakai `docker compose` dengan fallback v1.
#   - Domain name (e.g., anichin.id) with DNS A record pointing to server
# - GitHub repository with secrets configured
#
# Image runtime: Node 24 (Active LTS) di node:24-alpine + `openssl`.
#   • Node 20 sudah End-Of-Life sejak April 2026 → tidak ada patch keamanan,
#     karena itu Dockerfile memakai node:24-alpine.
#   • `openssl` wajib: Prisma memilih query engine berdasarkan libssl yang ada.
#     Alpine tidak menyertakan libssl, dan tanpa itu request pertama ke DB
#     gagal dengan "Prisma Client could not locate the Query Engine".
#   Server TIDAK perlu memasang Node: semuanya berjalan di dalam container.

# ─────────────────────────────────────────────────────────────
# STEP 1: Server setup
# ─────────────────────────────────────────────────────────────

# SSH to your server
ssh root@your-server-ip

# Install Docker (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker compose version

# Create deploy directory
sudo mkdir -p /opt/anichin
sudo chown $USER:$USER /opt/anichin
cd /opt/anichin

# ─────────────────────────────────────────────────────────────
# STEP 2: Clone repo & configure env
# ─────────────────────────────────────────────────────────────

git clone https://github.com/your-org/anichin.git .
cd /opt/anichin

# Create .env from template
cp .env.example .env

# Generate secure secrets
NEXTAUTH_SECRET=$(openssl rand -base64 32)
# POSTGRES_PASSWORD = role migrasi/owner (hak DDL) — dipakai `migrate` + `backup-cron`
POSTGRES_PASSWORD=$(openssl rand -hex 32)
# POSTGRES_APP_PASSWORD = role aplikasi (DML saja) — dipakai `web` (audit F-16).
# WAJIB berbeda dari POSTGRES_PASSWORD.
POSTGRES_APP_PASSWORD=$(openssl rand -hex 32)
TWO_FACTOR_KEY=$(openssl rand -hex 32)   # 64 hex char (bukan base64!)

# Edit .env file
nano .env
# Or use sed to replace values:
sed -i "s|NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=$NEXTAUTH_SECRET|" .env
sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" .env
sed -i "s|POSTGRES_APP_PASSWORD=.*|POSTGRES_APP_PASSWORD=$POSTGRES_APP_PASSWORD|" .env
sed -i "s|TWO_FACTOR_ENCRYPTION_KEY=.*|TWO_FACTOR_ENCRYPTION_KEY=$TWO_FACTOR_KEY|" .env
sed -i "s|NEXTAUTH_URL=.*|NEXTAUTH_URL=https://anichin.id|" .env
sed -i "s|# SITE_DOMAIN=.*|SITE_DOMAIN=anichin.id|" .env

# IMPORTANT: save the generated values in an approved secret manager.
# Do not echo secrets or print the contents of .env into terminal/CI logs.
# Verify permissions and list variable NAMES only (values remain hidden):
chmod 600 .env
stat -c '%a %U:%G %n' .env
sed -nE '/^[A-Z_][A-Z0-9_]*=/s/=.*//p' .env

# ─────────────────────────────────────────────────────────────
# STEP 3: Create backup directory
# ─────────────────────────────────────────────────────────────

mkdir -p backups
chmod 700 backups
# Backup scripts use umask 077 and create dump/SQL/manifest files as mode 600.
# Dumps contain user data and are not application-encrypted: use encrypted host
# storage and encrypt any off-host copy with your organization-approved key.

# Catatan: direktori `backups/wal` tidak dipakai lagi. WAL archiving di
# docker-compose.prod.yml dihapus karena bind mount-nya selalu gagal ditulis
# (container PostgreSQL berjalan sebagai uid 70, sedangkan direktori dibuat
# Docker sebagai root) — dengan archive_mode=on, WAL yang gagal diarsipkan
# menumpuk di pg_wal sampai disk penuh lalu database berhenti menerima
# tulisan. Backup resmi = service `backup-cron` (pg_dump harian, retensi 14
# hari) + `scripts/restore-db.sh`.

# ─────────────────────────────────────────────────────────────
# STEP 4: Initial deploy
# ─────────────────────────────────────────────────────────────
#
# Dua jalur yang sama-sama valid (keduanya memakai tag image yang sama):
#
# A. Server punya source repo → build di server
docker compose -f docker-compose.prod.yml up -d --build
#
# B. Server TIDAK punya source (image dari CI/registry) → pull
#    Nama image diatur ANICHIN_IMAGE / ANICHIN_MIGRATE_IMAGE di .env
#    (default: anichin/anichin:prod-current dan anichin/anichin:prod-migrate).
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
#
# Pipeline GitHub (Deploy Production) memakai jalur B. Server hanya perlu
# docker-compose.prod.yml + Caddyfile + scripts/*.sh (dikirim otomatis oleh
# workflow) dan file .env (dibuat otomatis dari secret bila belum ada).
#
# Untuk registry privat, login sekali di server:
#   docker login ghcr.io -u <user> -p <token>

# Watch migration progress
docker compose -f docker-compose.prod.yml logs -f migrate

# Wait for web to be healthy (may take 1-2 minutes)
docker compose -f docker-compose.prod.yml ps

# Verify health
curl http://localhost:3000/api/health
# Expected: {"status":"ok","checks":{"db":{"status":"ok"},...}}

# Validasi Caddyfile (WAJIB bila mengubahnya): direktif/matcher yang salah
# membuat container `caddy` gagal start → seluruh situs tidak bisa diakses.
docker compose -f docker-compose.prod.yml run --rm --no-deps caddy \
  validate --config /etc/caddy/Caddyfile --adapter caddyfile

# ─────────────────────────────────────────────────────────────
# STEP 5: Migrate data from dev SQLite (optional, one-time)
# ─────────────────────────────────────────────────────────────

# Run migration script inside web container
docker compose -f docker-compose.prod.yml exec web bun run scripts/migrate-to-pg.ts

# Verify anime data is loaded
docker compose -f docker-compose.prod.yml exec db \
  psql -U anichin -d anichin -c "SELECT COUNT(*) FROM \"Anime\";"
# Expected: ~30+ rows

# ─────────────────────────────────────────────────────────────
# STEP 6: Create admin user
# ─────────────────────────────────────────────────────────────

# Use the admin script to create admin user
docker compose -f docker-compose.prod.yml exec web \
  bun run scripts/admin.ts create admin@anichin.id "Admin" "StrongAdminPass123!"

# Promote to admin role (if not already)
docker compose -f docker-compose.prod.yml exec web \
  bun run scripts/admin.ts promote admin@anichin.id

# ─────────────────────────────────────────────────────────────
# STEP 7: Verify DNS & TLS
# ─────────────────────────────────────────────────────────────

# Check DNS resolves to your server
dig +short anichin.id
# Should return your server's IP

# Check HTTPS is working (Caddy auto-provisions Let's Encrypt cert)
curl -I https://anichin.id
# Expected: HTTP/2 200 with Strict-Transport-Security header

# Check cert
echo | openssl s_client -connect anichin.id:443 -servername anichin.id 2>/dev/null | openssl x509 -noout -subject -dates

# ─────────────────────────────────────────────────────────────
# STEP 8: Configure GitHub Secrets (for CI/CD)
# ─────────────────────────────────────────────────────────────

# On your local machine (with gh CLI installed):
gh auth login

# WAJIB (deploy dibatalkan tanpa ini — lihat Validate deployment configuration):
gh secret set NEXTAUTH_SECRET --body "$NEXTAUTH_SECRET"   # ≥32 karakter, bukan placeholder
gh secret set NEXTAUTH_URL --body "https://anichin.id"    # wajib https://
gh secret set POSTGRES_PASSWORD --body "$POSTGRES_PASSWORD"          # role migrasi/owner (DDL)
gh secret set POSTGRES_APP_PASSWORD --body "$POSTGRES_APP_PASSWORD"    # role aplikasi (DML saja; wajib berbeda)
gh secret set TWO_FACTOR_ENCRYPTION_KEY --body "$TWO_FACTOR_KEY"       # tepat 64 hex
# Email verification/reset memerlukan SMTP yang benar-benar berfungsi:
gh secret set SMTP_HOST --body "smtp.sendgrid.net"
gh secret set SMTP_PORT --body "587"
gh secret set SMTP_SECURE --body "false"
gh secret set SMTP_USER --body "apikey"
read -s -p "SMTP password/API key: " SMTP_PASS; echo
gh secret set SMTP_PASS --body "$SMTP_PASS"
gh secret set SMTP_FROM --body "no-reply@anichin.id"

# SSH deploy secrets (dibutuhkan agar benar-benar men-deploy; tanpa
# DEPLOY_HOST job `deploy` di-skip dan hanya image yang di-build)
gh secret set DEPLOY_HOST --body "your-server-ip"
gh secret set DEPLOY_USER --body "deploy"
gh secret set DEPLOY_SSH_KEY --body "$(cat ~/.ssh/deploy_key)"

# F-15 — host key SSH yang DIPIN (wajib bila DEPLOY_HOST diisi; tanpa ini
# workflow berhenti sebelum build dengan error "Host key SSH belum dipin").
# Tujuannya: runner tidak lagi memakai ssh-keyscan + StrictHostKeyChecking=no
# (yang membuat pipeline mempercayai kunci apa pun yang menjawab di DEPLOY_HOST).
# Ambil kunci dari mesin tepercaya, lalu COCOKKAN fingerprint-nya dengan kunci
# server yang sebenarnya (panel hosting / konsol / `ssh-keygen -lf` di server)
# sebelum menyimpannya:
ssh-keyscan -H your-server-ip > deploy_host_key.txt 2>/dev/null
ssh-keygen -lf deploy_host_key.txt        # cocokkan dengan fingerprint server!
gh secret set DEPLOY_HOST_KEY < deploy_host_key.txt
rm -f deploy_host_key.txt

# OPSIONAL:
gh secret set SITE_DOMAIN --body "anichin.id"                 # default: host dari NEXTAUTH_URL
gh secret set NEXT_PUBLIC_SITE_URL --body "https://anichin.id" # canonical/OG di bundle browser
gh secret set IP_HASH_SALT --body "$(openssl rand -hex 16)"    # salt hash IP di audit log
gh secret set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET

# Registry (agar server bisa `docker pull`; kalau kosong server harus punya source)
gh secret set REGISTRY --body "ghcr.io/your-org"
gh secret set REGISTRY_USER --body "your-github-username"
gh secret set REGISTRY_PASS --body "$GITHUB_TOKEN"

# Notifikasi (opsional)
gh secret set SLACK_WEBHOOK --body "https://hooks.slack.com/services/..."

# Staging (.github/workflows/staging.yml) memakai secret dengan awalan
# STAGING_. Pola host key sama: pin kunci server staging, jangan biarkan
# pipeline mempercayai kunci apa pun yang menjawab.
gh secret set STAGING_DEPLOY_HOST_KEY < deploy_host_key_staging.txt
gh secret set STAGING_POSTGRES_APP_PASSWORD --body "$(openssl rand -hex 32)"

# ─────────────────────────────────────────────────────────────
# STEP 8b: Peran database (F-16 — least privilege)
# ─────────────────────────────────────────────────────────────
# Compose menjalankan DUA role dengan kredensial berbeda:
#
#   migrate + backup-cron → role owner (`anichin`)          → POSTGRES_PASSWORD
#                           hak DDL (buat/ubah tabel), pg_dump
#   web (aplikasi)        → role `anichin_app`              → POSTGRES_APP_PASSWORD
#                           HANYA SELECT/INSERT/UPDATE/DELETE — tidak bisa
#                           CREATE/ALTER/DROP/TRUNCATE
#
# Skrip pembuat role: scripts/postgres-init/10-app-role.sh (idempoten, dipasang
# compose sebagai /docker-entrypoint-initdb.d sehingga otomatis jalan saat
# volume database masih kosong).
#
# DATABASE SUDAH ADA (instalasi lama)? Entrypoint initdb tidak jalan lagi pada
# volume yang sudah terisi — tetapi compose sekarang punya service `db-roles`
# yang menjalankan skrip yang sama setiap `up` (idempoten), dan `web` menunggu
# service itu selesai. Jadi `docker compose up -d` sudah cukup. Kalau ingin
# menjalankannya manual (mis. untuk memeriksa outputnya):
#   cd /opt/anichin-production
#   docker compose -f docker-compose.prod.yml up -d db
#   docker compose -f docker-compose.prod.yml exec -T db \
#     sh /docker-entrypoint-initdb.d/10-app-role.sh
#   docker compose -f docker-compose.prod.yml up -d web   # pakai kredensial role aplikasi
#
# Cek hasilnya (sebagai role owner):
#   docker compose -f docker-compose.prod.yml exec -T db \
#     psql -U anichin -d anichin -c "\du anichin_app"
#   → harus terlihat: "Cannot create database/role", bukan superuser.

# OPSIONAL (disarankan, F-15): aktifkan "Required reviewers" pada environment
# `production` di Settings → Environments supaya deploy ke produksi butuh
# persetujuan manual. Verifikasi host key SSH dilakukan oleh pipeline
# (DEPLOY_HOST_KEY), sedangkan reviewer melindungi dari deploy yang tidak
# diinginkan.

# Yang dilakukan pipeline dengan secret tersebut:
#   • File .env di server DIBUAT dari secret di atas bila belum ada, dan
#     kunci yang sudah ada hanya ditimpa bila secret-nya diisi. Setelan lokal
#     lain (mis. SMTP_* yang diisi manual) tidak pernah dihapus —
#     lihat scripts/deploy-env.sh.
#   • Nilai secret dikirim lewat stdin ssh sebagai base64 agar newline/karakter
#     khusus tidak dapat menyisipkan baris .env; server menolak CR/LF/NUL dan
#     mengutip format Compose. Nilai tidak dicetak ke log atau argv.

# ─────────────────────────────────────────────────────────────
# STEP 9: Set up SSH key for auto-deploy
# ─────────────────────────────────────────────────────────────

# On the server, create deploy user
sudo adduser deploy --disabled-password --gecos ""
sudo usermod -aG docker deploy
sudo mkdir -p /home/deploy/.ssh
sudo cp ~/.ssh/authorized_keys /home/deploy/.ssh/
sudo chown -R deploy:deploy /opt/anichin
sudo chown -R deploy:deploy /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh

# On your local machine, generate deploy key
ssh-keygen -t ed25519 -f ~/.ssh/anichin_deploy -C "github-actions-deploy"
cat ~/.ssh/anichin_deploy.pub  # Add to /home/deploy/.ssh/authorized_keys on server

# Test SSH from local
ssh -i ~/.ssh/anichin_deploy deploy@your-server-ip "docker ps"

# ─────────────────────────────────────────────────────────────
# STEP 10: Test CI/CD pipeline
# ─────────────────────────────────────────────────────────────

# Push a small change to test pipeline
git checkout -b test-deploy
echo "# Test deploy $(date)" >> README.md
git commit -am "test: verify CI/CD pipeline"
git push origin test-deploy
gh pr create --title "Test deploy" --body "Testing CI/CD"
# Merge PR → triggers production deploy

# Watch deploy:
gh run watch

# Perilaku workflow "Deploy Production" (.github/workflows/deploy.yml):
#   1. DEPLOY_HOST terisi        → build → push (bila REGISTRY ada) → SSH deploy → smoke test.
#   2. DEPLOY_HOST kosong +
#      variable BUILD_ONLY=true  → build image saja; langkah SSH deploy & smoke test dilewati
#                                  (annotation "Mode build-only" di job 🧭 Preflight).
#   3. DEPLOY_HOST kosong +
#      BUILD_ONLY tidak diset    → job 🚀 Deploy DI-SKIP dan run tetap hijau, tetapi job
#                                  🧭 Preflight menuliskan annotation warning
#                                  "Deploy dilewati — tidak ada target" supaya hijau tidak
#                                  pernah berarti "sudah di-deploy" tanpa bukti.
# `workflow_dispatch` manual (termasuk rollback) pada kondisi 3 tetap GAGAL keras: menjalankan
# workflow dengan tangan adalah niat eksplisit untuk deploy, tidak boleh berakhir no-op.
#
# Yang dilakukan pipeline di server (dir /opt/anichin-<environment>):
#   a. kirim docker-compose.prod.yml + Caddyfile + scripts/*.sh dari commit
#      yang sedang di-deploy (source aplikasi TIDAK dikirim — sudah ada di image);
#   b. tulis/perbarui .env dari secret (scripts/deploy-env.sh) — file yang sudah
#      ada tidak pernah dihapus, kunci yang tidak punya secret dibiarkan apa adanya;
#   c. `caddy validate` atas Caddyfile sebelum menyentuh stack;
#      (satu direktif/matcher salah = container caddy gagal start = situs mati)
#   d. docker compose pull → up -d → tunggu service `migrate` exit 0 →
#      health check container `web`;
#      semua di scripts/compose-deploy.sh (bisa dijalankan manual di server);
#   e. bila (d) gagal: image sebelumnya di-tag ulang sebagai image aktif lalu
#      stack dijalankan lagi (rollback otomatis), step tetap GAGAL supaya terlihat.
#
# Registry privat: server perlu `docker login <registry>` sekali saja, karena
# `docker compose pull` berjalan di server (bukan di runner GitHub).

# ─────────────────────────────────────────────────────────────
# Operations: Backup & Restore
# ─────────────────────────────────────────────────────────────

# Manual backup (creates timestamped file)
docker compose -f docker-compose.prod.yml exec backup-cron /usr/local/bin/backup.sh manual-$(date +%Y%m%d)

# List backups
ls -la backups/

# Restore from backup (destructive; interactive confirmation requires typing the exact target DB name)
# First verify the selected backup on an isolated/disposable PostgreSQL instance.
# Never use the restore test against production or any non-disposable database.
docker compose -f docker-compose.prod.yml exec -it backup-cron /usr/local/bin/restore-db.sh auto-20260101-020000

# Backup integration test (CI runs this against an ephemeral PostgreSQL service).
# For local use, point PGHOST/PGPORT/PGUSER only at a disposable test instance;
# this creates and drops uniquely named temporary databases.
# scripts/test-backup-restore.sh ./scripts/restore-db.sh ./scripts/backup-db.sh

# Download backup to local machine (store it with restrictive permissions).
scp deploy@server:/opt/anichin/backups/auto-*.dump ./local-backup/

# ─────────────────────────────────────────────────────────────
# Operations: Logs & Monitoring
# ─────────────────────────────────────────────────────────────

# Tail web logs
docker compose -f docker-compose.prod.yml logs -f web

# Tail DB logs
docker compose -f docker-compose.prod.yml logs -f db

# Tail Caddy access log
docker compose -f docker-compose.prod.yml exec caddy tail -f /data/access.log

# Audit log aplikasi (JSON Lines) — disimpan di named volume `logs_data`,
# bukan bind mount ./logs, supaya direktori /app/logs tetap milik user non-root
# di image (bind mount mewarisi kepemilikan direktori host dan membuat
# audit-log gagal menulis secara diam-diam).
docker compose -f docker-compose.prod.yml exec web tail -f /app/logs/audit.jsonl
# Ekspor ke host:
docker compose -f docker-compose.prod.yml exec -T web cat /app/logs/audit.jsonl > audit-$(date +%F).jsonl

# Check service status
docker compose -f docker-compose.prod.yml ps

# ─────────────────────────────────────────────────────────────
# Operations: Rollback
# ─────────────────────────────────────────────────────────────

# Trigger rollback via GitHub Actions (memakai tag rollback TERBARU)
gh workflow run deploy.yml \
  -f environment=production \
  -f rollback=true
# Di server ini menjalankan scripts/compose-deploy.sh dengan ROLLBACK_ONLY=1:
# tag rollback terbaru untuk `web` dan `migrate` dikembalikan ke tag aktif,
# lalu stack dijalankan ulang + health check.

# Manual rollback on server
ssh deploy@server
cd /opt/anichin-production
./scripts/compose-deploy.sh            # set ROLLBACK_ONLY=1 untuk pakai tag rollback terbaru:
       ROLLBACK_ONLY=1 ./scripts/compose-deploy.sh

# Tag rollback dibuat otomatis setiap deploy (mudah dibaca manusia):
#   <repo>:prod-current-rollback-<epoch>   ← image web sebelum deploy terakhir
#   <repo>:prod-migrate-rollback-<epoch>   ← image migrate sebelum deploy terakhir
docker images --format "{{.Repository}}:{{.Tag}}" | grep rollback
# Pilih tag, lalu jadikan aktif kembali:
docker tag <repo>:prod-current-rollback-<epoch> <repo>:prod-current
docker compose -f docker-compose.prod.yml up -d --remove-orphans

# Penting: migrasi Prisma bersifat MAJU-SAJA. Rollback mengembalikan kode,
# bukan skema database — pastikan migrasi terakhir kompatibel dengan kode lama,
# atau pulihkan dari backup (lihat bagian Backup & Restore).

# ─────────────────────────────────────────────────────────────
# Operations: Update to new version
# ─────────────────────────────────────────────────────────────

# Pull latest code
cd /opt/anichin
git pull origin main

# Rebuild and restart (zero-downtime via health check)
docker compose -f docker-compose.prod.yml up -d --build

# Or let GitHub Actions handle it automatically on push to main

# ─────────────────────────────────────────────────────────────
# Operations: Scale (multi-instance)
# ─────────────────────────────────────────────────────────────

# Scale web to 3 instances (requires external load balancer)
docker compose -f docker-compose.prod.yml up -d --scale web=3

# Note: Sessions use JWT (stateless), so scaling works out of the box
# Redis handles rate limiting across instances
