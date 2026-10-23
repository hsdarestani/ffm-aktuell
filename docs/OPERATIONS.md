# FFM web operations

22 October 2026. Scope is only `/opt/ffm-aktuell`, its Compose project/database/media and two FFM systemd timers. Publisher and other applications are independent. Never print or attach `.env`, private backup files, database dumps, user exports, provider tokens or endpoint credentials.

## Installed operation

`ffm-nightly-backup.timer` starts a private snapshot daily at 03:17 UTC with up to ten minutes jitter. The deployment runs the first snapshot immediately. `flock` prevents two daily snapshots overlapping. Database custom archive structure and media gzip/tar integrity are checked before an atomic completed-directory rename. Files are mode 600 inside mode 700 directories. The environment is included privately for disaster recovery; source remains in Git. Seven days of recognized completed daily snapshots are retained. A 1 GiB minimum free-space gate refuses a new capture without deleting unexpected files. Defaults can be changed in the versioned scripts/timer and deployed again.

`ffm-health.timer` checks PostgreSQL readiness, actual database-backed application health and a completed daily snapshot no older than 36 hours every five minutes. Results and failure status go to the local system journal. A separate public GitHub Actions monitor checks the HTTPS health endpoint and API reference every fifteen minutes, independently of the application host. GitHub Actions run history is the external status record; no external incident recipient is silently enrolled.

Read-only checks:

```sh
systemctl list-timers 'ffm-*'
systemctl status ffm-health.service ffm-nightly-backup.service
journalctl -u ffm-health.service -u ffm-nightly-backup.service --since '24 hours ago'
cd /opt/ffm-aktuell
docker compose ps
```

The daily snapshots are local disaster-recovery inputs, not an off-host backup. Disk loss still requires an operator-provided private off-host destination and access policy. The database uses a consistent PostgreSQL snapshot; media is captured sequentially while the site remains available. Do not claim a filesystem-level atomic database/media point-in-time recovery. Restore into an isolated environment, reconcile media against database references, and keep public delivery gated by rights/scan/moderation checks. For stronger RPO/atomicity the operator must provide storage snapshots or continuous archiving capacity.

## Incident handling

1. Record UTC time, affected public URL/status, exact deployed SHA and failing service name. Keep user data and private log contents out of public issues.
2. Check public HTTPS and internal health separately. A tile/provider failure with a usable map fallback is different from a database/application outage. Inspect only FFM service logs; do not restart the shared host or unrelated projects.
3. If the latest web release caused the failure, use the retained previous FFM image/source/environment from the deployment restore point. The deployment already attempts isolated web rollback automatically on failure. Do not restore an old database over newer payment/customer records merely to roll back UI code.
4. For provider/scanner failures, disable the optional integration via its explicit empty allowlisted setting or retain the existing fail-closed behavior. Do not bypass malware scanning, payment confirmation, ownership or factual-evidence gates.
5. For data loss, preserve the failing state and select a validated private snapshot. Rehearse `pg_restore --exit-on-error` into a new isolated database and check row counts, constraints, paid snapshots, consent and rights. CI exercises this procedure against disposable PostgreSQL. Reconcile any provider events since the snapshot before allowing writes or paid delivery.
6. Restore media/environment only to the isolated FFM scope with original private permissions. Verify archive checksums locally without printing private file contents. Missing/withdrawn/unlicensed media must stay unavailable.
7. Verify FFM and Publisher health, public TLS, authentication, private data isolation and the affected flow. Record recovery evidence and any actual lost interval. A successful health response does not prove live OAuth, SMS, payments or Push delivery.

## Capacity and external acceptance

The shared 4 GiB host does not have capacity for the bundled local malware scanner. Supply a private scanner or extra capacity; upload remains closed until its actual health succeeds. Monitor disk growth and private deployment restore points; daily expiry deliberately does not delete release backups or unknown files. Off-host storage/retention, alert recipient/on-call responsibility, qualified legal/security/accessibility review and real devices/accounts remain operator inputs. Native clients and email are excluded.
