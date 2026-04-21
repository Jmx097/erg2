#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/openclaw/erg2}"
APP_USER="${APP_USER:-openclaw}"
APP_GROUP="${APP_GROUP:-${APP_USER}}"
BRIDGE_ENV_SOURCE="${BRIDGE_ENV_SOURCE:-${REPO_DIR}/ops/env/bridge.production.env.example}"
BRIDGE_ENV_TARGET="${BRIDGE_ENV_TARGET:-/etc/openclaw/bridge.env}"
NGINX_SOURCE="${NGINX_SOURCE:-${REPO_DIR}/ops/nginx/openclaw-mobile.conf}"
NGINX_TARGET="${NGINX_TARGET:-/etc/nginx/sites-available/openclaw-mobile.conf}"
NGINX_ENABLED_TARGET="${NGINX_ENABLED_TARGET:-/etc/nginx/sites-enabled/openclaw-mobile.conf}"
BRIDGE_SERVICE_SOURCE="${BRIDGE_SERVICE_SOURCE:-${REPO_DIR}/ops/systemd/openclaw-bridge.service}"
UPSTREAM_SERVICE_SOURCE="${UPSTREAM_SERVICE_SOURCE:-${REPO_DIR}/ops/systemd/openclaw-upstream.service}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"

if [[ ! -d "${REPO_DIR}" ]]; then
  echo "Repository directory not found: ${REPO_DIR}" >&2
  exit 1
fi

if [[ ! -f "${BRIDGE_ENV_SOURCE}" ]]; then
  echo "Bridge environment source not found: ${BRIDGE_ENV_SOURCE}" >&2
  exit 1
fi

if [[ ! -f "${NGINX_SOURCE}" ]]; then
  echo "nginx source config not found: ${NGINX_SOURCE}" >&2
  exit 1
fi

if [[ ! -f "${BRIDGE_SERVICE_SOURCE}" || ! -f "${UPSTREAM_SERVICE_SOURCE}" ]]; then
  echo "systemd source unit files not found under ${REPO_DIR}/ops/systemd" >&2
  exit 1
fi

sudo mkdir -p /etc/openclaw "${SYSTEMD_DIR}" /etc/nginx/sites-available /etc/nginx/sites-enabled

if [[ ! -f "${BRIDGE_ENV_TARGET}" ]]; then
  sudo cp "${BRIDGE_ENV_SOURCE}" "${BRIDGE_ENV_TARGET}"
  echo "Installed bridge env template to ${BRIDGE_ENV_TARGET}."
  echo "Populate real secrets before starting services."
else
  echo "Preserving existing bridge env at ${BRIDGE_ENV_TARGET}."
fi

sudo chown "${APP_USER}:${APP_GROUP}" "${BRIDGE_ENV_TARGET}"
sudo chmod 640 "${BRIDGE_ENV_TARGET}"

sudo cp "${NGINX_SOURCE}" "${NGINX_TARGET}"
sudo ln -sf "${NGINX_TARGET}" "${NGINX_ENABLED_TARGET}"
sudo cp "${BRIDGE_SERVICE_SOURCE}" "${SYSTEMD_DIR}/openclaw-bridge.service"
sudo cp "${UPSTREAM_SERVICE_SOURCE}" "${SYSTEMD_DIR}/openclaw-upstream.service"

sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl enable openclaw-bridge openclaw-upstream

echo "Installed nginx and systemd assets."
echo "Next steps:"
echo "  1. Edit ${BRIDGE_ENV_TARGET} with real staging values."
echo "  2. Ensure TLS certificate paths in ${NGINX_TARGET} are valid for this host."
echo "  3. Restart services: sudo systemctl restart openclaw-upstream openclaw-bridge nginx"
