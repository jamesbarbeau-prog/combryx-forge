# Conciliation Manager — go-live steps

The module ships blank: no data is imported.

1. Apply the migrations in `supabase/migrations/` in order (SQL editor or `supabase db push`). They add only `cm_*` objects and a private `cm-documents` storage bucket.
2. Sign in to the app, open Conciliation, and choose **Create workspace**. You become the first manager; add teammates from the Team tab.
3. Optional Tarion sync: `supabase secrets set TARION_USERNAME=... TARION_PASSWORD=... TARION_ORG_ID=...` then `supabase functions deploy tarion-sync`. The Sync Tarion button runs it. Credentials are currently one set per deployment, not per company.

Tests: `npm i -D @electric-sql/pglite && node supabase/tests/cm.test.mjs` (45 checks, run against an in-memory Postgres with Supabase-style permissions).

Flow charts and rules: `docs/conciliation-workflow.md`.
