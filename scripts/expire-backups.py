#!/usr/bin/env python3
"""Bounded retention: never recurse, follow links or touch deployment/partial archives."""
from pathlib import Path
import re
import sys
import time

FILES = frozenset(('database.dump', 'media.tar.gz', 'environment.private', 'SHA256SUMS', 'manifest.json'))

def expire(root: Path, days: int, now: float | None = None) -> int:
    if not 1 <= days <= 90:
        raise ValueError('Retention must be 1 to 90 days')
    if root.is_symlink() or not root.is_dir():
        raise ValueError('Expected a real private backup directory')
    cutoff = (time.time() if now is None else now) - days * 86400
    removed = 0
    for item in root.iterdir():
        if not re.fullmatch(r'nightly-20\d{6}T\d{6}Z', item.name):
            continue
        if item.is_symlink() or not item.is_dir() or item.stat().st_mtime >= cutoff:
            continue
        children = list(item.iterdir())
        if {p.name for p in children} != FILES or any(p.is_symlink() or not p.is_file() for p in children):
            continue
        # Only the five exact files in a known completed snapshot may be removed.
        for child in children:
            child.unlink()
        item.rmdir()
        removed += 1
    return removed

if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: expire-backups.py PRIVATE_DIRECTORY DAYS')
    print('Expired completed FFM snapshots:', expire(Path(sys.argv[1]), int(sys.argv[2])))
