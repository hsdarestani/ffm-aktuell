# FFM Aktuell

Initial bilingual Frankfurt discovery platform: Next.js / TypeScript / PostgreSQL / MapLibre / Docker.

Local: configure .env from .env.example; run npm install; initialize database using db/schema.sql and db/seed.sql; run npm run dev.

Docker: create .env with POSTGRES_PASSWORD and SESSION_SECRET; connect to existing aplus-publisher_default Docker network; run docker compose up -d --build, then apply schema and seed with psql inside the db container. Reverse proxy on Publisher Caddy to ffm-aktuell-web-1:3000. Do not delete or restart Publisher containers.

Administrator: set ADMIN_EMAIL and ADMIN_PASSWORD (14+ characters) only in command environment when running npm run admin:create with DATABASE_URL. Never commit passwords.

See docs/ROADMAP.md for unfinished features and major security/compliance limitations. Not production launch ready.
