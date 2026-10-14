#!/bin/sh
# ============================================================================
# AniChin — deploy/rollback produksi di server (dijalankan oleh
# .github/workflows/deploy.yml, tetapi aman dijalankan manual).
#
#   cd /opt/anichin-production
#   ./scripts/compose-deploy.sh
#
# Urutan kerja:
#   1. catat image yang sedang dipakai (untuk rollback)
#   2. `docker compose pull` (dilewati bila SKIP_PULL=1 → compose build lokal)
#   3. `docker compose up -d --remove-orphans`
#   4. tunggu service one-shot `migrate` selesai dengan exit code 0
#   5. tunggu `web` sehat (healthcheck container, fallback HTTP /api/health)
#   6. gagal di langkah 4/5 → kembalikan image lama, up ulang, exit 1
#
# Kenapa skrip terpisah: pipeline lama menyusun seluruh perintah di dalam
# heredoc YAML (sulit diuji, memakai `docker-compose` v1 yang sudah EOL, dan
# rollback-nya hanya `docker tag` tanpa pernah memakai image hasil CI karena
# compose tidak punya nama image). Semua itu sekarang di satu tempat yang bisa
# dijalankan & diuji lokal.
#
# Env (semua opsional, ada default):
#   ENVIRONMENT           hanya untuk label/pesan              (production)
#   COMPOSE_FILE          file compose                        (docker-compose.prod.yml)
#   APP_DIR               direktori kerja                     (.)
#   SKIP_PULL=1           jangan pull; build dari source lokal (0)
#   NO_PULL=1             jangan pull dan jangan build (pakai image lokal apa adanya)
#   HEALTH_RETRIES        jumlah percobaan health check        (18)
#   HEALTH_DELAY          jeda antar percobaan (detik)         (10)
#   MIGRATE_TIMEOUT       batas tunggu migrasi (detik)         (300)
#   ROLLBACK_ON_FAILURE=0 matikan rollback otomatis            (1)
#   ROLLBACK_ONLY=1       jangan deploy: kembalikan tag rollback terbaru lalu up
#   ANICHIN_IMAGE / ANICHIN_MIGRATE_IMAGE  override nama image (dibaca juga dari .env)
#
# F-16: sebelum `up`, role aplikasi DB (DML saja) dipastikan ada — `web` tidak
# lagi memakai role pemilik database (lihat scripts/postgres-init/10-app-role.sh).
# ============================================================================

set -eu

ENVIRONMENT="${ENVIRONMENT:-production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
APP_DIR="${APP_DIR:-.}"
SKIP_PULL="${SKIP_PULL:-0}"
NO_PULL="${NO_PULL:-0}"
HEALTH_RETRIES="${HEALTH_RETRIES:-18}"
HEALTH_DELAY="${HEALTH_DELAY:-10}"
MIGRATE_TIMEOUT="${MIGRATE_TIMEOUT:-300}"
ROLLBACK_ON_FAILURE="${ROLLBACK_ON_FAILURE:-1}"

