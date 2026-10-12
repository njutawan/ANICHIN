#!/bin/sh
# ============================================================================
# AniChin — tulis/perbarui file .env di server dari secret CI
#
# Dipakai .github/workflows/deploy.yml (langkah "Bootstrap .env"), dan bisa
# dijalankan manual:
#
#   printf 'NEXTAUTH_URL=%s\nNEXTAUTH_SECRET=%s\n' "$URL" "$SECRET" \
#     | ./scripts/deploy-env.sh
#
# Kontrak:
#   • Input dari STDIN, satu "KEY=VALUE" per baris. Nilai TIDAK pernah dicetak
#     ke stdout/stderr dan tidak pernah masuk ke argv proses (aman terhadap
#     `ps` di server).
#   • Kunci yang belum ada di .env → ditambahkan. Kunci yang sudah ada →
#     nilainya diganti (baris lain tidak disentuh, jadi setelan lokal seperti
#     SMTP_* atau GOOGLE_CLIENT_* tetap utuh).
#   • Nilai kosong DILEWATI — jangan menghapus setelan server hanya karena
#     secret opsional belum diisi di GitHub.
#   • Nilai mengandung karakter yang bisa merusak parser .env (kutip, backslash,
#     #, spasi di awal/akhir) → GAGAL dengan pesan jelas, bukan menulis .env
#     yang rusak diam-diam.
#
# Env:
#   ENV_FILE (default ./.env)
# ============================================================================

set -eu

ENV_FILE="${ENV_FILE:-./.env}"

umask 077

if [ ! -f "$ENV_FILE" ]; then
  : > "$ENV_FILE"
  printf 'i .env baru dibuat: %s\n' "$ENV_FILE"
fi

added=0
updated=0
skipped=0

# Upsert satu pasangan kunci/nilai tanpa menjalankan isi .env.
upsert() {
  key="$1"
  value="$2"

  tmp="$(mktemp "${TMPDIR:-/tmp}/anichin-env.XXXXXX")"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    # Ganti HANYA baris kunci ini. Nilai dioper lewat -v (bukan disisipkan ke
    # dalam program awk), jadi karakter khusus tidak jadi masalah.
    awk -v k="$key" -v v="$value" '
      index($0, k "=") == 1 { print k "=" v; next }
      { print }
    ' "$ENV_FILE" > "$tmp"
    mv "$tmp" "$ENV_FILE"
    updated=$((updated + 1))
    printf '  ~ %s diperbarui\n' "$key"
  else
    cp "$ENV_FILE" "$tmp"
    printf '%s=%s\n' "$key" "$value" >> "$tmp"
    mv "$tmp" "$ENV_FILE"
    added=$((added + 1))
    printf '  + %s ditambahkan\n' "$key"
  fi
}

while IFS= read -r line || [ -n "$line" ]; do
  # Abaikan baris kosong dan komentar.
  case "$line" in
    ''|\#*) continue ;;
  esac

  key=${line%%=*}
  value=${line#*=}

  # Nama kunci harus aman (KEY yang aneh = tanda input salah, bukan secret).
  case "$key" in
    ''|*[!A-Za-z0-9_]*) printf 'ERROR: nama variabel tidak valid pada input\n' >&2; exit 1 ;;
  esac
  case "$key" in
    [0-9]*) printf 'ERROR: nama variabel tidak boleh diawali angka\n' >&2; exit 1 ;;
  esac

  if [ -z "$value" ]; then
    skipped=$((skipped + 1))
    printf '  … %s dilewati (nilai kosong)\n' "$key"
    continue
  fi

  # Karakter yang bisa merusak .env untuk compose (komentar, kutip, escape,
  # spasi/tab). Base64 dan hex — keluaran `openssl rand` — selalu lolos.
  if printf '%s' "$value" | grep -qE "[[:space:]\"'\\#]"; then
    printf 'ERROR: nilai untuk %s memuat karakter yang tidak didukung (spasi, kutip, backslash, atau #).\n' "$key" >&2
    printf '       Set kunci itu manual di %s di server, lalu jalankan deploy lagi.\n' "$ENV_FILE" >&2
    exit 1
  fi

  upsert "$key" "$value"
done

chmod 600 "$ENV_FILE" 2>/dev/null || true

printf '✓ .env siap (%s ditambahkan, %s diperbarui, %s dilewati)\n' "$added" "$updated" "$skipped"
