# North Dorset Darts League — live deployment

This package is designed for Cloudflare Pages with Pages Functions, D1 and Cloudflare Access.

## Before deployment

1. Create a Cloudflare D1 database named `north-dorset-darts-league`.
2. Replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.toml` with its database ID.
3. Apply `migrations/0001_initial.sql` to a new database. For an existing deployment, apply each later migration in order through `migrations/0019_venue_board_capacity.sql`.
4. Set `BOOTSTRAP_ADMIN_EMAILS` to a comma-separated list of committee administrator emails.
5. Deploy through Git integration or Wrangler. Dashboard drag-and-drop does not compile Pages Functions.
6. In Cloudflare Zero Trust, protect `/admin.html`, `/league-management.html` and `/api/admin/*` with an Access policy restricted to approved committee emails.
7. Leave `/`, static assets, `/api/public/*` and `POST /api/applications` public.

## Required security checks

- Confirm an anonymous visitor receives `401` from `/api/admin/bootstrap`.
- Confirm an approved committee account can load the League Office.
- Confirm a non-administrator cannot delete records.
- Submit a public application and confirm it appears in the League Office.
- Confirm published results appear publicly and unpublished results do not.
- Export the D1 database before the first live season and schedule regular exports.
- Open League Office → Exports & backup → Competitions, sponsors & recovery and create a recovery point before bulk changes.

The establishment year and official committee-approved rule wording remain content items that must be supplied before final public launch.
