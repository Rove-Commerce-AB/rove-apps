## Rove Apps (this repo)

Planner, Time report, and Insights are apps inside Rove Apps.

- **Platform:** Next.js app hosted on Google Cloud Run.
- **Database:** PostgreSQL on Google Cloud SQL. Set `CLOUD_SQL_URL` in `.env.local` (see `src/lib/cloudSqlPool.ts`). Schema notes: [`doc/DATABASE.md`](doc/DATABASE.md).
- **Auth:** Auth.js with Google (staff) and email/password for `customer` users; app users in PostgreSQL (`app_users`). Architecture: [`doc/PROJECT_RULES.md`](doc/PROJECT_RULES.md).
  - Customer passwords: admin generates a temporary password (shown once); customer must change it on first login. Migration: `scripts/20261015_customer_passwords.sql`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Database Connection Modes

- **Cloud Run (production):** use Cloud SQL unix socket
  - `postgresql://USER:PASSWORD@/postgres?host=/cloudsql/PROJECT:REGION:INSTANCE`
- **Local dev against Cloud SQL public IP:** use TCP URL
  - `postgresql://USER:PASSWORD@HOST/postgres?sslmode=require`
- Production enforces unix socket by default. If you need to bypass temporarily, set:
  - `CLOUD_SQL_ENFORCE_UNIX_SOCKET=false`

### Optional Cloud SQL pool tuning env vars

- `CLOUD_SQL_POOL_MAX` (default in production: `5`)
- `CLOUD_SQL_IDLE_TIMEOUT_MS` (default in production: `20000`)
- `CLOUD_SQL_CONNECTION_TIMEOUT_MS` (default in production: `15000`)
- `CLOUD_SQL_ACQUIRE_TIMEOUT_MS` (default: `20000`) — max wait for a free connection from the pool; logs `waitingCount` on timeout
- `CLOUD_SQL_STATEMENT_TIMEOUT_MS` (default: `30000`) - max PostgreSQL statement runtime
- `CLOUD_SQL_LOCK_TIMEOUT_MS` (default: `5000`) - max wait for PostgreSQL locks
- `CLOUD_SQL_IDLE_IN_TRANSACTION_TIMEOUT_MS` (default: `30000`) - max idle time while a transaction is open
- `CLOUD_SQL_QUERY_TIMEOUT_MS` (default: `35000`) - client-side pg query read timeout
- `CLOUD_SQL_KEEP_ALIVE` (default: `true`)
- `CLOUD_SQL_KEEP_ALIVE_INITIAL_DELAY_MS` (default: `10000`)
- `APP_DEBUG_LOGS=1` - log pool stats, transaction timing, retries, and timeout labels (temporary debugging only)
- `AUTH_DB_REFRESH_MS` — optional interval to refresh `app_users` from DB in prod (e.g. `1800000` = 30 min)

Rule of thumb: `CLOUD_SQL_POOL_MAX × Cloud Run max instances` should stay **below** Cloud SQL `max_connections` with headroom (~10).

### Health check (Cloud Run liveness)

`GET /api/health` runs `SELECT 1` with a 3s timeout. Returns `200` when the database is reachable, `503` otherwise.

Configure Cloud Run **liveness probe** to this path so unhealthy instances restart instead of requiring a manual daily restart.

### Diagnostic health endpoints

Keep `/api/health` as the Cloud Run probe. Use these manually during incidents:

- `GET /api/health/runtime` - process uptime and memory; does not touch the database.
- `GET /api/health/pool` - Cloud SQL pool counts and safe timeout/pool config; does not run SQL.
- `GET /api/health/db` - timed `SELECT 1`, with before/after pool counts and timeout classification.
- `GET /api/health/db/activity` - `pg_stat_activity` summary using a separate one-off diagnostic DB connection, so it can still work when this instance's app pool is saturated. It reports active sessions, lock waits, idle-in-transaction sessions, and longest transaction/query age. It does not return SQL text. If Cloud SQL is out of connection slots globally, this endpoint can still fail.

In production, detailed endpoints require `HEALTHCHECK_DIAGNOSTICS_TOKEN`. Send it as either:

```bash
curl -H "x-health-token: $HEALTHCHECK_DIAGNOSTICS_TOKEN" https://<service>/api/health/pool
curl -H "Authorization: Bearer $HEALTHCHECK_DIAGNOSTICS_TOKEN" https://<service>/api/health/db/activity
```

### Litium version ingest

Nightly job endpoint. Set `LITIUM_VERSION_API_KEY` in the environment. Customers must already have a 6-character `subscription_id` in Planner.

`POST /api/customers/litiumversion`

```bash
curl -X POST https://<service>/api/customers/litiumversion \
  -H "Authorization: Bearer $LITIUM_VERSION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"subscriptionId":"ABC123","version":"8.15.2"}]'
```

The API key may also be sent as `x-api-key`. Unknown `subscriptionId` values are returned in `notFound` and are not created.

### Recommended Cloud Run settings (production)

| Setting | Typical today | Recommended | Why |
|---------|---------------|-------------|-----|
| Concurrent requests / instance | 8 | **2–3** | Fewer parallel DB work per instance |
| `CLOUD_SQL_POOL_MAX` | 10 | **5** | Limits connections per instance |
| Max instances | 10 | **3–5** | Caps total pool × instances |
| Request timeout | 900 s | **600 s** | Insights (Data Agent) needs several minutes for heavy questions; shorter values cause `upstream request timeout` |
| `APP_DEBUG_LOGS` | 1 | **0** in prod | Less noise after debugging |

Insights timeout: the app aborts Data Agent calls after `DATA_AGENT_TIMEOUT_MS` (default **600000** = 10 min). Cloud Run **request timeout must be ≥ that value**, otherwise heavy questions fail with a 504 / upstream timeout even though the agent is still working.

```bash
gcloud run services update rove-portal \
  --region=europe-west1 \
  --project=rove-portalstudio \
  --timeout=600
```

After deploy, watch **PostgreSQL Connections** in GCP (target &lt; ~15 under normal load with the above).

See also [`doc/PERFORMANCE_REGRESSION_BASELINE.md`](doc/PERFORMANCE_REGRESSION_BASELINE.md) and [`doc/PERFORMANCE_VERIFY.md`](doc/PERFORMANCE_VERIFY.md).

You can start editing the page by modifying `src/app/(app)/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
