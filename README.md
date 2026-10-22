# FFM Aktuell

Frankfurt discovery and community web platform: Next.js, React, TypeScript, PostgreSQL, MapLibre and isolated Docker Compose. Public, account, merchant and department administration interfaces support German and English. Native apps and email are outside the current scope.

For local development, configure `.env` from `.env.example`, install the locked dependencies with `npm ci`, initialize a separate database with `db/schema.sql` and `db/seed.sql`, then run `npm run dev`. Optional providers remain disabled until configured; no keys or production customer data are needed for the automated fixture tests.

Docker uses the independent `ffm-aktuell` Compose project and the explicit `ffm-aktuell-web` / `ffm-aktuell-db` container names. Configure private `POSTGRES_PASSWORD` and `SESSION_SECRET`, select the existing shared proxy network with `PUBLISHER_NETWORK`, and run `docker compose up -d --build`. Apply schema/seed inside the isolated FFM database. The shared Caddy upstream is `ffm-aktuell-web:3000`. Do not delete or restart Publisher or other projects.

Root provisioning: supply `ADMIN_EMAIL`, `ADMIN_PASSWORD` (at least 14 characters) and the isolated `DATABASE_URL` only in the command environment when running `npm run admin:create`. This operator command can reset an existing account's password and grant root access; use it only for an authorized account. Personal one-use administrator activation requires at least 16 characters. Never commit credentials.

Validation: `npm test`, `npm run typecheck`, `npm run build` and `bash scripts/validate-operations.sh`. CI additionally runs actual Chromium localization, keyboard, accessibility and map checks, PostgreSQL HTTP acceptance, archive restore and Compose validation.

- [Current delivery and external prerequisites](docs/ROADMAP.md)
- [Technical handover and rights/domain model](docs/TECHNICAL_HANDOVER.md)
- [Operation, private nightly snapshots and incident recovery](docs/OPERATIONS.md)
- [Provider activation](docs/SERVICE_ACTIVATION.md)
- [API contracts](docs/API_CONTRACTS.md) and [OpenAPI](docs/openapi.json); live reference `/api-docs`, machine-readable `/api/openapi`
- [Workflow acceptance cases](docs/ACCEPTANCE_A_TO_I.md) and [implementation history](docs/BRIEFING_IMPLEMENTATION_MATRIX.md)

Live provider/device acceptance, a private malware scanner, actual editorial/licensed inventory and independent legal/accessibility approval remain external prerequisites. A passing fixture test never fabricates payment, real-world verification or content rights.
