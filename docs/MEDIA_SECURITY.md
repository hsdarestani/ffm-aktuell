# User media security and operations

This feature branch adds an opt-in media pipeline. All uploaded bytes are MIME-sniffed, scanned by a configured **ClamAV daemon**, converted to metadata-stripped WebP or remuxed without video metadata by ffmpeg, scanned a second time, then stored in an access-controlled **persistent** Docker volume. Unscanned bytes never become public. No permissive fallback.

**Activation prerequisites:** run a separate ClamAV instance with current signatures, set CLAMD_HOST/CLAMD_PORT to an internal trusted network address, run the SQL schema migration, provision persistent media storage and backups, and perform app/browser tests before exposing the upload UI. Without scanner, POST /api/media/upload rejects with 503.

Images must be JPG/PNG/WebP; videos MP4/WebM. File limit 24 MiB, max 8 uploads per signed-in user per hour; explicit rights checkbox required. Uploaded items enter pending editorial review and are not automatically published. The media read endpoint checks owner/admin or currently published post/story/highlight with a live consent.

**Remaining before public media launch:** story/highlight consent API and corresponding UI, dedicated moderation screen, copyright/takedown and appeal policy, deletion/retention cleanup, EU infrastructure/legal approval, media streaming and mobile acceptance. Do not enable externally before these gates pass.