log() { printf '%s\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

cd "$APP_DIR" || fail "tidak bisa masuk ke $APP_DIR"

# ── Pilih compose v2 (plugin) dengan fallback v1 ───────────────────────────
# `docker-compose` v1 sudah EOL; hampir semua server modern hanya punya
# `docker compose`. Skrip tetap jalan di keduanya.
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
  log "⚠ docker-compose v1 terdeteksi — pertimbangkan upgrade ke plugin v2"
else
  fail "'docker compose' atau 'docker-compose' tidak ditemukan di server"
fi

# shellcheck disable=SC2086
compose() { $DC -f "$COMPOSE_FILE" "$@"; }

[ -f "$COMPOSE_FILE" ] || fail "$COMPOSE_FILE tidak ada di $(pwd)"
[ -f .env ] || fail ".env tidak ada di $(pwd) — jalankan bootstrap .env lebih dulu (scripts/deploy-env.sh)"

# ── Nama image (harus sama dengan compose) ─────────────────────────────────
# Dibaca dari .env dengan sed (TIDAK `source`-ing file itu: .env milik operator
# dan satu baris salah ketik cukup untuk menghentikan deploy).
env_value() {
  [ -f .env ] || return 0
  sed -n "s/^$1=//p" .env | tail -n 1 | sed 's/^"//; s/"$//'
}
WEB_IMAGE="${ANICHIN_IMAGE:-$(env_value ANICHIN_IMAGE)}"
WEB_IMAGE="${WEB_IMAGE:-anichin/anichin:prod-current}"
MIGRATE_IMAGE="${ANICHIN_MIGRATE_IMAGE:-$(env_value ANICHIN_MIGRATE_IMAGE)}"
MIGRATE_IMAGE="${MIGRATE_IMAGE:-anichin/anichin:prod-migrate}"

image_id() { docker image inspect -f '{{.Id}}' "$1" 2>/dev/null || true; }

# `repo:tag` → `repo:tag-rollback-<ts>` (tag rollback yang mudah dibaca manusia).
# Tag asal ikut disertakan supaya image `web` dan `migrate` — yang berada di
# repository yang sama — tidak saling menimpa.
rollback_tag() {
  img="$1"; ts="$2"
  case "$img" in
    */*) last="${img##*/}"; repo="${img%/*}/" ;;
    *)   last="$img";      repo="" ;;
  esac
  case "$last" in
    *:*) printf '%s%s:%s-rollback-%s\n' "$repo" "${last%:*}" "${last##*:}" "$ts" ;;
    *)   printf '%s%s:latest-rollback-%s\n' "$repo" "$last" "$ts" ;;
  esac
}

health_ok() {
  cid="$(compose ps -q web 2>/dev/null || true)"
  if [ -n "$cid" ]; then
    h="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || echo unknown)"
    case "$h" in
      healthy) return 0 ;;
      unhealthy) log "  healthcheck container: unhealthy"; return 1 ;;
      starting|none|unknown) : ;;
    esac
  fi
  # Fallback: poll HTTP langsung (butuh curl/wget di host).
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 5 http://localhost:3000/api/health 2>/dev/null | grep -q '"status":"ok"' && return 0
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- --timeout=5 http://localhost:3000/api/health 2>/dev/null | grep -q '"status":"ok"' && return 0
  fi
  return 1
}

ROLLBACK_ONLY="${ROLLBACK_ONLY:-0}"

# ── Mode rollback manual (workflow_dispatch input `rollback=true`) ─────────
# Mengembalikan tag rollback TERBARU (dibuat setiap deploy sukses) menjadi
# image aktif, lalu menjalankan ulang stack. Hanya kode yang di-rollback;
# skema database tetap (migrasi Prisma maju-saja).
if [ "$ROLLBACK_ONLY" = "1" ]; then
  log "↩ Mode rollback: mencari tag rollback terbaru…"
  web_rb="$(docker images --format '{{.Repository}}:{{.Tag}}' | grep 'prod-current-rollback-' | sort -r | head -n 1 || true)"
  mig_rb="$(docker images --format '{{.Repository}}:{{.Tag}}' | grep 'prod-migrate-rollback-' | sort -r | head -n 1 || true)"

  [ -n "$web_rb" ] || fail "tidak ada image rollback untuk $WEB_IMAGE — belum pernah deploy lewat pipeline?"

  log "  web     : $web_rb → $WEB_IMAGE"
  docker tag "$web_rb" "$WEB_IMAGE"
  if [ -n "$mig_rb" ]; then
    log "  migrate : $mig_rb → $MIGRATE_IMAGE"
    docker tag "$mig_rb" "$MIGRATE_IMAGE"
  fi

  compose up -d --remove-orphans || fail "gagal menjalankan stack setelah rollback"

  i=1
  while [ "$i" -le "$HEALTH_RETRIES" ]; do
    if health_ok; then
      log "✓ Rollback sukses — $web_rb aktif kembali"
      exit 0
    fi
    sleep "$HEALTH_DELAY"
    i=$((i + 1))
  done
  compose ps || true
  compose logs --tail 60 web || true
  fail "rollback dijalankan tetapi web tetap tidak sehat"
fi

TIMESTAMP="$(date +%s)"
OLD_WEB_ID="$(image_id "$WEB_IMAGE")"
OLD_MIGRATE_ID="$(image_id "$MIGRATE_IMAGE")"

log "▶ Deploy AniChin ($ENVIRONMENT) — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
log "  image web     : $WEB_IMAGE"
log "  image migrate : $MIGRATE_IMAGE"

# Simpan juga sebagai tag bernama supaya operator bisa rollback manual:
#   docker tag <repo>:prod-rollback-<ts> <repo>:prod-current
if [ -n "$OLD_WEB_ID" ]; then
  docker tag "$WEB_IMAGE" "$(rollback_tag "$WEB_IMAGE" "$TIMESTAMP")" 2>/dev/null \
    && log "  rollback tag  : $(rollback_tag "$WEB_IMAGE" "$TIMESTAMP")"
fi
if [ -n "$OLD_MIGRATE_ID" ]; then
  docker tag "$MIGRATE_IMAGE" "$(rollback_tag "$MIGRATE_IMAGE" "$TIMESTAMP")" 2>/dev/null || true
fi

# ── 2. Pull (atau build lokal) ─────────────────────────────────────────────
UP_ARGS="--remove-orphans"
if [ "$NO_PULL" = "1" ]; then
  log "▶ Pull + build dilewati (NO_PULL=1) — memakai image yang sudah ada di server"
elif [ "$SKIP_PULL" = "1" ]; then
  log "▶ Pull dilewati (SKIP_PULL=1) — image di-build dari source lokal"
  UP_ARGS="$UP_ARGS --build"
else
  log "▶ Menarik image terbaru…"
  compose pull || fail "gagal menarik image (registry belum dikonfigurasi? set SKIP_PULL=1 bila server punya source repo)"
fi

# ── 2b. Role aplikasi DB (F-16) ────────────────────────────────────────────
# `web` memakai role DML-only (POSTGRES_APP_USER/POSTGRES_APP_PASSWORD), bukan
# role pemilik DB. Pada data dir yang masih kosong, entrypoint postgres di
# container `db` yang membuatnya; pada database yang SUDAH ADA skrip initdb
# tidak jalan lagi, jadi dijalankan di sini (idempoten) supaya upgrade tidak
# pernah menghasilkan web yang tidak bisa konek ke database.
if [ -n "$(env_value POSTGRES_APP_PASSWORD)" ] || [ -n "${POSTGRES_APP_PASSWORD:-}" ]; then
  log "▶ Menyiapkan role aplikasi DB (hak DML saja)…"
  compose up -d db || fail "gagal menyalakan container db"

  i=1
  while [ "$i" -le 30 ]; do
    if compose exec -T db pg_isready -q >/dev/null 2>&1; then break; fi
    [ "$i" = "30" ] && fail "database tidak siap setelah 30 percobaan — cek 'compose logs db'"
    sleep 2
    i=$((i + 1))
  done

  compose exec -T db sh /docker-entrypoint-initdb.d/10-app-role.sh \
    || fail "gagal menyiapkan role aplikasi DB — periksa POSTGRES_APP_PASSWORD di .env dan izin role migrasi"
fi

# ── 3–5. Up, tunggu migrasi, tunggu health ─────────────────────────────────
deploy_failed=0
log "▶ Menjalankan stack…"
# shellcheck disable=SC2086
compose up -d $UP_ARGS || deploy_failed=1

if [ "$deploy_failed" = "0" ]; then
  log "⏳ Menunggu migrasi (maks ${MIGRATE_TIMEOUT}s)…"
  deadline=$(( $(date +%s) + MIGRATE_TIMEOUT ))
  while :; do
    cid="$(compose ps -q migrate 2>/dev/null || true)"
    if [ -n "$cid" ]; then
      status="$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || echo unknown)"
      case "$status" in
        exited)
          code="$(docker inspect -f '{{.State.ExitCode}}' "$cid" 2>/dev/null || echo 1)"
          if [ "$code" = "0" ]; then
            log "✓ Migrasi selesai (exit 0)"
            break
          fi
          log "✗ Migrasi gagal (exit $code)"
          compose logs --tail 40 migrate || true
          deploy_failed=1
          break
          ;;
        running|created|restarting) : ;;
        *) log "⚠ Status container migrate tidak dikenal: $status" ;;
      esac
    fi
    if [ "$(date +%s)" -ge "$deadline" ]; then
      log "✗ Timeout menunggu migrasi"
      compose logs --tail 40 migrate || true
      deploy_failed=1
      break
    fi
    sleep 5
  done
fi


if [ "$deploy_failed" = "0" ]; then
  log "🏥 Health check (maks ${HEALTH_RETRIES}×${HEALTH_DELAY}s)…"
  i=1
  while :; do
    if health_ok; then
      log "✅ Deploy sukses — web sehat"
      break
    fi
    if [ "$i" -ge "$HEALTH_RETRIES" ]; then
      log "✗ Health check gagal setelah $i percobaan"
      compose ps || true
      compose logs --tail 60 web || true
      deploy_failed=1
      break
    fi
    log "  menunggu… ($i/$HEALTH_RETRIES)"
    sleep "$HEALTH_DELAY"
    i=$((i + 1))
  done
fi

# ── 6. Rollback ────────────────────────────────────────────────────────────
if [ "$deploy_failed" = "0" ]; then
  log "✓ Selesai. Image aktif: $(image_id "$WEB_IMAGE" | cut -c1-19)"
  exit 0
fi

if [ "$ROLLBACK_ON_FAILURE" != "1" ]; then
  fail "deploy gagal dan rollback otomatis dimatikan (ROLLBACK_ON_FAILURE=0)"
fi
if [ -z "$OLD_WEB_ID" ]; then
  fail "deploy gagal dan tidak ada image sebelumnya untuk di-rollback — perlu tindakan manual"
fi

log "↩ Rollback ke image sebelumnya…"
docker tag "$OLD_WEB_ID" "$WEB_IMAGE"
[ -n "$OLD_MIGRATE_ID" ] && docker tag "$OLD_MIGRATE_ID" "$MIGRATE_IMAGE"
log "  catatan: migrasi database bersifat maju-saja — rollback hanya mengembalikan kode, bukan skema."
# shellcheck disable=SC2086
compose up -d $UP_ARGS || fail "rollback pun gagal menjalankan stack"

i=1
while [ "$i" -le "$HEALTH_RETRIES" ]; do
  if health_ok; then
    log "✓ Rollback berhasil — versi sebelumnya aktif kembali"
    exit 1
  fi
  sleep "$HEALTH_DELAY"
  i=$((i + 1))
done

fail "rollback dijalankan tetapi web tetap tidak sehat — perlu tindakan manual"
