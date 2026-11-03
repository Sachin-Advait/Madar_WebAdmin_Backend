> **Version 4.0** adds adaptive TV layouts, contextual banners, resume playback, device recommendations and safe headend imports. Start with the [complete developer feature specification](docs/FEATURE_SPEC_V4.md) and [release acceptance checklist](docs/RELEASE_ACCEPTANCE_V4.md).

# MADAR · Experience Studio 4.0

**Start here:** [Full developer handover and package map](START_HERE.md).

A React admin, Node.js/Express API, PostgreSQL schema, native Flutter Android TV/touch app, and browser reference TV player. TV users browse, play media and save device favourites; content authoring stays in admin.

**Included:** a bronze Control Room dashboard, nine master-data lists, five reports with CSV export, 14 page layouts × five profiles, 20 approved widgets, drag-and-drop page and KPI builders, 14 dynamic content collections, additional field designer, JSON bulk import, artwork/document/media uploads, 145 published sample records, pairing, scheduling, review/publication/rollback, roles, audit, Redis delivery, checksummed offline cache, favourites, and the six TV destinations with eight Info Hub sections.

Start with [Admin / React guide](docs/ADMIN_GUIDE.md), [Backend guide](docs/BACKEND_GUIDE.md), [Flutter guide](docs/FLUTTER_GUIDE.md), and [production acceptance](docs/PRODUCTION_READINESS.md). The full source includes the Android project and lockfile; a signed APK and physical-device acceptance are separate release steps.

**Stack:** React 19 + TypeScript + Vite; Express 5 on Node 24; PostgreSQL in production; Redis Streams consumer groups for per-TV acknowledged delivery, plus Socket.IO notifications and shared rate limits. PostgreSQL owns releases, the transactional outbox and the permanent acknowledgement ledger. PGlite runs the development/demo PostgreSQL engine without a separate installation. ClamAV scans production uploads; Caddy provides TLS in the deployment recipe.

## Start the complete local application

Requires Node.js 24, npm and Redis 6.2+ (the supplied deployment uses Redis 8). Set REDIS_URL in .env. To start local Redis with Docker:

```sh
docker run -d --name madar-redis-dev -p 127.0.0.1:6379:6379 -v madar_redis_dev:/data redis:8-alpine redis-server --appendonly yes --maxmemory-policy noeviction
```

From this directory:

```sh
npm ci
npm run build
```

Copy `.env.example` to `.env`, then:

```sh
node --env-file=.env services/api/src/server.mjs
```

Open `http://127.0.0.1:8000`. Local demo credentials: **admin@madar.local / MadarDemo!2026#**. These credentials only bootstrap an empty database in development. Do not use them in production.

Open `http://127.0.0.1:8000/tv` in another tab. Click **Connect sample lobby screen**, or request a new pairing code and approve it from **Screens & Devices**. Publish a Public profile layout or theme, then inspect **Screen Delivery** for Received → Downloaded → Applied. The command-line simulator stops at Downloaded because it has no renderer.

Removing REDIS_URL is allowed for a development SQL-only demo; production requires Redis. Health reports the delivery mode. Redis messages stay pending through Received and Downloaded and are acknowledged after Applied commits to PostgreSQL. See [Redis delivery and recovery](docs/REDIS_STREAMS.md).

For hot reload, start the API above and run `npm run dev -w apps/admin`. Vite proxies API and WebSocket traffic to port 8000. Set `APP_ORIGIN=http://127.0.0.1:5173` for this development mode if the browser sends an Origin header on writes.

## Offline preview

[demo/MADAR_Offline_Preview.html](demo/MADAR_Offline_Preview.html) is a self-contained interactive review copy with all **38 admin sections**. Use **All sections** at the top, or the menu icon on a narrow screen. Open it in Chrome or Edge. It contains sample content and browser-local editing. It does not connect to real devices or claim update delivery. The ordinary React production build uses the real API; it does not silently fall back to sample data.

## Checks

```sh
npm test
npm run test:admin
# Set TEST_REDIS_URL, then:
npm run test:redis
npm run typecheck
npm run build
npm audit
```

See [the verification report](docs/VERIFICATION.md) for checks actually run and remaining environment-specific checks. **109 automated tests passed**: 48 backend, 15 real Redis, 42 Flutter and 4 React navigation tests. The React production build, TypeScript checks and Dart analysis also passed. A successful build is not physical-TV acceptance. A signed Android build, real media providers, source-system mappings, live PostgreSQL deployment, and physical remote/codec behaviour still need validation in the target environment.

## Native Flutter TV

```sh
cd apps/tv
flutter pub get --enforce-lockfile
flutter test
flutter run --dart-define=MADAR_DEMO=true
```

The explicit sample experience contains the same 145 published records generated from the backend seed. For a connected device, run with `--dart-define=MADAR_API_URL=https://your-madar-origin`, request pairing and approve the displayed code in admin. See the [Flutter guide](docs/FLUTTER_GUIDE.md) for Android setup, remote navigation, favourites, signing and deployment. The package includes native TV review images in `docs/screens/`.

## Documents

- [Start here: complete package and role-based reading order](START_HERE.md)
- [Complete v4 developer feature contract](docs/FEATURE_SPEC_V4.md)
- [Source/headend import contract and examples](docs/SOURCE_CONNECTOR.md)
- [TV screenshot gallery](docs/TV_GALLERY.md)
- [Agreed scope and feature map](docs/FEATURES.md)
- [TV content and field specification](docs/CONTENT_SPEC.md)
- [Developer and deployment guide](docs/DEVELOPER_GUIDE.md)
- [TV API and delivery contract](docs/TV_CONTRACT.md)
- [Redis Streams, recovery and upgrade guide](docs/REDIS_STREAMS.md)
- [Verification report](docs/VERIFICATION.md)
- [Database migration map: all six scripts](START_HERE.md#database-and-upgrades)
- [OpenAPI route and schema reference](docs/openapi.json)

There is no personal PVR or scheduled recording. Replay uses provider-supported catch-up. Built-in sample EPG and operational data are labeled. Native provider adapters and broadcast rights are not implied by a catalogue entry.
