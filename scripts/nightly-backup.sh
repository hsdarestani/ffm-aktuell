#!/usr/bin/env bash
# Private FFM-only snapshots. Invoke as root from the installed systemd timer.
set -euo pipefail
umask 077
cd /opt/ffm-aktuell
exec 9>/opt/ffm-aktuell/backups/.nightly.lock
flock -n 9 || exit 0
python3 scripts/expire-backups.py /opt/ffm-aktuell/backups 7
MIN_FREE_KB=1048576
FREE_KB="$(df -Pk /opt/ffm-aktuell/backups | awk 'END {print $4}')"
if [ "$FREE_KB" -lt "$MIN_FREE_KB" ]; then echo 'FFM backup refused: less than 1 GiB free; previous snapshots preserved.' >&2; exit 1; fi
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
PART="/opt/ffm-aktuell/backups/.nightly-${STAMP}.partial"
FINAL="/opt/ffm-aktuell/backups/nightly-${STAMP}"
[ ! -e "$FINAL" ] || exit 0
mkdir -m 700 "$PART"
trap 'echo "FFM snapshot failed; private partial preserved for inspection." >&2' ERR
docker compose exec -T db pg_dump --format=custom -U ffm -d ffm </dev/null > "$PART/database.dump"
test -s "$PART/database.dump"
# Validate archive structure without writing to any database.
docker compose exec -T db pg_restore --list < "$PART/database.dump" >/dev/null
docker compose exec -T web tar -czf - -C /app uploads </dev/null > "$PART/media.tar.gz"
test -s "$PART/media.tar.gz"
tar -tzf "$PART/media.tar.gz" >/dev/null
cp .env "$PART/environment.private"
(cd "$PART" && sha256sum database.dump media.tar.gz environment.private > SHA256SUMS)
printf '{"created_at":"%s","project":"ffm-aktuell","scope":"database,media,environment","source_available_in_git":true}\n' "$STAMP" > "$PART/manifest.json"
chmod 600 "$PART/"*
mv "$PART" "$FINAL"
# Expire only recognized completed snapshots. Unexpected entries are preserved.
python3 scripts/expire-backups.py /opt/ffm-aktuell/backups 7
echo 'FFM private nightly snapshot validated; completed daily snapshots retained for 7 days.'
