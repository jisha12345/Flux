# Deploying Flux to the POC EC2 box

Live at **https://jisha.ai-rocket-experiments.com**

## What runs where

The shared `poc-ec2` box (`i-0ce97c38c7fd74825`, Elastic IP `43.204.94.3`,
ap-south-1) hosts several POCs side by side. Flux is reached by **subdomain**,
not by path:

| | |
|---|---|
| Next.js app | `127.0.0.1:3040` — systemd unit `flux.service` |
| Voice gateway | `127.0.0.1:8787` — systemd unit `flux-gateway.service` |
| Public routing | nginx vhost `server_name jisha.ai-rocket-experiments.com` |
| TLS | Let's Encrypt, auto-renewed by the `certbot` package timer |

nginx dispatches on the `Host` header, so this vhost serves **only** Flux. The
other POCs live in the catch-all default server (`/etc/nginx/apps-enabled/*.conf`,
e.g. `/miq`) and are not reachable under this subdomain — and vice versa.
Adding a POC subdomain is one Route 53 A record plus one file in
`sites-available`; nothing about the existing apps changes.

The gateway is proxied under `/gw/`, and the trailing slash in `proxy_pass`
strips that prefix: `/gw/ws` → `/ws`, `/gw/upload/<token>/chunk` → `/upload/...`.
The browser derives `wss://` from the `https://` origin, so the voice socket is
encrypted end to end.

## Automatic deploys (CI/CD)

Follows the same pattern as the `miq` POC:

```
push to CodeCommit main
  └─ EventBridge rule  flux-eventbridge-pipeline
      └─ CodePipeline  flux-deploy
          └─ CodeBuild flux-deploy      (builds nothing)
              └─ SSM RunCommand → the box git-pulls the exact commit,
                 npm ci, next build, restarts both units, health-checks
```

Defined by CloudFormation stack **`flux-poc-cicd`**
(`infra/cicd/cloudformation.yml`). It deliberately does *not* declare the EC2
instance, security group, Elastic IP or instance profile — those belong to
`miq-poc-cicd`; this stack takes the instance as a parameter.

```bash
git push codecommit main      # triggers a deploy
aws codepipeline get-pipeline-state --region ap-south-1 --name flux-deploy
```

The repo's `origin` is GitHub. CodeCommit is a second remote:

```bash
git remote add codecommit https://git-codecommit.ap-south-1.amazonaws.com/v1/repos/flux
git config credential.helper '!aws codecommit credential-helper $@'
git config credential.UseHttpPath true
```

To have GitHub pushes mirror automatically, copy the OIDC role approach from
the `mailbox-ai-cicd` stack — that provider already exists account-wide, so a
second stack must reference rather than redeclare it.

## Manual deploys

Faster than the pipeline and works from uncommitted code:

```bash
./scripts/deploy-poc.sh        # tar → S3 → SSM → rsync, npm ci, build, restart
./scripts/deploy-poc-env.sh    # push .env.production + gateway/.env, then redeploy
```

Both reach the box over **SSM RunCommand** — the instance has no SSH key pair,
so there is nothing to hold. Secrets travel by short-lived presigned S3 URL
rather than SSM parameters, which would otherwise be retained in command
history and CloudTrail.

## Secrets

Never in git. Two files live on the box and survive every deploy:

- `/home/ubuntu/apps/flux/.env.production` — app (Supabase, Anthropic, Sarvam, public URLs)
- `/home/ubuntu/apps/flux/gateway/.env` — gateway

`NEXT_PUBLIC_*` values are inlined into the client bundle **at build time**, so
after changing one you must rebuild, not just restart. `deploy-poc-env.sh`
prints a reminder.

`NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_APP_URL` must both be the public
origin: auth redirects, magic links and interview-invite emails are built from
them, and they fall back to `localhost:3000` if unset.

Supabase Auth has its own **Site URL** and redirect allowlist in the dashboard,
independent of these. If a magic link ever lands on the wrong host, that is the
setting to check.

## Operating

```bash
I=i-0ce97c38c7fd74825
aws ssm start-session --region ap-south-1 --target $I     # shell on the box

systemctl status flux flux-gateway
journalctl -u flux-gateway -f          # live voice-pipeline logs
```

A stuck evaluation can be re-run without redoing the interview:

```bash
curl -X POST https://jisha.ai-rocket-experiments.com/gw/evaluate/<token>
```

## Gotchas found the hard way

- **Build on the box, not locally.** `next build` on macOS writes `._*`
  AppleDouble files into a tarball; ESLint then parses them and the build
  fails. `scripts/deploy-poc.sh` sets `COPYFILE_DISABLE=1` and deletes them.
- **Node 20 has no global `WebSocket`.** `supabase-js` constructs a realtime
  client eagerly and needs one; `gateway/src/supabase.ts` polyfills from `ws`
  rather than pinning the box to Node 22 (which the other POCs share).
- **nginx 1.18** (Ubuntu 22.04) has no standalone `http2` directive — it goes
  on the `listen` line.
- **Never run `npm run build` while `next dev` is running** against the same
  checkout; the production build overwrites `.next` and the dev server starts
  500ing on missing chunks.
