> **Version 4.0 supplement:** [Complete developer feature specification](FEATURE_SPEC_V4.md) documents the adaptive layout, banner, source-import and device-preference APIs. [Release acceptance](RELEASE_ACCEPTANCE_V4.md) records remaining deployment and hardware checks.

# MADAR 4.0 · Backend and data developer guide

Keep **PostgreSQL** as the durable system of record. Use **Redis Streams** for dispatch/recovery and Redis for Socket.IO coordination/rate limits. Redis Pub/Sub alone is not the delivery guarantee. Content, releases, per-screen delivery state and acknowledgements survive Redis loss in PostgreSQL; the stream can be reconstructed from the SQL outbox. See `REDIS_STREAMS.md` for worker recovery and operational commands.

## Local development

```sh
npm ci
# Copy .env.example to .env and use development-only values.
# Start a local Redis service, or omit REDIS_URL for SQL-only development dispatch.
node --env-file=.env services/api/src/server.mjs
```

Node 24+ serves admin/API on port 8000. Without `DATABASE_URL`, development uses PGlite, a PostgreSQL-compatible embedded engine, in `data/dev-postgres`. Production requires real PostgreSQL, HTTPS `APP_ORIGIN`, `REDIS_URL`, and demo mode off. The compose configuration includes PostgreSQL, persistent Redis, ClamAV and Caddy. Supply organization credentials/secrets and a real hostname before deployment. Do not expose PostgreSQL or Redis publicly.

