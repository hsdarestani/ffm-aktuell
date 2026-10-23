#!/usr/bin/env bash
set -euo pipefail
cd /opt/ffm-aktuell
docker compose exec -T db pg_isready -U ffm -d ffm </dev/null >/dev/null
docker compose exec -T web node -e 'fetch("http://127.0.0.1:3000/api/health",{signal:AbortSignal.timeout(8000)}).then(async r=>{if(!r.ok)throw Error("http");const d=await r.json();if(d.status!=="ok")throw Error("status")}).catch(()=>process.exit(1))' </dev/null
# Only completed snapshots count; files and credentials are never printed.
python3 - <<'PY'
from pathlib import Path
import re, time
root=Path('/opt/ffm-aktuell/backups')
items=[p for p in root.iterdir() if not p.is_symlink() and p.is_dir() and re.fullmatch(r'nightly-20\d{6}T\d{6}Z',p.name) and (p/'SHA256SUMS').is_file()]
if not items or time.time()-max(p.stat().st_mtime for p in items)>36*3600:
    raise SystemExit('FFM nightly snapshot absent or older than 36 hours')
print('FFM database, HTTP and nightly snapshot freshness OK')
PY
