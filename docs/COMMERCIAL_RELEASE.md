# Commercial Release Runbook

## Current deployment architecture

- Web application: Node.js / Express on Render
- Authentication and user directory: Appwrite Auth
- Operational data: Appwrite TablesDB
- PDF files: private Appwrite Storage bucket
- School isolation: every operational row is assigned a `schoolId`; the server applies the active school context to list, read, create, and update operations.
- Platform operations: `/platform/schools.html`

## Required Render environment variables

| Variable | Required | Purpose |
|---|---:|---|
| `APPWRITE_ENDPOINT` | Yes | Appwrite regional API endpoint |
| `APPWRITE_PROJECT_ID` | Yes | Appwrite project ID |
| `APPWRITE_API_KEY` | Yes | Server-only Appwrite API key; never expose to browser |
| `APPWRITE_DATABASE_ID` | Yes | TablesDB database ID |
| `APPWRITE_BUCKET_ID` | Yes | Private PDF storage bucket ID |
| `SCHOOL_NAME` | First deployment | Name for the initial tenant created during startup |
| `SCHOOL_SLUG` | First deployment | URL slug for the initial school, e.g. `teiki-test` |
| `PLATFORM_ADMIN_EMAILS` | For platform console | Comma-separated allowlist of platform operator email addresses |

Do not paste the API key into GitHub, browser code, or support messages. If the key is replaced, update the Render environment variable and redeploy.

## Appwrite API key scopes

The server provisions tables, columns, indexes, rows, user accounts, and private files. Grant only the required server-side scopes:

- `tables.read`, `tables.write`
- `columns.read`, `columns.write`
- `indexes.read`, `indexes.write`
- `rows.read`, `rows.write`
- `users.write`
- `files.read`, `files.write`

Add `databases.read` / `databases.write` only if database-level administration is also performed by this service. Keep the key server-side.

## First startup and migration

On startup the service:

1. Creates any missing tables and columns.
2. Creates the initial school row if no school exists.
3. Adds `schoolId` to existing operational rows that do not yet have one, assigning them to the initial school.
4. Provisions the indexes used by school-scoped queries.
5. Starts the HTTP server only after schema and index setup completes.

The migration is additive and does not delete existing records. Do not manually delete the `schools` table or `schoolId` columns.

## School onboarding

1. Set `PLATFORM_ADMIN_EMAILS` to the email address of the trusted platform operator account.
2. Sign in with that account.
3. Open `/platform/schools.html`.
4. Create a school and its first teacher account.
5. Give the initial teacher credentials to the school's authorized contact through a secure channel. Do not send passwords in plain email.

Each school receives a separate `schoolId`. Staff members created by a teacher belong to that teacher's school. School status can be suspended or reactivated from the platform console.

The school login URL is `https://your-domain.example/<slug>/login`, for example
`https://your-domain.example/teiki-test/login`. The login page sends the slug to
the server during account verification; the server rejects a user whose stored
school does not match the requested school URL. The school ID stored on the
authenticated profile remains the authority for all subsequent tenant-scoped API
requests.

## Storage and privacy requirements

- Keep the Appwrite Storage bucket private.
- Keep file-level permissions enabled; do not make the bucket public.
- PDF access must go through the authenticated application API.
- The answer PDF endpoint is teacher-only.
- A student must have an assignment whose release status is not locked before the base PDF can be fetched.
- Keep Appwrite API keys and initial account passwords out of logs and client-side code.

## Release gates before accepting paying schools

The repository changes are not a substitute for a production acceptance test. Before selling or onboarding real student data, complete all of the following:

- Verify Render deployment and `/api/health` after setting the required environment variables and Appwrite scopes.
- Test two separate school tenants with different teachers and students. Confirm cross-school reads, writes, PDF access, live streams, and grading are denied.
- Test the full workflow: create account → create class → enroll student → upload PDF → distribute → draw → autosave → submit → live review → grade → return/pass.
- Test scheduled release, locked PDF direct access, expired JWT, suspended user, and suspended school.
- Verify backup and restore for TablesDB and Storage files.
- Run load tests using realistic class sizes and concurrent PDF uploads.
- Configure a production domain, HTTPS, uptime monitoring, error alerting, and an incident contact.
- Publish privacy policy, terms of service, data-processing terms, retention/deletion policy, and school contract.
- Decide support hours, service availability target, billing, cancellation, and data export procedures.

A successful syntax check does not prove that the live service, Appwrite permissions, storage, migration, or tenant isolation work in production. Do not advertise the service as production-certified until the release gates above pass.
