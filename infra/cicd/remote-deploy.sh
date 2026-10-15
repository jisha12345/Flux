#!/usr/bin/env bash
#
# Runs ON the POC EC2 box as root, piped in by CodeBuild via SSM RunCommand.
# Mirrors the house pattern used by miq, with three differences Flux needs:
#   * two systemd units (Next app + voice gateway), not one
#   * a second npm install inside gateway/
#   * a name-based TLS vhost in sites-enabled, not a path snippet in apps-enabled
#
# Inputs (exported by the buildspec):
#   DEPLOY_SHA    40-hex commit to check out (required)
#   DEPLOY_PATH   default /home/ubuntu/apps/flux
#   DEPLOY_USER   default ubuntu
#   APP_NAME      default flux
#   APP_PORT      default 3040
#   DOMAIN        default jisha.ai-rocket-experiments.com
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/home/ubuntu/apps/flux}"
DEPLOY_USER="${DEPLOY_USER:-ubuntu}"
APP_NAME="${APP_NAME:-flux}"
APP_PORT="${APP_PORT:-3040}"
DOMAIN="${DOMAIN:-jisha.ai-rocket-experiments.com}"
GATEWAY_UNIT="${APP_NAME}-gateway"

log() { printf '\n=== %s ===\n' "$*"; }
fail() { printf 'DEPLOY FAILED: %s\n' "$*" >&2; exit 1; }

# SSM RunCommand executes as root with no HOME, and git refuses to run
# `config --global` without one. runuser does not set it either, so the
# deploy user's home is passed explicitly on every command below.
export HOME="${HOME:-/root}"
USER_HOME="$(getent passwd "${DEPLOY_USER}" | cut -d: -f6)"
[ -n "$USER_HOME" ] || fail "cannot resolve home directory for ${DEPLOY_USER}"
asuser() { runuser -u "$DEPLOY_USER" -- env HOME="$USER_HOME" "$@"; }

[ "$(id -u)" -eq 0 ] || fail "must run as root"
[ -n "${DEPLOY_SHA:-}" ] || fail "DEPLOY_SHA not set"
printf '%s' "$DEPLOY_SHA" | grep -Eq '^[0-9a-f]{40}$' || fail "DEPLOY_SHA is not a 40-hex sha"
case "$DEPLOY_PATH" in /home/*) : ;; *) fail "refusing to deploy outside /home" ;; esac
for b in aws git npm node nginx systemctl runuser rsync; do
  command -v "$b" >/dev/null || fail "missing required binary: $b"
done

log "Checking out $DEPLOY_SHA"
cd "$DEPLOY_PATH" || fail "$DEPLOY_PATH does not exist"
asuser git config --global credential.helper '!aws codecommit credential-helper $@'
asuser git config --global credential.UseHttpPath true
asuser git config --global --add safe.directory "$DEPLOY_PATH"
asuser git -C "$DEPLOY_PATH" fetch --prune origin main
asuser git -C "$DEPLOY_PATH" checkout --detach "$DEPLOY_SHA"
ACTUAL="$(asuser git -C "$DEPLOY_PATH" rev-parse HEAD)"
[ "$ACTUAL" = "$DEPLOY_SHA" ] || fail "HEAD is $ACTUAL, expected $DEPLOY_SHA"

# Secrets live only on the box and are gitignored — a checkout must never
# leave the app without them.
[ -f "$DEPLOY_PATH/.env.production" ] || fail "missing $DEPLOY_PATH/.env.production (run scripts/deploy-poc-env.sh)"
[ -f "$DEPLOY_PATH/gateway/.env" ]    || fail "missing $DEPLOY_PATH/gateway/.env (run scripts/deploy-poc-env.sh)"

log "Installing dependencies"
# env -u NODE_ENV so devDependencies (needed to build) are installed.
asuser env -u NODE_ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
  npm --prefix "$DEPLOY_PATH" ci --include=dev
asuser env -u NODE_ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
  npm --prefix "$DEPLOY_PATH/gateway" install

log "Building"
rm -rf "$DEPLOY_PATH/.next"
asuser env NODE_ENV=production npm --prefix "$DEPLOY_PATH" run build

log "Installing host files"
install -m 644 "$DEPLOY_PATH/infra/host/flux.service"         /etc/systemd/system/"${APP_NAME}".service
install -m 644 "$DEPLOY_PATH/infra/host/flux-gateway.service" /etc/systemd/system/"${GATEWAY_UNIT}".service
install -m 644 "$DEPLOY_PATH/infra/host/nginx-websocket-upgrade.conf" /etc/nginx/conf.d/websocket-upgrade.conf

# Only install the TLS vhost once certbot has issued the certificate,
# otherwise nginx refuses to load and would take the other POCs down with it.
if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  install -m 644 "$DEPLOY_PATH/infra/host/nginx-flux.conf" /etc/nginx/sites-available/"${APP_NAME}"
  ln -sfn /etc/nginx/sites-available/"${APP_NAME}" /etc/nginx/sites-enabled/"${APP_NAME}"
else
  echo "WARNING: no certificate for ${DOMAIN}; leaving the existing vhost in place"
fi

systemctl daemon-reload
systemctl enable --now "${APP_NAME}".service "${GATEWAY_UNIT}".service
systemctl restart "${APP_NAME}".service "${GATEWAY_UNIT}".service

nginx -t || fail "nginx config test failed"
systemctl reload nginx

log "Health checks"
ok=0
for _ in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/employer/login" || true)"
  case "$code" in 2*|3*) ok=1; break ;; esac
  sleep 2
done
[ "$ok" = 1 ] || { journalctl -u "${APP_NAME}".service -n 80 --no-pager; fail "app did not come up"; }

ok=0
for _ in $(seq 1 20); do
  if curl -sf -m 5 http://127.0.0.1:8787/health >/dev/null; then ok=1; break; fi
  sleep 2
done
[ "$ok" = 1 ] || { journalctl -u "${GATEWAY_UNIT}".service -n 80 --no-pager; fail "gateway did not come up"; }

echo "app=$(systemctl is-active "${APP_NAME}".service) gateway=$(systemctl is-active "${GATEWAY_UNIT}".service)"
echo "DEPLOY OK @ ${DEPLOY_SHA}"
