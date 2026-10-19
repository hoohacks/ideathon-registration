#!/usr/bin/env bash
# Runs e2e/visual.spec.mjs inside the Playwright image CI's browser job uses, so
# Linux baselines can be checked and recorded from any machine with Docker.
#
#   npm run test:visual:linux            compare against the Linux baselines
#   npm run test:visual:linux -- --update-snapshots
#                                        record them, or accept an intended change
#
# Fonts rasterize differently per platform and per font set, so a baseline only
# means something in the environment it was recorded in. Keep the image tag here
# in step with the `container:` of the e2e job in .github/workflows/ci.yml and
# with the installed @playwright/test.
set -euo pipefail

IMAGE="mcr.microsoft.com/playwright:v1.62.1-noble"
REPO="$(cd "$(dirname "$0")/.." && pwd)"

# Git Bash on Windows rewrites /paths in arguments; this keeps them as written.
export MSYS_NO_PATHCONV=1

# On a Linux host the container's root would own the PNGs it writes back;
# they are handed to the person running this instead. Docker Desktop on
# Windows and macOS maps ownership itself.
OWNER=""
case "$(uname -s)" in Linux) OWNER="$(id -u):$(id -g)" ;; esac

# The repo is copied rather than used in place: node_modules on the host is
# built for the host, and a Windows install will not run on Linux. Only the
# snapshots folder is mounted writable, so recording cannot touch anything else.
#
# The PNGs are copied back whether or not the run passed, so a recording run
# with one flaky test keeps the baselines it did write. The run's own exit
# status is what this script exits with.
docker run --rm --ipc=host   -e OWNER="$OWNER"   -v "$REPO:/src:ro"   -v "$REPO/e2e/visual.spec.mjs-snapshots:/snapshots"   "$IMAGE" bash -euo pipefail -c '
    apt-get update -qq && apt-get install -y -qq openjdk-21-jre-headless >/dev/null
    mkdir /work && cd /src
    tar --exclude=./node_modules --exclude=./build --exclude=./test-results         --exclude=./playwright-report --exclude=./.git -cf - . | tar -xf - -C /work
    cd /work && npm ci --no-audit --no-fund --loglevel=error
    # emulators:exec hands its command to a shell, so the arguments are
    # quoted for it, so a grep with spaces or quotes in it survives intact
    args="$(printf "%q " "$@")"
    status=0
    npx firebase emulators:exec --only database,auth,storage --project demo-ideathon       "node scripts/seed-event.mjs --teams=8 --judges=12 --rooms=8 --schedule && npx playwright test e2e/visual.spec.mjs $args"       || status=$?
    shopt -s nullglob
    for png in e2e/visual.spec.mjs-snapshots/*-linux.png; do
      cp "$png" /snapshots/
      if [ -n "$OWNER" ]; then chown "$OWNER" "/snapshots/$(basename "$png")"; fi
    done
    exit "$status"
  ' visual-linux "$@"