Database migrations 001-006 execute in numbered order at startup. Migrations 004-006 add device playback preferences, headend import bindings and stable content creation times; the [complete migration map](../START_HERE.md#database-and-upgrades) links every script. Migration 003 adds `content_types`, `masters`, and `favourites`; it does not replace existing content or profiles. Existing deployment files and uploaded assets must be backed up before an upgrade. Demo mode inserts additional sample records with stable IDs and does not overwrite an existing record. Do not enable demo mode on a production database. Existing profile themes remain operator managed; change their accent to #6B5837 in Admin if upgrading an older default.

## Data model

| Tables | Purpose |
|---|---|
| users / sessions | Role-based admin access and hashed, expiring sessions |
| profiles / layouts / layout_versions | Audience/theme permissions, draft/published page layouts and version history |
| resources | Kind + ID, draft, approved snapshot, revision; all 14 content collections |
| content_types | Typed additional field definitions and optimistic revision |
| masters | Nine managed lists, JSON payload and optimistic revision |
| screens / enrollments | Approved device credentials, profile/page assignment, heartbeat and enrollment proof |
| releases | Immutable exact JSON text, SHA-256 digest and profile version |
| deliveries / acknowledgements | Per-device outbox, staged ACKs, retry state and Redis entry linkage |
| favourites | Per-screen content references; unique adds and idempotent removal |
| device_progress / playback_sessions | Revision-bound resume checkpoints, ordered sessions and bounded retention; screens.preferences_epoch prevents stale reset writes |
| source_imports / source_bindings / source_media | Stable import identities, last-imported values and immutable server-only media references |
| schedules | Timezone-aware screen/group page schedules |
| assets / media_tickets | Normalized/scanned uploads, digests and authenticated playback tickets |
| integrations | Latest authenticated external meeting/queue snapshots |
| audit / settings | Operator changes and platform settings |

Resources store structured, validated JSON, not HTML or executable code. Built-in schemas are enriched in `domain.mjs`; persisted additional fields are merged by `cms.mjs`. `cms-routes.mjs` exposes fields, masters, bulk import and favourites. `managed-operations.mjs` derives room/queue boards from managed content when no external snapshot exists. External snapshots take precedence and are marked stale after 90 seconds.

## APIs and integration

`openapi.json` inventories all Express API paths, security schemes, key request contracts and built-in schemas. Runtime JSON Schema from `/api/admin/catalog` is authoritative for dynamically added fields. Use the supplied schemas rather than inventing field names.

| Area | Endpoints |
|---|---|
| Admin session | POST `/api/auth/login`, POST `/api/auth/logout`, GET `/api/admin/me` |
| Dynamic forms | GET `/api/admin/catalog`, GET `/api/admin/content-types`, PUT `/api/admin/content-types/:kind` |
| Content | GET/POST `/api/admin/resources/:kind`, PUT/DELETE `/:id`, POST `/api/admin/resources/:kind/import` |
| Masters | GET/POST `/api/admin/masters/:kind`, PUT/DELETE `/:id` |
| Layouts | Read/save, publish, versions and rollback under `/api/admin/layouts/:page` |
| Management | Profiles, screens, pairing approvals, schedules, users, assets, audit, settings and integrations under `/api/admin/` |
| Reports | GET `/api/admin/reports/summary`, GET `/api/admin/reports/:report` with UTC dates, search, status, optional profile and CSV format |
| TV pairing | POST `/api/app/enroll`, GET `/api/app/enroll/:id` with enrollment proof |
| TV delivery | GET `/api/app/config`, GET `/api/app/sync`, POST `/api/app/ack`, POST `/api/app/heartbeat` |
| TV information | GET `/api/app/catalog`, GET `/api/app/content/:kind`, GET `/api/app/pages/:page`, GET `/api/app/operations` |
| TV favourites | GET `/api/app/favourites`, PUT/DELETE `/api/app/favourites/:kind/:id` |
| TV media | GET `/api/app/playback/:kind/:id`; uploaded media is served through short-lived tickets |
| TV preferences | GET/DELETE `/api/app/preferences`, POST `/api/app/playback-sessions`, PUT `/api/app/playback-sessions/:sessionId`, GET `/api/app/recommendations`; see the v4 contract for required reset epochs |
| Admin preferences | DELETE `/api/admin/screens/:id/preferences`, GET `/api/admin/recommendation-summary` |
| Headend imports | POST `/api/admin/source-import/preview`, POST `/api/admin/source-import/apply`; accepted formats and digest guards are in SOURCE_CONNECTOR.md |
| External feeds | POST `/api/integrations/meeting/snapshot` and `/api/integrations/queue/snapshot`, authenticated with `INTEGRATION_KEY` |

Admin cookie mutations send `X-Madar-Request: 1` and a trusted Origin. Device requests send `X-Screen-Key`. Credentials must never appear in query strings, logs or QR codes. Native clients should refuse redirects on credential-bearing API requests. Editor/admin/viewer roles are enforced server-side, including report restrictions. Use `expectedRevision` for content, schema, master and layout updates; reload on HTTP 409.

Media reference keys resolve through server-only `MEDIA_SOURCES_JSON`. Production channel/video/radio/Catch-Up streams need your actual provider URLs and credentials. Programme Guide is a managed content collection, so administrators or an integration using authorized admin APIs can fill it. A provider-specific EPG/DRM/Catch-Up protocol adapter is not fabricated without provider specifications. Uploaded MP4/MP3 content works through the same playback API.

## Delivery semantics

Publishing commits the content/release and SQL per-screen outbox together. A worker `XADD`s deliveries, reads them using `XREADGROUP`, and reclaims abandoned work with `XAUTOCLAIM`. Received/Downloaded/Failed retain pending Redis state. After a valid Applied ACK is durably stored, the worker retires the matching Redis entry. Disabled/superseded deliveries are cancelled without claiming Applied. Duplicate retries are expected and handled idempotently. A powered-off or disconnected TV applies the newest still-assigned release after it reconnects; instantaneous physical-screen delivery cannot be guaranteed during outages.

The browser reference TV also supports websocket hints. The Flutter app uses a 10-second authenticated polling loop, staged verification and the same ACK API. Redis acknowledgement is a worker concern; TVs never connect directly to Redis. The dashboard's sync counts come from SQL confirmed releases, not notification emission.

## Verification and deployment acceptance

Run `npm run check`, then `npm run test:redis` with `TEST_REDIS_URL` pointing at an isolated test Redis database. Never point failure/recovery tests at a production Redis service. Flutter tests and analysis are documented separately. CI includes PostgreSQL/Redis services and a Flutter Android debug build job.

Before operating real screens, complete the remaining acceptance work in `PRODUCTION_READINESS.md`: signed native build, target-device playback/remote checks, actual PostgreSQL/Redis deployment, backups/restore, provider integrations, monitoring, limits and desired authentication policy. Local media storage is a persistent-volume baseline; multi-host API scaling requires shared/object media storage and equivalent authenticated asset delivery. Do not assume local disk uploads are shared across replicas.

Authenticated TV requests have a separate per-screen quota (default `DEVICE_RATE_LIMIT=180` per minute), so multiple TVs behind the same router do not share the general IP allowance. `API_RATE_LIMIT=600` controls other API traffic. Failed device authentication remains rate-limited by IP. Review limits during the real fleet load test.

## SpaceHub and ServeIQ (Info Hub meeting rooms and queues)

Admin > Integrations has a panel for each. When a connector is turned on, `/api/app/operations` serves its data as `meeting` (SpaceHub) or `queue` (ServeIQ), ahead of pushed snapshots, managed records and sample data. MADAR TVs need no extra configuration.

- **SpaceHub**: enter the API address (for example `https://host/spacehub/api`) and a SpaceHub user with the `DISPLAY` role. MADAR logs in with `POST /auth/login`, keeps the token until shortly before it expires (logging in again on 401/403), and reads `GET /tv-display`. Rooms carry `current` and `next` meetings; upcoming bookings fill `schedule`. Public, VIP and Signage screens see meeting titles as "Reserved". The password is never returned by the admin API; `SPACEHUB_PASSWORD` can supply it instead.
- **ServeIQ**: enter the API address (for example `https://host/serveiq/api`) and the branch ID. MADAR reads the public `GET /tv-display/branch/{branchId}`: latest calls become `calls`, counter tiles become `counters` (`CALLING`/`SERVING` → `serving`, `IDLE` → `available`, `PAUSED` → `paused`, `CLOSED` → `closed`), plus `waiting` and `servedToday`.

Both are cached for 15 seconds. If a source fails, the last good data stays on screen for 90 seconds marked `stale`, then the TV shows its no-data message. Implementation and field mapping: `services/api/src/display-connectors.mjs`.
