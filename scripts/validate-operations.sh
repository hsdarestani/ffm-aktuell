#!/usr/bin/env bash
set -euo pipefail
bash -n scripts/nightly-backup.sh
bash -n scripts/check-server-health.sh
# The application unit references Docker, which may not be installed in the
# source-check container. A no-op dependency fixture validates our unit syntax.
UNIT_FIXTURE="$(mktemp -d)"
trap 'unlink "$UNIT_FIXTURE/docker.service"; rmdir "$UNIT_FIXTURE"' EXIT
printf '[Unit]\nDescription=CI dependency fixture\n[Service]\nType=oneshot\nExecStart=/bin/true\n' > "$UNIT_FIXTURE/docker.service"
SYSTEMD_UNIT_PATH="$UNIT_FIXTURE:$(pwd)/ops:" systemd-analyze verify ops/*.service ops/*.timer
