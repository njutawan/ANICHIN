# ============================================================================
# AniChin — Production Deployment Guide
# Step-by-step from zero to live production
# ============================================================================

# 📋 Prerequisites
# ─────────────────────────────────────────────────────────────
# - Linux server (Ubuntu 22.04+ recommended) with:
#   - 2+ vCPU, 4GB+ RAM, 20GB+ SSD
#   - Docker 24+ and Docker Compose v2+
#   - Domain name (e.g., anichin.id) with DNS A record pointing to server
# - GitHub repository with secrets configured

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

mkdir -p backups/wal
chmod 755 backups

# ─────────────────────────────────────────────────────────────
# STEP 4: Initial deploy
# ─────────────────────────────────────────────────────────────

# Build and start all services
docker compose -f docker-compose.prod.yml up -d --build

# Watch migration progress
docker compose -f docker-compose.prod.yml logs -f migrate

# Wait for web to be healthy (may take 1-2 minutes)
docker compose -f docker-compose.prod.yml ps

# Verify health
curl http://localhost:3000/api/health
# Expected: {"status":"ok","checks":{"db":{"status":"ok"},...}}

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

# Set required secrets
gh secret set DATABASE_URL --body "postgresql://anichin:$POSTGRES_PASSWORD@db:5432/anichin?schema=public"
gh secret set NEXTAUTH_SECRET --body "$NEXTAUTH_SECRET"
gh secret set NEXTAUTH_URL --body "https://anichin.id"
gh secret set POSTGRES_PASSWORD --body "$POSTGRES_PASSWORD"
gh secret set SITE_DOMAIN --body "anichin.id"

# SSH deploy secrets
gh secret set DEPLOY_HOST --body "your-server-ip"
gh secret set DEPLOY_USER --body "deploy"
gh secret set DEPLOY_SSH_KEY --body "$(cat ~/.ssh/deploy_key)"

# Optional: registry + Slack
gh secret set REGISTRY --body "ghcr.io/your-org"
gh secret set REGISTRY_USER --body "your-github-username"
gh secret set REGISTRY_PASS --body "$GITHUB_TOKEN"
gh secret set SLACK_WEBHOOK --body "https://hooks.slack.com/services/..."

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

# ─────────────────────────────────────────────────────────────
# Operations: Backup & Restore
# ─────────────────────────────────────────────────────────────

# Manual backup (creates timestamped file)
docker compose -f docker-compose.prod.yml exec backup /usr/local/bin/backup.sh manual-$(date +%Y%m%d)

# List backups
ls -la backups/

# Restore from backup (interactive)
docker compose -f docker-compose.prod.yml exec -it backup /usr/local/bin/restore-db.sh auto-20260101-020000

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

# Check service status
docker compose -f docker-compose.prod.yml ps

# ─────────────────────────────────────────────────────────────
# Operations: Rollback
# ─────────────────────────────────────────────────────────────

# Trigger rollback via GitHub Actions
gh workflow run deploy.yml \
  -f environment=production \
  -f rollback=true

# Manual rollback on server
ssh deploy@server
cd /opt/anichin
docker images --format "{{.Tag}}" anichin/anichin | grep -E "^prod-rollback-"
# Pick a tag, then:
docker tag anichin/anichin:prod-rollback-1234567890 anichin/anichin:prod-current
docker compose -f docker-compose.prod.yml up -d --remove-orphans

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
