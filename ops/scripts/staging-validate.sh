#!/usr/bin/env bash
set -euo pipefail

RELAY_BASE_URL="${RELAY_BASE_URL:?RELAY_BASE_URL is required}"
ADMIN_API_TOKEN="${ADMIN_API_TOKEN:?ADMIN_API_TOKEN is required}"
PAIR_CREATE_PLATFORM="${PAIR_CREATE_PLATFORM:-ios}"
PAIR_CREATE_NAME_HINT="${PAIR_CREATE_NAME_HINT:-Smoke Test iPhone}"
RUN_PAIR_CREATE="${RUN_PAIR_CREATE:-true}"

echo "Step 1: GET /v1/health"
HEALTH_RESPONSE="$(curl --fail --silent "${RELAY_BASE_URL}/v1/health")"
echo "${HEALTH_RESPONSE}"

echo "Step 2: GET /v1/ready"
READY_RESPONSE="$(curl --fail --silent "${RELAY_BASE_URL}/v1/ready")"
echo "${READY_RESPONSE}"

echo "Step 3: scripted smoke precheck"
SMOKE_OUTPUT="$(
  RELAY_BASE_URL="${RELAY_BASE_URL}" \
  ADMIN_API_TOKEN="${ADMIN_API_TOKEN}" \
  "$(dirname "$0")/smoke-test.sh"
)"
echo "${SMOKE_OUTPUT}"

if [[ "${RUN_PAIR_CREATE}" == "true" ]]; then
  echo "Step 4: direct pairing session creation"
  PAIRING_RESPONSE="$(
    curl --fail --silent \
      -H "authorization: Bearer ${ADMIN_API_TOKEN}" \
      -H "content-type: application/json" \
      -d "{\"platform\":\"${PAIR_CREATE_PLATFORM}\",\"device_display_name_hint\":\"${PAIR_CREATE_NAME_HINT}\"}" \
      "${RELAY_BASE_URL}/v1/pairing/sessions"
  )"
  echo "${PAIRING_RESPONSE}"
fi

echo "Automated host checks complete."
echo "Continue with manual redeem/register/refresh/ws/prompt/revoke checks from docs/staging-promotion-checklist.md."
