> **Version 4.0 supplement:** [Complete developer feature specification](FEATURE_SPEC_V4.md) documents the adaptive layout, banner, source-import and device-preference APIs. [Release acceptance](RELEASE_ACCEPTANCE_V4.md) records remaining deployment and hardware checks.

# Developer guide

## Project layout

```
apps/admin/                 React admin and browser TV reference renderer
apps/tv/                    Native Flutter Android TV/touch app and tests
services/api/src/           Express routes, validation, auth, releases, Redis Streams worker
services/api/migrations/    Executable PostgreSQL migrations 001-006
services/api/tests/         In-process HTTP and persistence tests
shared/catalog.json        Stable page/widget registry recovered from v1
scripts/                   Device/feed simulators and preview builders
infra/Caddyfile             TLS reverse proxy configuration
compose.yaml               Single-node production deployment baseline
docs/                      Scope, content, APIs, delivery and verification
```

The application has no Python runtime dependency. The original Python API is not deployed. The domain layer enriches the shared v1 catalogue with VIP, review workflow, bilingual fields and validation. The running `/api/admin/catalog` endpoint is the authoritative form/widget schema.

## Architecture

React Admin uses authenticated REST calls through TanStack Query. React Hook Form supports device/profile/access forms; RJSF/AJV renders content and widget schemas. dnd-kit handles ordered sections; React Grid Layout handles 12-column KPI positions. HLS.js and native browser audio/video support the reference player.

PostgreSQL stores users, hashed sessions, profiles, draft/published resources, draft/published layouts, immutable layout history, immutable release snapshots, screens, pairing requests, delivery attempts, acknowledgements, schedules, assets, ingestion snapshots and audit events. The release transaction also creates per-device delivery rows. The durable queue therefore survives application or Redis restarts.

Redis is required in production. Redis Streams uses XREADGROUP, XAUTOCLAIM and XACK for per-device delivery. The SQL relay uses FOR UPDATE SKIP LOCKED; PostgreSQL retains the device ACK history and can reconstruct missing Redis work. Redis also supports Socket.IO fan-out and shared rate limits. No BullMQ queue is required. See [Redis Streams delivery](REDIS_STREAMS.md) for acknowledgement timing and recovery.

## Database setup and migrations

For production set `DATABASE_URL`. The API executes numbered idempotent SQL migrations on startup. Migration 002 preserves existing delivery history while adding Redis Streams metadata; migration 003 adds master lists, dynamic field definitions and device favourites. For later releases, add numbered migrations with explicit upgrade/rollback decisions; do not rewrite deployed schema changes blindly. Migration 004 adds device progress, playback sessions and preference-reset epochs; 005 adds stable source-import bindings and server-only media references; 006 preserves content creation timestamps. The migrations table records versions 1 through 6. See the complete migration links in [START_HERE.md](../START_HERE.md).

For a developer machine without PostgreSQL, omit `DATABASE_URL` and use `MADAR_DEMO=1`; PGlite persists beneath `data/dev-postgres`. Only one process should open this development database directory. Production refuses to use this fallback. Tests use a separate in-memory database plus a temporary persistent restart fixture. CI supplies a real PostgreSQL 18 service.

Seed startup creates five profiles and 70 layouts (14 pages × five profiles). Sample content and four sample devices exist only in demo mode. Startup passwords are hashed with scrypt. Device/session secrets are random and stored only as SHA-256 hashes. There is no production default device key.

## Running production

1. Prepare a Linux VM, Docker/Compose, DNS and reachable HTTPS ports. Back up the current application before replacing an existing deployment.
2. Copy `.env.example` to `.env`; set a unique `MADAR_HOST`, `POSTGRES_PASSWORD`, `BOOTSTRAP_EMAIL`, `BOOTSTRAP_PASSWORD` and `INTEGRATION_KEY`. Disable demo mode. Use a URL-safe database password or URL-encode it in a manually supplied database URL.
3. Run `docker compose --env-file .env config`, then `docker compose --env-file .env up -d --build`.
4. Caddy obtains a certificate for the configured domain. For an internal-only domain, use your organization's TLS termination/certificates and adjust the proxy configuration. Do not bypass certificate verification.
5. Wait for PostgreSQL and Redis readiness. ClamAV needs its signature database; uploads fail closed until scanning works. Allow outbound access for signature updates, or manage definitions through your approved internal process.
6. Verify `/api/health`, sign in, create a real screen pairing, publish a small release and verify Applied on the device. Test offline reconnection, backup restore, security controls and expected screen count before rollout.

The Compose recipe is a single API-node baseline. Keep `media_data` and `postgres_data` persistent. To scale API replicas across hosts, provide shared or object storage for assets, use Redis fan-out, restrict proxy trust to the actual hop topology, and load-test connections. S3/MinIO adapters are not implemented in this revision. No HA/failover claim is made for this Compose recipe.

Production `APP_ORIGIN` must match the public HTTPS origin. Secure, HttpOnly, SameSite=Strict cookies carry 8-hour admin sessions. State-changing admin requests send `X-Madar-Request: 1`; Origin is checked when provided. The API serves the production React build, avoiding an unnecessary cross-origin deployment.

## Assets and media

