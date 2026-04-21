#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/openclaw/erg2}"
ENV_PATH="${ENV_PATH:-/etc/openclaw/bridge.env}"
NGINX_CONFIG_PATH="${NGINX_CONFIG_PATH:-/etc/nginx/sites-available/openclaw-mobile.conf}"
BRIDGE_SERVICE_PATH="${BRIDGE_SERVICE_PATH:-/etc/systemd/system/openclaw-bridge.service}"
UPSTREAM_SERVICE_PATH="${UPSTREAM_SERVICE_PATH:-/etc/systemd/system/openclaw-upstream.service}"
EXPECTED_BRIDGE_DIST="${EXPECTED_BRIDGE_DIST:-${REPO_DIR}/bridge/dist/server.js}"

failures=0
warnings=0

check_file() {
  local path="$1"
  local label="$2"
  if [[ -e "${path}" ]]; then
    echo "[ok] ${label}: ${path}"
  else
    echo "[fail] ${label}: missing ${path}" >&2
    failures=$((failures + 1))
  fi
}

check_command() {
  local command_name="$1"
  if command -v "${command_name}" >/dev/null 2>&1; then
    echo "[ok] command available: ${command_name}"
  else
    echo "[fail] command missing: ${command_name}" >&2
    failures=$((failures + 1))
  fi
}

read_env_value() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "${ENV_PATH}" | tail -n 1 || true)"
  line="${line#${key}=}"
  line="${line%\"}"
  line="${line#\"}"
  printf '%s' "${line}"
}

assert_env_present() {
  local key="$1"
  local value
  value="$(read_env_value "${key}")"
  if [[ -n "${value}" ]]; then
    echo "[ok] ${key} is set"
  else
    echo "[fail] ${key} is empty or missing" >&2
    failures=$((failures + 1))
  fi
}

assert_env_equals() {
  local key="$1"
  local expected="$2"
  local value
  value="$(read_env_value "${key}")"
  if [[ "${value}" == "${expected}" ]]; then
    echo "[ok] ${key}=${expected}"
  else
    echo "[fail] ${key} expected ${expected} but found ${value:-<missing>}" >&2
    failures=$((failures + 1))
  fi
}

assert_env_not_contains() {
  local key="$1"
  local pattern="$2"
  local value
  value="$(read_env_value "${key}")"
  if [[ "${value}" == *"${pattern}"* ]]; then
    echo "[fail] ${key} still contains placeholder text: ${pattern}" >&2
    failures=$((failures + 1))
  else
    echo "[ok] ${key} does not contain placeholder text"
  fi
}

assert_file_not_contains() {
  local path="$1"
  local pattern="$2"
  local label="$3"
  if grep -Fq "${pattern}" "${path}"; then
    echo "[warn] ${label} still contains '${pattern}'" >&2
    warnings=$((warnings + 1))
  else
    echo "[ok] ${label} does not contain '${pattern}'"
  fi
}

check_command nginx
check_command systemctl
check_command node

check_file "${REPO_DIR}" "repo dir"
check_file "${EXPECTED_BRIDGE_DIST}" "bridge dist entrypoint"
check_file "${ENV_PATH}" "bridge env"
check_file "${NGINX_CONFIG_PATH}" "nginx config"
check_file "${BRIDGE_SERVICE_PATH}" "bridge systemd unit"
check_file "${UPSTREAM_SERVICE_PATH}" "upstream systemd unit"

if [[ -f "${ENV_PATH}" ]]; then
  assert_env_present "RELAY_BASE_URL"
  assert_env_present "DATABASE_URL"
  assert_env_present "ADMIN_API_TOKEN"
  assert_env_present "TOKEN_HASH_SECRET"
  assert_env_present "ACCESS_TOKEN_PRIVATE_KEY"
  assert_env_present "ACCESS_TOKEN_PUBLIC_KEY"
  assert_env_present "OPENCLAW_BASE_URL"
  assert_env_present "OPENCLAW_GATEWAY_TOKEN"
  assert_env_present "HARDWARE_BRIDGE_TOKEN"
  assert_env_equals "BRIDGE_STORE_DRIVER" "postgres"
  assert_env_equals "STARTUP_REQUIRE_READY" "true"
  assert_env_not_contains "RELAY_BASE_URL" "api.example.com"
  assert_env_not_contains "DATABASE_URL" "replace-me"
  assert_env_not_contains "ADMIN_API_TOKEN" "replace-with"
  assert_env_not_contains "TOKEN_HASH_SECRET" "replace-with"
  assert_env_not_contains "OPENCLAW_GATEWAY_TOKEN" "replace-with"
  assert_env_not_contains "HARDWARE_BRIDGE_TOKEN" "replace-with"
fi

if [[ -f "${NGINX_CONFIG_PATH}" ]]; then
  assert_file_not_contains "${NGINX_CONFIG_PATH}" "api.example.com" "nginx config"

  ssl_certificate_path="$(awk '/ssl_certificate[[:space:]]+/ {gsub(/;/, "", $2); print $2; exit}' "${NGINX_CONFIG_PATH}")"
  ssl_certificate_key_path="$(awk '/ssl_certificate_key[[:space:]]+/ {gsub(/;/, "", $2); print $2; exit}' "${NGINX_CONFIG_PATH}")"

  if [[ -n "${ssl_certificate_path}" ]]; then
    check_file "${ssl_certificate_path}" "TLS certificate"
  fi

  if [[ -n "${ssl_certificate_key_path}" ]]; then
    check_file "${ssl_certificate_key_path}" "TLS certificate key"
  fi

  if nginx -t >/dev/null 2>&1; then
    echo "[ok] nginx -t"
  else
    echo "[fail] nginx -t reported an error" >&2
    failures=$((failures + 1))
  fi
fi

if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-enabled openclaw-bridge >/dev/null 2>&1; then
    echo "[ok] openclaw-bridge is enabled"
  else
    echo "[warn] openclaw-bridge is not enabled yet" >&2
    warnings=$((warnings + 1))
  fi

  if systemctl is-enabled openclaw-upstream >/dev/null 2>&1; then
    echo "[ok] openclaw-upstream is enabled"
  else
    echo "[warn] openclaw-upstream is not enabled yet" >&2
    warnings=$((warnings + 1))
  fi
fi

echo "Audit complete: ${failures} failure(s), ${warnings} warning(s)."

if [[ "${failures}" -gt 0 ]]; then
  exit 1
fi
