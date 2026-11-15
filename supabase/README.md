# Conciliation Manager on Supabase — go-live steps

1. **Apply the migrations** in `supabase/migrations/` in order (SQL editor or `supabase db push`). They only add `cm_*` objects and a private `cm-documents` storage bucket; no existing table is altered.
2. **Create the tenant and the first manager** (once, in the SQL editor, with real IDs):
   ```sql
   select cm_seed_company('<company uuid>');
   insert into cm_members(company_id, user_id, role) values ('<company uuid>', '<auth user uuid>', 'manager');
   ```
3. **Import the Google Sheet**: in the app, Conciliation → Import & merge data → choose the `.xlsx` download of the Conciliation Manager sheet. Re-runnable; existing case numbers are skipped.
4. **Merge with homes/owners**: same screen → "Match cases to homes" (matches on enrolment number against `warranty_lots`).
5. **Tarion API**: `supabase secrets set TARION_USERNAME=... TARION_PASSWORD=... TARION_ORG_ID=...` then `supabase functions deploy tarion-sync`. "Sync Tarion" on the dashboard runs it; for a daily run, schedule a POST with header `x-cron-secret` (set `CM_CRON_SECRET` and `CM_COMPANY_ID`).

Tests: `npm i -D @electric-sql/pglite && node supabase/tests/cm.test.mjs` (runs the migrations in an in-memory Postgres and checks the stage engine, cash rules, intake decisions and tenant isolation).

Not yet ported from the Apps Script version: CAR PDF auto-reading (outcomes are entered per item for now), the release-form document, supervisor reminder emails and the calendar sync.