Uploads use generated IDs, magic-byte checks, size limits, SHA-256 and normalized WebP artwork. Assets are accessible only to an authenticated admin or a device whose current desired release references the asset. `CLAMAV_HOST` enables INSTREAM scanning through ClamAV; `ASSET_SCANNER` optionally specifies a trusted local clamscan executable. A production document/video/audio upload is rejected if neither scanner is configured.

MP4/MP3 uploads can be referenced by `/api/assets/ID` in videoRef/stationRef. The playback endpoint issues a four-hour opaque ticket and serves byte ranges through `/api/media/TOKEN`. Every media request checks that the device is enabled and that its current release still includes the asset. External provider references resolve through server-only `MEDIA_SOURCES_JSON`; provider URLs must use HTTPS. Real signed provider URLs, DRM, DRM renewal and adaptive transcoding require the selected provider adapter.

For example (server environment, not frontend settings):

```json
{"LOCAL-01":"https://approved-provider.example/live/channel1.m3u8"}
```

No provider credentials or stream references are included in release JSON. The browser reference player requires appropriate provider CORS support. A source that is not configured returns 503 and an explicit Unconnected message.

## Meeting and queue integration

Set `INTEGRATION_KEY` to a random secret. Source adapters POST normalized JSON to `/api/integrations/meeting/snapshot` or `/api/integrations/queue/snapshot` with `Authorization: Bearer KEY`. Valid fields and example payloads are in `scripts/simulate-operations.mjs`. Run the simulator with `MADAR_URL` and `INTEGRATION_KEY` environment variables.

The included transport is authenticated snapshot ingestion, not a generic arbitrary-URL fetcher. Source-specific authentication, field mapping, business definitions and network access are required from the actual meeting and queue systems. Update at least every 30 seconds for normal live behavior. Data is marked stale after 90 seconds. Public, VIP and signage viewers receive redacted meeting subjects. Never send personal identity data in public queue tickets.

## TV and Flutter handover

`/tv` is a runnable browser reference. `apps/tv` now supplies the native Flutter client with all 20 registered widgets, six destinations, eight Info Hub sections, touch/remote focus, device favourites, secure credential storage, verified offline assets and staged acknowledgements. Read [FLUTTER_GUIDE.md](FLUTTER_GUIDE.md) for setup and signing. A new executable widget type still requires matching Flutter and browser renderer code. Changing supported widget order/settings/theme or content fields does not require a new app build.

The web player uses IndexedDB for one active release and referenced blobs, and a service worker for the application shell. Maximum release asset cache is 300 MB. Last verified content is retained offline for up to 24 hours; sensitive deployments should choose a shorter policy. An online revoked device clears its cache. An offline device cannot be remotely revoked immediately. Offline scheduled page switching is not implemented; the last server-selected opening page is retained. Browser cache eviction/storage quota and native TV platform behavior must be tested on hardware.

## Administration and extension

- Admin: accounts, devices, profiles, publication, rollback, all content and audit.
- Editor: content and layout drafts, submit content for review; cannot publish or manage device trust.
- Viewer: read-only admin views. Device API access is separate from admin login.
- Content deletion is administrator-only and rejects known cross-record references. Disabling content is preferred when history matters.
- Add page/widget definitions through the shared catalogue and domain enrichment. Both frontend and backend use the same schema; backend page allowlists remain authoritative.
- The browser TV details use plain text. Do not introduce HTML execution in CMS fields.

## Operations

`/api/health` checks database availability and reports Redis configuration. Structured logs avoid credentials. The Redis Streams worker retries at 5, 10, 20, 40, 80, 160 and then 300-second intervals until Applied or superseded. XACK follows the committed TV Applied acknowledgement; cancellations are retired separately. Check Screen Delivery for failures, old heartbeats or many attempts. Retry requests advance the next attempt; they do not fabricate acknowledgements.

Back up PostgreSQL using your supported PostgreSQL tooling and retain asset volumes alongside database snapshots. Restore into a separate environment and verify asset digest consistency before switching traffic. Backups, retention schedules, external monitoring and restore drills are operational responsibilities; they are not automatically configured by the application.

Audit rows are append-only through application routes. Configure database permissions and retention externally for stronger tamper resistance. Establish cleanup for expired sessions, enrollment records and media tickets, plus retention for superseded releases/acknowledgements. Do not delete a release still referenced by a device.

## Test and preview tooling

The backend tests use `light-my-request` to exercise actual Express routes without opening test sockets. PGlite executes PostgreSQL SQL semantics locally; a CI workflow supplies a PostgreSQL service. Authentication, authorization, dynamic field validation, master references, import atomicity, reports, favourites and delivery transitions are asserted. A separate restart test confirms durable pending delivery recovery and upgrade from the original schema. Run `npm run test:redis` with `TEST_REDIS_URL` for 15 real Redis integration cases; `TEST_DATABASE_URL` optionally selects isolated PostgreSQL schemas. The current suite inventory is 48 backend tests, 15 real Redis integration cases, 42 Flutter tests and 4 React navigation tests. The navigation tests render the real links and section selector and validate all 38 routes. Run `npm run test:admin` from the repository root. Counts and executed outcomes for the delivered package are recorded in the verification report. See [VERIFICATION.md](VERIFICATION.md) for the executed results and remaining acceptance work.

`scripts/export-showcase.mjs` produces sample-only data from a fresh development database. `VITE_SHOWCASE=1` builds the browser-local review experience. Production builds without this variable use the real API. The showcase explicitly labels browser-local changes and never reports a device Applied acknowledgement.
