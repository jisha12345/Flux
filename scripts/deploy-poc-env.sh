#!/usr/bin/env bash
#
# Push environment files to the POC box. Run this when a key or URL changes —
# scripts/deploy-poc.sh never touches secrets.
#
#   ./scripts/deploy-poc-env.sh
#
# Reads the local .env.local for secret VALUES, rewrites the deploy-specific
# URLs, and ships two files:
#   /home/ubuntu/apps/flux/.env.production   (Next.js app)
#   /home/ubuntu/apps/flux/gateway/.env      (voice gateway)
#
# Secrets travel via a short-lived presigned S3 URL rather than SSM command
# parameters, which would otherwise be recorded in CloudTrail/SSM history.
# The S3 copies are deleted immediately afterwards.
#
# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so run
# scripts/deploy-poc.sh after changing any of them.
set -euo pipefail

REGION="${REGION:-ap-south-1}"
INSTANCE_ID="${INSTANCE_ID:-i-0ce97c38c7fd74825}"
BUCKET="${BUCKET:-rocketizer-assets-507121383669-ap-south-1}"
DOMAIN="${DOMAIN:-jisha.ai-rocket-experiments.com}"
APP_DIR="/home/ubuntu/apps/flux"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
[ -f .env.local ] || { echo "no .env.local to read secrets from" >&2; exit 1; }

say() { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
val() { grep "^$1=" .env.local | cut -d= -f2- | head -1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/env.production" <<EOF
NEXT_PUBLIC_SUPABASE_URL=$(val NEXT_PUBLIC_SUPABASE_URL)
NEXT_PUBLIC_SUPABASE_ANON_KEY=$(val NEXT_PUBLIC_SUPABASE_ANON_KEY)
SUPABASE_SERVICE_ROLE_KEY=$(val SUPABASE_SERVICE_ROLE_KEY)
ANTHROPIC_API_KEY=$(val ANTHROPIC_API_KEY)
SARVAM_API_KEY=$(val SARVAM_API_KEY)
NEXT_PUBLIC_SITE_URL=https://$DOMAIN
NEXT_PUBLIC_APP_URL=https://$DOMAIN
NEXT_PUBLIC_INTERVIEW_GATEWAY_URL=https://$DOMAIN/gw
EOF

cat > "$TMP/env.gateway" <<EOF
SUPABASE_URL=$(val NEXT_PUBLIC_SUPABASE_URL)
SUPABASE_SERVICE_ROLE_KEY=$(val SUPABASE_SERVICE_ROLE_KEY)
ANTHROPIC_API_KEY=$(val ANTHROPIC_API_KEY)
SARVAM_API_KEY=$(val SARVAM_API_KEY)
GATEWAY_PORT=8787
GATEWAY_ALLOWED_ORIGINS=https://$DOMAIN
EOF

KEY_APP="poc-deploys/env-app-$$"
KEY_GW="poc-deploys/env-gw-$$"
say "Staging env files"
aws s3 cp "$TMP/env.production" "s3://$BUCKET/$KEY_APP" --region "$REGION" --only-show-errors
aws s3 cp "$TMP/env.gateway"    "s3://$BUCKET/$KEY_GW"  --region "$REGION" --only-show-errors
URL_APP="$(aws s3 presign "s3://$BUCKET/$KEY_APP" --region "$REGION" --expires-in 900)"
URL_GW="$(aws s3 presign  "s3://$BUCKET/$KEY_GW"  --region "$REGION" --expires-in 900)"

python3 - "$URL_APP" "$URL_GW" "$APP_DIR" > /tmp/flux-env-params.json <<'PY'
import json, sys
app, gw, d = sys.argv[1], sys.argv[2], sys.argv[3]
print(json.dumps({"commands": [
    "set -e",
    'curl -fsS -o %s/.env.production "%s"' % (d, app),
    'curl -fsS -o %s/gateway/.env "%s"' % (d, gw),
    "chmod 600 %s/.env.production %s/gateway/.env" % (d, d),
    "chown ubuntu:ubuntu %s/.env.production %s/gateway/.env" % (d, d),
    "echo installed: $(wc -l < %s/.env.production) app vars, $(wc -l < %s/gateway/.env) gateway vars" % (d, d),
]}))
PY

CMD_ID="$(aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript --parameters file:///tmp/flux-env-params.json \
  --query Command.CommandId --output text)"

for _ in $(seq 1 20); do
  STATUS="$(aws ssm get-command-invocation --region "$REGION" --command-id "$CMD_ID" \
    --instance-id "$INSTANCE_ID" --query Status --output text 2>/dev/null || echo Pending)"
  case "$STATUS" in Success|Failed|Cancelled|TimedOut) break ;; esac
  sleep 5
done

aws s3 rm "s3://$BUCKET/$KEY_APP" --region "$REGION" --only-show-errors || true
aws s3 rm "s3://$BUCKET/$KEY_GW"  --region "$REGION" --only-show-errors || true

aws ssm get-command-invocation --region "$REGION" --command-id "$CMD_ID" \
  --instance-id "$INSTANCE_ID" --query StandardOutputContent --output text | tail -5

[ "$STATUS" = "Success" ] || { say "FAILED ($STATUS)"; exit 1; }
say "Env installed. Run ./scripts/deploy-poc.sh to rebuild with the new values."
