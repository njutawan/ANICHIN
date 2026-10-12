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
POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
TWO_FACTOR_KEY=$(openssl rand -base64 32)

# Edit .env file
nano .env
# Or use sed to replace values:
sed -i "s|NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=$NEXTAUTH_SECRET|" .env
sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" .env
sed -i "s|NEXTAUTH_URL=.*|NEXTAUTH_URL=https://anichin.id|" .env
sed -i "s|# SITE_DOMAIN=.*|SITE_DOMAIN=anichin.id|" .env

# IMPORTANT: Save these secrets somewhere safe!
echo "NEXTAUTH_SECRET=$NEXTAUTH_SECRET"
echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD"

# Verify .env
cat .env | grep -v "^#" | grep -v "^$"

# ─────────────────────────────────────────────────────────────
# STEP 3: Create backup directory
# ─────────────────────────────────────────────────────────────

mkdir -p backups
chmod 755 backups

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

# WAJIB (deploy dibatalkan tanpa ini — lihat langkah "Validate deployment
# configuration" di .github/workflows/deploy.yml)
gh secret set NEXTAUTH_SECRET --body "$NEXTAUTH_SECRET"   # ≥32 karakter
gh secret set NEXTAUTH_URL --body "https://anichin.id"    # wajib https://
gh secret set POSTGRES_PASSWORD --body "$POSTGRES_PASSWORD"

# SSH deploy secrets (dibutuhkan agar benar-benar men-deploy; tanpa
# DEPLOY_HOST job `deploy` di-skip dan hanya image yang di-build)
gh secret set DEPLOY_HOST --body "your-server-ip"
gh secret set DEPLOY_USER --body "deploy"
gh secret set DEPLOY_SSH_KEY --body "$(cat ~/.ssh/deploy_key)"

# OPSIONAL — kalau tidak diisi, kunci itu tidak ditulis ke .env:
gh secret set SITE_DOMAIN --body "anichin.id"           # default: host dari NEXTAUTH_URL
gh secret set NEXT_PUBLIC_SITE_URL --body "https://anichin.id"  # canonical/OG di bundle browser
gh secret set TWO_FACTOR_ENCRYPTION_KEY --body "$(openssl rand -hex 32)"  # 64 hex; tanpa ini 2FA gagal
gh secret set IP_HASH_SALT --body "$(openssl rand -hex 16)"    # salt hash IP di audit log
gh secret set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
gh secret set SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS / SMTP_FROM

# Registry (agar server bisa `docker pull`; kalau kosong server harus punya source)
gh secret set REGISTRY --body "ghcr.io/your-org"
gh secret set REGISTRY_USER --body "your-github-username"
gh secret set REGISTRY_PASS --body "$GITHUB_TOKEN"

# Notifikasi (opsional)
gh secret set SLACK_WEBHOOK --body "https://hooks.slack.com/services/..."

# Yang dilakukan pipeline dengan secret tersebut:
#   • File .env di server DIBUAT dari secret di atas bila belum ada, dan
#     kunci yang sudah ada hanya ditimpa bila secret-nya diisi. Setelan lokal
#     lain (mis. SMTP_* yang diisi manual) tidak pernah dihapus —
#     lihat scripts/deploy-env.sh.
#   • Nilai secret dikirim lewat stdin ssh, tidak pernah masuk argv server
#     maupun log Actions (selain di-mask otomatis oleh GitHub).

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

# Restore from backup (interactive)
docker compose -f docker-compose.prod.yml exec -it backup-cron /usr/local/bin/restore-db.sh auto-20260101-020000

# Download backup to local machine
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
