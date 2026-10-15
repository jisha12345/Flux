#!/usr/bin/env bash
#
# Deploy this repo to the shared POC EC2 box (poc-ec2) behind
# https://jisha.ai-rocket-experiments.com
#
#   ./scripts/deploy-poc.sh
#
# Mechanism: tar the working tree -> S3 -> presigned URL -> SSM RunCommand on
# the box (no SSH key needed; the instance has no key pair) -> rsync into place
# -> npm ci -> next build -> restart both systemd units -> health check.
#
# Secrets are NOT shipped: .env.production and gateway/.env live on the box and
# are preserved across deploys. To change them, use scripts/deploy-poc-env.sh.
#
# Requires: awscli v2 authenticated against account 507121383669.
set -euo pipefail

REGION="${REGION:-ap-south-1}"
INSTANCE_ID="${INSTANCE_ID:-i-0ce97c38c7fd74825}"
BUCKET="${BUCKET:-rocketizer-assets-507121383669-ap-south-1}"
KEY="poc-deploys/flux-$(date +%Y%m%d-%H%M%S).tar.gz"
APP_DIR="/home/ubuntu/apps/flux"
DOMAIN="${DOMAIN:-jisha.ai-rocket-experiments.com}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

say() { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }

say "Packaging $(git rev-parse --short HEAD 2>/dev/null || echo working-tree)"
TARBALL="$(mktemp -t flux-deploy).tar.gz"
# COPYFILE_DISABLE stops macOS writing ._* AppleDouble files, which ESLint
# then tries to parse and the build fails on.
COPYFILE_DISABLE=1 tar \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.git' \
  --exclude='gateway/node_modules' \
  --exclude='gateway/tmp-recordings' \
  --exclude='build-now' \
  --exclude='.env*' \
  --exclude='supabase/.temp' \
  --exclude='.DS_Store' \
  -czf "$TARBALL" .

say "Uploading to s3://$BUCKET/$KEY ($(du -h "$TARBALL" | cut -f1))"
aws s3 cp "$TARBALL" "s3://$BUCKET/$KEY" --region "$REGION" --only-show-errors
URL="$(aws s3 presign "s3://$BUCKET/$KEY" --region "$REGION" --expires-in 1800)"
rm -f "$TARBALL"

say "Deploying on $INSTANCE_ID"
PARAMS="$(python3 - "$URL" "$APP_DIR" "$DOMAIN" <<'PY'
import json, sys
url, app_dir, domain = sys.argv[1], sys.argv[2], sys.argv[3]
cmds = [
    "set -e",
    "rm -rf /tmp/flux-stage && mkdir -p /tmp/flux-stage",
    'curl -fsS -o /tmp/flux.tar.gz "%s"' % url,
    "tar -xzf /tmp/flux.tar.gz -C /tmp/flux-stage 2>/dev/null",
    "find /tmp/flux-stage -name '._*' -delete",
    # --delete so files removed from the repo also disappear on the box, while
    # deps, build output and secrets stay put.
    "rsync -a --delete --exclude node_modules --exclude .next --exclude '.env*' "
    "--exclude tmp-recordings /tmp/flux-stage/ %s/" % app_dir,
    "chown -R ubuntu:ubuntu %s" % app_dir,
    "cd %s" % app_dir,
    "echo STEP-deps",
    "sudo -u ubuntu -H env PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --include=dev 2>&1 | tail -3",
    "cd %s/gateway && sudo -u ubuntu -H env PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install 2>&1 | tail -2" % app_dir,
    "echo STEP-build",
    "cd %s && sudo -u ubuntu -H env NODE_ENV=production npm run build > /tmp/build.log 2>&1 || { tail -30 /tmp/build.log; exit 1; }" % app_dir,
    "tail -4 /tmp/build.log",
    "echo STEP-restart",
    "systemctl restart flux.service flux-gateway.service",
    "sleep 12",
    "echo flux=$(systemctl is-active flux.service) gateway=$(systemctl is-active flux-gateway.service)",
    'curl -sf -m 10 -o /dev/null -w "app:%%{http_code} " https://%s/employer/login' % domain,
    'curl -sf -m 10 -o /dev/null -w "gateway:%%{http_code}\\n" https://%s/gw/health' % domain,
    "echo DEPLOY-OK",
]
print(json.dumps({"commands": cmds, "executionTimeout": ["3600"]}))
PY
)"
echo "$PARAMS" > /tmp/flux-deploy-params.json

CMD_ID="$(aws ssm send-command \
  --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --parameters file:///tmp/flux-deploy-params.json \
  --timeout-seconds 900 \
  --query Command.CommandId --output text)"

say "SSM command $CMD_ID — waiting"
for _ in $(seq 1 90); do
  STATUS="$(aws ssm get-command-invocation --region "$REGION" \
    --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" \
    --query Status --output text 2>/dev/null || echo Pending)"
  case "$STATUS" in
    Success|Failed|Cancelled|TimedOut) break ;;
  esac
  sleep 10
done

aws ssm get-command-invocation --region "$REGION" \
  --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" \
  --query StandardOutputContent --output text | tail -20

if [ "$STATUS" != "Success" ]; then
  say "FAILED ($STATUS) — stderr:"
  aws ssm get-command-invocation --region "$REGION" \
    --command-id "$CMD_ID" --instance-id "$INSTANCE_ID" \
    --query StandardErrorContent --output text | tail -20
  aws s3 rm "s3://$BUCKET/$KEY" --region "$REGION" --only-show-errors || true
  exit 1
fi

aws s3 rm "s3://$BUCKET/$KEY" --region "$REGION" --only-show-errors || true
say "Deployed → https://$DOMAIN"
