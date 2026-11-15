#!/usr/bin/env bash
# Ships a commit to the Docker host and restarts Kip behind its Cloudflare tunnel:
#   infra/tunnel/deploy.sh [git ref]    (default HEAD; DEPLOY_HOST overrides the ssh host)
# Only committed files ship (git archive). The image is built on the host, which is amd64,
# so there is no registry and no cross-build. Secrets stay in /opt/kip/.env on the host.
set -euo pipefail

ref=${1:-HEAD}
host=${DEPLOY_HOST:-ehewesagents}
url=${KIP_URL:-https://kip.edenmatrix.xyz}

cd "$(git rev-parse --show-toplevel)"
sha=$(git rev-parse --short=12 "${ref}^{commit}")
if [ -n "$(git status --porcelain)" ]; then
  echo "note: uncommitted changes are not deployed" >&2
fi

echo "deploying ${sha} to ${host}"
# Unpack beside the current source, then swap, so a failed copy never leaves half a tree.
git archive --format=tar "$sha" | ssh "$host" \
  'set -e; rm -rf /opt/kip/src.new; mkdir /opt/kip/src.new; tar -x -C /opt/kip/src.new;
   rm -rf /opt/kip/src; mv /opt/kip/src.new /opt/kip/src'
# shellcheck disable=SC2029 # the commit is meant to expand here, on this side
ssh "$host" "/opt/kip/src/infra/tunnel/remote-deploy.sh ${sha}"

# Through Cloudflare, after the on-host smoke test passed: a failure here is the tunnel or DNS,
# and the release itself is already running on the host.
if curl -fsS --max-time 20 --retry 5 --retry-delay 3 --retry-all-errors "${url}/health" >/dev/null; then
  echo "public: ${url}/health OK"
else
  echo "public: ${url}/health did not answer; check cloudflared's logs on the host" >&2
  exit 1
fi
