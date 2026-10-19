# Launch requirements and safe media activation

**Do not deploy or enable live media until** the VPS capacity and security service are verified. The official ClamAV Docker guide recommends approximately 3–4 GiB RAM just for ClamAV; app + PostgreSQL need additional RAM. A 2 GB shared VPS is **not sufficient** for this standard deployment. See https://docs.clamav.net/manual/Installing/Docker.html .

## Safe server checklist

1. Back up existing PostgreSQL and the persistent `ffm_media` volume; restore-test backups.
2. Confirm free RAM, disk and CPU. Use a dedicated scanning host on a **private** network if current STRATO node cannot fit ClamAV. Do not expose port 3310 to the public internet.
3. If resources allow, run `docker compose -f docker-compose.yml -f docker-compose.media.yml --profile media config` and then `docker compose -f docker-compose.yml -f docker-compose.media.yml --profile media up -d`; watch ClamAV logs/signature updates.
4. Ensure app DB migration has applied `db/schema.sql` before sending any user uploads.
5. Verify `GET /api/media/status` returns `upload_enabled:true` **after** ClamAV is truly ready. If false, files remain disabled and text posts still work.
6. Test clean PNG and short MP4 upload: pending review, owner access, admin approval, public post/Story, mobile Range 206 video response, business grant/highlight, revoke, expiry and deletion. Test EICAR rejection only from authorized QA environment.
7. Verify privacy notice, takedown flow and moderator access, and do browser/device QA; do not enable public upload ahead of these checks.

Login provider configuration is independent: set the Google/Apple redirect clients according to `docs/OAUTH_SETUP_20261019.md` and verify both with real provider credentials. Never put tokens or private keys into git.

Map QA: ensure actual vector or raster tiles appear on mobile and desktop. A passing GitHub CI cannot prove a remote tile CDN works. The map now attempts automatic raster fallback and offers an external OpenStreetMap escape hatch.

Editorial verification: the four credible source leads are in the admin review panel. They require individual operator/status confirmation, not automatic bulk marking as verified.
