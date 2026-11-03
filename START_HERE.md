# MADAR 4.0 - complete developer handover

This package contains the current React administration app, Express backend, PostgreSQL migrations, Flutter Android TV/touch application, sample data, automated tests, deployment recipes and developer documentation. It includes the repair that keeps all **38 admin sections** accessible in narrow previews.

## Package map

| Location | Contents |
|---|---|
| [PACKAGE_CONTENTS.json](PACKAGE_CONTENTS.json) | Full file inventory with sizes and SHA-256 checksums (the manifest excludes its own checksum) |
| [apps/admin](apps/admin) | React/TypeScript source, API integration, 38 admin destinations, browser TV reference, assets, navigation tests and production `dist` build |
| [services/api](services/api) | Node.js/Express service, authentication, dynamic CMS, masters, reports, delivery worker, media, preferences, source imports and tests |
| [services/api/migrations](services/api/migrations) | Six executable PostgreSQL schema/upgrade scripts |
| [apps/tv](apps/tv) | Flutter source, Android project/Gradle wrapper, pinned dependency lockfile, fonts, demo content and tests |
| [shared/catalog.json](shared/catalog.json) | Stable page/widget catalogue; the server enriches this with current runtime forms and validation |
| [scripts](scripts) | Seed/export tooling, TV and operational simulators, OpenAPI generation and offline preview build |
| [demo/MADAR_Offline_Preview.html](demo/MADAR_Offline_Preview.html) | Self-contained interactive React admin preview with sample data |
| [docs/TV_GALLERY.md](docs/TV_GALLERY.md) | Eleven native Flutter review images, including landscape, portrait and Arabic |
| [compose.yaml](compose.yaml), [Dockerfile](Dockerfile), [infra/Caddyfile](infra/Caddyfile) | PostgreSQL/Redis/ClamAV/Caddy deployment baseline with persistent storage |
| [.github/workflows/ci.yml](.github/workflows/ci.yml) | Backend, Redis, React and Flutter checks, plus configured-runner Android debug build |

Package managers restore external libraries using `package-lock.json` and `apps/tv/pubspec.lock`. Generated dependency directories, local databases/uploads, environment secrets, signing keys and APK/AAB artifacts are intentionally excluded. The source contains no production customer data or usable provider credentials.

## Reading order by developer role

Everyone starts with the [complete feature contract](docs/FEATURE_SPEC_V4.md), then reads the guide for their work.

