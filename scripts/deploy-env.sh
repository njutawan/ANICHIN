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
#   • Input STDIN: satu KEY=VALUE per baris untuk penggunaan manual, atau
#     KEY_B64=<base64> per baris untuk transport CI. Nilai tidak dicetak dan
#     tidak masuk ke argv; KEY_B64 menolak CR/LF/NUL sebelum ditulis.
#   • Kunci yang belum ada di .env → ditambahkan. Kunci yang sudah ada →
#     nilainya diganti (baris lain tidak disentuh, jadi setelan lokal seperti
#     SMTP_* atau GOOGLE_CLIENT_* tetap utuh).
#   • Nilai kosong DILEWATI — jangan menghapus setelan server hanya karena
#     secret opsional belum diisi di GitHub.
#   • Nilai ditulis sebagai string double-quoted Compose dengan backslash,
#     kutip, dan $ di-escape; CR/LF ditolak karena format input satu baris.
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

  # Same-directory temporary keeps replacement atomic and mode 600 under umask 077.
  tmp="$(mktemp "${ENV_FILE}.XXXXXX")"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    # Rewrite only the selected key. Avoid awk -v (which would expose values
    # in argv and may interpret backslash escapes); keep secret data in shell
    # memory and write it directly to the protected temporary file.
    while IFS= read -r existing || [ -n "$existing" ]; do
      case "$existing" in
        "$key"=*) printf '%s=%s\n' "$key" "$value" >> "$tmp" ;;
        *) printf '%s\n' "$existing" >> "$tmp" ;;
      esac
    done < "$ENV_FILE"
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

  wire_key=${line%%=*}
  value=${line#*=}
  case "$wire_key" in
    *_B64) key=${wire_key%_B64}; value_is_base64=1 ;;
    *) key=$wire_key; value_is_base64=0 ;;
  esac

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

  if [ "$value_is_base64" -eq 1 ]; then
    decoded_tmp="$(mktemp "${TMPDIR:-/tmp}/anichin-secret.XXXXXX")"
    if ! printf '%s' "$value" | base64 -d > "$decoded_tmp"; then
      rm -f "$decoded_tmp"
      printf 'ERROR: nilai encoded untuk %s bukan base64 valid.\n' "$key" >&2
      exit 1
    fi
    # Newlines would break the .env record format; NUL cannot be held in a
    # shell variable. Reject them before reading the decoded value.
    decoded_bytes=$(wc -c < "$decoded_tmp" | tr -d '[:space:]')
    safe_bytes=$(LC_ALL=C tr -d '\000\012\015' < "$decoded_tmp" | wc -c | tr -d '[:space:]')
    if [ "$decoded_bytes" != "$safe_bytes" ]; then
      rm -f "$decoded_tmp"
      printf 'ERROR: nilai untuk %s memuat CR, LF, atau NUL yang tidak didukung.\n' "$key" >&2
      exit 1
    fi
    value=$(cat "$decoded_tmp")
    rm -f "$decoded_tmp"
  fi

  # A CR cannot be represented safely in this line-oriented stdin protocol.
  cr=$(printf '\r')
  case "$value" in
    *"$cr"*) printf 'ERROR: nilai untuk %s memuat carriage return yang tidak didukung.\n' "$key" >&2; exit 1 ;;
  esac

  # Escape for a Docker Compose .env double-quoted value. This preserves
  # passwords containing spaces, #, quotes, backslashes, or $ without allowing
  # Compose interpolation to alter the secret.
  compose_value=$(printf '%s' "$value" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/\$/\\$/g')
  upsert "$key" "\"$compose_value\""
done

chmod 600 "$ENV_FILE" 2>/dev/null || true

printf '✓ .env siap (%s ditambahkan, %s diperbarui, %s dilewati)\n' "$added" "$updated" "$skipped"
