#!/bin/bash
# ============================================================================
# AniChin — Pre-deploy Health Check
# Verifies the deployed app is healthy before completing deploy
# Run by CI/CD pipeline after docker-compose up
# Usage:
#   ./scripts/health-check.sh [URL] [max-retries]
#   ./scripts/health-check.sh https://anichin.id 10
# ============================================================================

set -eu

URL="${1:-http://localhost:3000}"
MAX_RETRIES="${2:-10}"
RETRY_DELAY=10

echo "🏥 Health check: ${URL}"
echo "   Max retries: ${MAX_RETRIES}"
echo "   Retry delay: ${RETRY_DELAY}s"

for i in $(seq 1 "$MAX_RETRIES"); do
  echo "─── Attempt ${i}/${MAX_RETRIES} ───"

  # Check /api/health
  HEALTH_RESP=$(curl -sf --max-time 5 "${URL}/api/health" 2>/dev/null || echo "FAILED")

  if [ "$HEALTH_RESP" != "FAILED" ]; then
    STATUS=$(echo "$HEALTH_RESP" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)

    if [ "$STATUS" = "ok" ]; then
      echo "✅ Health endpoint: OK"
      echo "   Response: $HEALTH_RESP"

      # Verify auth endpoints
      PROVIDERS=$(curl -sf --max-time 5 "${URL}/api/auth/providers" 2>/dev/null || echo "")
      if echo "$PROVIDERS" | grep -q '"credentials"'; then
        echo "✅ Auth providers: OK"
      else
        echo "⚠️  Auth providers not responding correctly"
      fi

      # Verify static assets
      if curl -sf --max-time 5 -o /dev/null "${URL}/manifest.webmanifest"; then
        echo "✅ Manifest: OK"
      else
        echo "⚠️  Manifest not accessible"
      fi

      if curl -sf --max-time 5 -o /dev/null "${URL}/"; then
        echo "✅ Home page: OK"
      else
        echo "⚠️  Home page not accessible"
        exit 1
      fi

      echo ""
      echo "🎉 All health checks passed!"
      exit 0
    else
      echo "❌ Health endpoint returned status: ${STATUS}"
    fi
  else
    echo "❌ Health endpoint not responding"
  fi

  if [ "$i" -lt "$MAX_RETRIES" ]; then
    echo "⏳ Waiting ${RETRY_DELAY}s before retry..."
    sleep "$RETRY_DELAY"
  fi
done

echo ""
echo "💥 Health check failed after ${MAX_RETRIES} attempts"
exit 1