| Role | Read in this order |
|---|---|
| React/admin | [Admin guide](docs/ADMIN_GUIDE.md), [content fields](docs/CONTENT_SPEC.md), [navigation repair](docs/ADMIN_NAVIGATION_REPAIR.md), [API schemas](docs/openapi.json) |
| Backend/API | [Backend guide](docs/BACKEND_GUIDE.md), [developer architecture/deployment guide](docs/DEVELOPER_GUIDE.md), [TV contract](docs/TV_CONTRACT.md), [Redis delivery semantics](docs/REDIS_STREAMS.md), [OpenAPI](docs/openapi.json) |
| Flutter TV | [Flutter guide](docs/FLUTTER_GUIDE.md), [v4 layout/banner/resume/preferences contract](docs/FEATURE_SPEC_V4.md), [TV API contract](docs/TV_CONTRACT.md), [screenshots](docs/TV_GALLERY.md) |
| Database | [Migration map below](#database-and-upgrades), [data model](docs/BACKEND_GUIDE.md), [upgrade/delivery recovery](docs/REDIS_STREAMS.md) |
| Headend/integrations | [Source connector contract](docs/SOURCE_CONNECTOR.md), [M3U example](docs/examples/source-channels.m3u), [XMLTV example](docs/examples/source-guide.xml), [normalized JSON example](docs/examples/source-catalogue.json) |
| QA/operations | [Executed verification](docs/VERIFICATION.md), [machine-readable results](docs/verification-results.json), [release acceptance](docs/RELEASE_ACCEPTANCE_V4.md), [production checklist](docs/PRODUCTION_READINESS.md), [dependencies](docs/DEPENDENCIES.md) |

The v4 feature contract and actual source/OpenAPI are the current implementation reference. Older retained product concepts do not override these contracts.

## Run the complete web application

Prerequisites: Node.js 24+, npm and a local Redis service for the full delivery path. Flutter and Android prerequisites are separate. From the extracted package root:

```sh
npm ci
npm run build
```

Copy [.env.example](.env.example) to `.env`. Its default settings are development-only and use a persistent PGlite development database when `DATABASE_URL` is absent. Start Redis on the configured `REDIS_URL`, or remove that setting only for a development SQL-only demonstration. Then run:

```sh
node --env-file=.env services/api/src/server.mjs
```

Open `http://127.0.0.1:8000`. Empty development databases bootstrap `admin@madar.local` / `MadarDemo!2026#`; production must use separate organization credentials with demo mode disabled. The browser TV reference is at `http://127.0.0.1:8000/tv`.

For React hot reload, keep the API running and start `npm run dev -w apps/admin` in another terminal. Set `APP_ORIGIN=http://127.0.0.1:5173` for this development origin. For design review without services, open the standalone HTML preview and choose **All sections** or the menu icon.

## Run the Flutter TV app

Install the documented Flutter/Android toolchain, then from the package root:

```sh
cd apps/tv
flutter pub get --enforce-lockfile
flutter analyze
flutter test
flutter run --dart-define=MADAR_DEMO=true
```

For an integrated device use `flutter run --dart-define=MADAR_API_URL=https://your-madar-origin`, request pairing on the TV and approve the displayed code in **Screens & Devices**. The TV must reach that HTTPS origin over its network. Sample source references do not become playable licensed streams until mapped to actual media or replaced with approved uploads.

## Database and upgrades

The API runs numbered migrations on startup and records applied versions. Production uses PostgreSQL; Redis is the delivery worker/cache service, not the durable application database. Back up PostgreSQL and the matching media volume before an upgrade; test on staging first.

| Migration | Purpose |
|---|---|
| [001_initial.sql](services/api/migrations/001_initial.sql) | Initial users, devices, profiles, content, layouts, releases, outbox, ACK and supporting schema |
| [002_redis_delivery_stream.sql](services/api/migrations/002_redis_delivery_stream.sql) | Redis Streams linkage and delivery recovery metadata |
| [003_dynamic_content.sql](services/api/migrations/003_dynamic_content.sql) | Master data, dynamic content fields and device favourites |
| [004_preferences.sql](services/api/migrations/004_preferences.sql) | Device progress, playback sessions and preference reset epochs |
| [005_source_import.sql](services/api/migrations/005_source_import.sql) | Import sources/bindings and immutable server-only media references |
| [006_content_created_at.sql](services/api/migrations/006_content_created_at.sql) | Stable insertion timestamps for Recently added |

Demo seed/export tooling supplies **145 published content records**, nine master lists, five profiles, 70 page layouts and four sample screens. Existing published v3 bundles receive the documented one-time v4 enrichment without publishing their drafts. Keep demo mode off in production.

## Verification commands

From the package root:

```sh
npm run check
# Set TEST_REDIS_URL to an isolated test Redis database, then:
npm run test:redis
```

`npm run check` includes the backend tests, four React navigation tests, TypeScript checking and production build. Flutter analysis/tests run from `apps/tv` as above. The current regression inventory is 48 backend + 15 real Redis + 42 Flutter + 4 React navigation tests (109 total). See [VERIFICATION.md](docs/VERIFICATION.md) for the results actually executed for this delivery. Use a disposable test database/service for failure/recovery tests, never production.

## Release boundaries

This is the complete implemented source handover and a production deployment candidate. Release still requires organization signing and an Android build, physical-TV remote/codec/playback/PDF/standby tests, production PostgreSQL/Redis/ClamAV/TLS configuration, backup/restore and fleet load acceptance.

Headend file imports are implemented; the actual scanner brand/model, enabled API/export formats, licensed stream URLs, authentication/token renewal and any required HTTPS gateway must be supplied and integrated. The package does not include an invented vendor driver, DRM service, personal PVR or automatic transcoding.

Redis processing is durable at-least-once with idempotent application and per-device ACKs. Applied follows verified software rendering and a committed database ACK; it cannot guarantee immediate display on an offline/broken TV or independently prove that the physical panel is on.

Device recommendations use explainable local/server scoring, not a hosted LLM. Public profiles default to history off, and histories/favourites are shared-device state with reset controls. See the v4 feature contract for the exact policies and retention limits.
