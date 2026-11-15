#!/usr/bin/env bash
# Runs on the host after deploy.sh has unpacked a commit into /opt/kip/src. Builds the image,
# installs the compose files as /opt/kip/deploy, restarts the stack and smoke-tests it from
# inside the API container. Touches only this project: the host is shared with other stacks.
set -euo pipefail

sha=${1:?usage: remote-deploy.sh <commit>}
cd /opt/kip
if [ ! -f .env ]; then
  echo "missing /opt/kip/.env (infra/README.md, \"Cloudflare tunnel\")" >&2
  exit 1
fi

# Expo bakes EXPO_PUBLIC_ variables into the web build, so the public Mapbox web token is a build
# argument read from the same .env. Without it the deployed map shows its missing-token message.
mapbox_token=$(sed -n 's/^EXPO_PUBLIC_MAPBOX_TOKEN=//p' .env | tail -n 1 | tr -d "\"'")
if [ -z "$mapbox_token" ]; then
  echo "warning: no EXPO_PUBLIC_MAPBOX_TOKEN in /opt/kip/.env, so the web map shows its token message" >&2
fi

docker build --build-arg "EXPO_PUBLIC_MAPBOX_TOKEN=${mapbox_token}" -t "kip/server:${sha}" src
docker tag "kip/server:${sha}" kip/server:live

install -d deploy
install -m 644 src/infra/tunnel/compose.yml src/infra/tunnel/compose.tunnel.yml deploy/

compose=(docker compose --env-file .env -f deploy/compose.yml -f deploy/compose.tunnel.yml)
# --wait returns once the API is healthy and the others are running, and fails otherwise.
"${compose[@]}" up -d --remove-orphans --wait --wait-timeout 180

# shellcheck disable=SC2016 # ${path} is a JavaScript template literal, not shell
"${compose[@]}" exec -T api bun -e '
  for (const path of ["/health", "/"]) {
    const res = await fetch(`http://127.0.0.1:8080${path}`);
    if (!res.ok) {
      console.error(`smoke: ${path} answered ${res.status}`);
      process.exit(1);
    }
  }'
echo "smoke OK: kip/server:${sha} is live (API healthy, web build served)"

# Keep live, this build and the one before it (rollback). Only Kip's own tags are removed.
docker images kip/server --format '{{.Tag}}' | grep -vx -e live -e "$sha" | tail -n +2 \
  | xargs -r -I{} docker rmi "kip/server:{}" >/dev/null 2>&1 || true
docker image prune -f >/dev/null
