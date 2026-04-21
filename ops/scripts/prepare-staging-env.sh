#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/openclaw/erg2}"
TEMPLATE_PATH="${TEMPLATE_PATH:-${REPO_DIR}/ops/env/bridge.production.env.example}"
OUTPUT_PATH="${OUTPUT_PATH:-/etc/openclaw/bridge.env}"
OUTPUT_DIR="$(dirname "${OUTPUT_PATH}")"
FORCE_OVERWRITE="${FORCE_OVERWRITE:-false}"
OUTPUT_OWNER="${OUTPUT_OWNER:-}"
OUTPUT_GROUP="${OUTPUT_GROUP:-}"

RELAY_BASE_URL="${RELAY_BASE_URL:?RELAY_BASE_URL is required}"
DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
OPENCLAW_BASE_URL="${OPENCLAW_BASE_URL:-http://127.0.0.1:18789}"
OPENCLAW_GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:?OPENCLAW_GATEWAY_TOKEN is required}"
OPENCLAW_MODEL="${OPENCLAW_MODEL:-openclaw/default}"
DATABASE_SCHEMA="${DATABASE_SCHEMA:-openclaw_bridge}"
ACCESS_TOKEN_ISSUER="${ACCESS_TOKEN_ISSUER:-openclaw-mobile-companion}"
ACCESS_TOKEN_AUDIENCE="${ACCESS_TOKEN_AUDIENCE:-openclaw-mobile}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

generate_hex() {
  local bytes="$1"
  openssl rand -hex "${bytes}" | tr -d '\n'
}

escape_pem_for_env() {
  awk 'BEGIN { first = 1 } { sub(/\r$/, ""); if (!first) printf "\\n"; printf "%s", $0; first = 0 } END { printf "\n" }' "$1"
}

if [[ ! -f "${TEMPLATE_PATH}" ]]; then
  echo "Template not found: ${TEMPLATE_PATH}" >&2
  exit 1
fi

if [[ -f "${OUTPUT_PATH}" && "${FORCE_OVERWRITE}" != "true" ]]; then
  echo "Refusing to overwrite existing env file: ${OUTPUT_PATH}" >&2
  echo "Set FORCE_OVERWRITE=true if you intend to replace it." >&2
  exit 1
fi

require_command openssl
require_command install
require_command mktemp

ADMIN_API_TOKEN="${ADMIN_API_TOKEN:-$(generate_hex 24)}"
TOKEN_HASH_SECRET="${TOKEN_HASH_SECRET:-$(generate_hex 64)}"
HARDWARE_BRIDGE_TOKEN="${HARDWARE_BRIDGE_TOKEN:-$(generate_hex 24)}"

temp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "${temp_dir}"
}
trap cleanup EXIT

openssl genpkey -algorithm Ed25519 -out "${temp_dir}/access-token-private.pem" >/dev/null 2>&1
openssl pkey -in "${temp_dir}/access-token-private.pem" -pubout -out "${temp_dir}/access-token-public.pem" >/dev/null 2>&1

ACCESS_TOKEN_PRIVATE_KEY_ESCAPED="$(escape_pem_for_env "${temp_dir}/access-token-private.pem")"
ACCESS_TOKEN_PUBLIC_KEY_ESCAPED="$(escape_pem_for_env "${temp_dir}/access-token-public.pem")"

install -d "${OUTPUT_DIR}"

cat >"${OUTPUT_PATH}" <<EOF
NODE_ENV=production
PORT=8787
RELAY_BASE_URL=${RELAY_BASE_URL}
BRIDGE_STORE_DRIVER=postgres
DATABASE_URL=${DATABASE_URL}
DATABASE_SCHEMA=${DATABASE_SCHEMA}
DATABASE_AUTO_MIGRATE=true
STARTUP_REQUIRE_READY=true
ADMIN_API_TOKEN=${ADMIN_API_TOKEN}
TOKEN_HASH_SECRET=${TOKEN_HASH_SECRET}
ACCESS_TOKEN_PRIVATE_KEY="${ACCESS_TOKEN_PRIVATE_KEY_ESCAPED}"
ACCESS_TOKEN_PUBLIC_KEY="${ACCESS_TOKEN_PUBLIC_KEY_ESCAPED}"
ACCESS_TOKEN_ISSUER=${ACCESS_TOKEN_ISSUER}
ACCESS_TOKEN_AUDIENCE=${ACCESS_TOKEN_AUDIENCE}
OPENCLAW_BASE_URL=${OPENCLAW_BASE_URL}
OPENCLAW_GATEWAY_TOKEN=${OPENCLAW_GATEWAY_TOKEN}
HARDWARE_BRIDGE_TOKEN=${HARDWARE_BRIDGE_TOKEN}
OPENCLAW_MODEL=${OPENCLAW_MODEL}
OPENCLAW_REQUEST_TIMEOUT_MS=30000
OPENCLAW_HEALTH_CHECK=true
PAIRING_CODE_TTL_MS=600000
BOOTSTRAP_TOKEN_TTL_MS=60000
PAIRING_CODE_MAX_ATTEMPTS=10
ACCESS_TOKEN_TTL_MS=300000
REFRESH_TOKEN_SLIDING_TTL_MS=2592000000
REFRESH_TOKEN_ABSOLUTE_TTL_MS=7776000000
WS_TICKET_TTL_MS=30000
RELAY_HEARTBEAT_INTERVAL_MS=25000
RELAY_PONG_TIMEOUT_MS=10000
RELAY_STALE_MISS_COUNT=2
CLEANUP_INTERVAL_MS=60000
PROMPT_RESULT_RETENTION_MS=86400000
HARDWARE_BRIDGE_DEDUP_TTL_MS=600000
HARDWARE_BRIDGE_MAX_BATCH_SIZE=100
EOF

chmod 640 "${OUTPUT_PATH}"

if [[ -n "${OUTPUT_OWNER}" || -n "${OUTPUT_GROUP}" ]]; then
  chown "${OUTPUT_OWNER:-$(id -un)}:${OUTPUT_GROUP:-$(id -gn)}" "${OUTPUT_PATH}"
fi

echo "Wrote staging bridge env to ${OUTPUT_PATH}."
echo "Fresh values generated:"
echo "  ADMIN_API_TOKEN=${ADMIN_API_TOKEN}"
echo "  HARDWARE_BRIDGE_TOKEN=${HARDWARE_BRIDGE_TOKEN}"
echo "  ACCESS_TOKEN keypair generated for ${RELAY_BASE_URL}"
echo "Next:"
echo "  1. Review ${OUTPUT_PATH} for staging-specific values."
echo "  2. Keep the emitted tokens in a secure operator secret store."
echo "  3. Run npm run staging:audit after nginx and systemd assets are installed."
