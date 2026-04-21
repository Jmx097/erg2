#!/usr/bin/env bash
set -euo pipefail

RELAY_BASE_URL="${RELAY_BASE_URL:?RELAY_BASE_URL is required}"
DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
OUTPUT_DIR="${OUTPUT_DIR:-/tmp/openclaw-keys}"
BACKUP_FILE="${BACKUP_FILE:-}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/openclaw}"

echo "Restarting bridge"
sudo systemctl restart openclaw-bridge

echo "Stopping OpenClaw upstream"
sudo systemctl stop openclaw-upstream

echo "Readiness while upstream is down"
set +e
DOWN_READY_RESPONSE="$(curl --silent --show-error "${RELAY_BASE_URL}/v1/ready")"
DOWN_READY_EXIT=$?
set -e
echo "${DOWN_READY_RESPONSE}"
echo "curl exit code while upstream is down: ${DOWN_READY_EXIT}"

echo "Starting OpenClaw upstream"
sudo systemctl start openclaw-upstream

echo "Readiness after upstream restore"
UP_READY_RESPONSE="$(curl --fail --silent "${RELAY_BASE_URL}/v1/ready")"
echo "${UP_READY_RESPONSE}"

echo "Running Postgres backup"
BACKUP_OUTPUT="$(DATABASE_URL="${DATABASE_URL}" BACKUP_DIR="${BACKUP_DIR}" "$(dirname "$0")/backup-postgres.sh")"
echo "${BACKUP_OUTPUT}"

if [[ -n "${BACKUP_FILE}" ]]; then
  echo "Restoring Postgres from ${BACKUP_FILE}"
  DATABASE_URL="${DATABASE_URL}" "$(dirname "$0")/restore-postgres.sh" "${BACKUP_FILE}"
else
  echo "Skipping restore because BACKUP_FILE was not provided."
fi

echo "Generating fresh access-token keypair"
OUTPUT_DIR="${OUTPUT_DIR}" "$(dirname "$0")/rotate-access-token-keys.sh"

echo "Recovery rehearsal automation complete."
echo "Confirm the mobile client reconnected after bridge restart and record any manual observations in the staging runbook."
