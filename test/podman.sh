#!/bin/sh
# Run the browser test tiers inside a container.
#
# jsdom and Playwright are heavy, and Playwright additionally wants browser
# binaries, so none of it is installed on the host: dependencies live in a
# named podman volume and the browsers come preinstalled in the image.
#
# Usage: test/podman.sh <command...>
set -eu

REPO="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${DHMAP_TEST_IMAGE:-mcr.microsoft.com/playwright:v1.62.0-noble}"
VOLUME="${DHMAP_TEST_VOLUME:-dhmap-deps}"

if ! command -v podman >/dev/null 2>&1; then
  echo "podman is required for this tier; skipping." >&2
  exit 127
fi

# Install into the volume on first use, then reuse it. Uses the repo's
# lockfile so the versions match what CI installs.
BOOTSTRAP='
if [ ! -d /deps/node_modules ]; then
  cp /work/package.json /work/package-lock.json /deps/
  (cd /deps && npm ci --no-audit --no-fund >/dev/null)
fi
'

exec podman run --rm -i \
  -v "$REPO":/work \
  -v "$VOLUME":/deps \
  -w /work \
  -e NODE_PATH=/deps/node_modules \
  -e PATH=/deps/node_modules/.bin:/usr/local/bin:/usr/bin:/bin \
  -e CI="${CI:-}" \
  "$IMAGE" \
  bash -c "$BOOTSTRAP
$*"
