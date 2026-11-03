# Verification — MADAR 4.0

Verified locally on **3 November 2026** with Node.js 24.20.0, Flutter 3.47.9 and Dart 3.13.7 on Windows. This is tested source and a production deployment candidate; it is not a signed Android release or a completed production deployment.

| Executed check | Result |
|---|---|
| Express API, CMS, permissions, persistence, upgrade, preferences and source imports | **48 passed**, zero failed or skipped |
| Real Redis 8.10.3 Streams integration | **15 passed**, zero failed or skipped |
| Flutter protocol, controller, adaptive layouts, playback state and profile staging | **42 passed**, zero failed or skipped |
| React admin navigation, route validation and rendered section links | **4 passed**, zero failed or skipped |
| Automated regression total | **109 passed** |
| Additional native screenshot renderer | Passed; **11** landscape/portrait/Arabic images generated and visually reviewed |
| Dart analysis | No issues found |
| TypeScript strict checking and React/Vite production build | Passed; 21 shell assets precached |
| JavaScript dependency audit | Zero known advisories reported on 3 November 2026 |
| Standalone offline admin | Rebuilt; embedded JavaScript syntax/assets verified |
| Offline adapter smoke checks | Masters, reports, profile policies, summary and honest backend-only imports/resets passed |
| API and demo inventory | OpenAPI 62 paths; 145 published sample records; 9 master lists; 38 admin destinations |

## Scope of the tests

Backend coverage includes authentication/roles/CSRF, draft/publication separation, custom fields and master references, device approval/revocation, ordered checksum ACKs, asset normalization/scope, report filters and CSV safety, schedules, feed privacy, per-device rate limits, restart persistence, and one-time v3-to-v4 publication upgrades without publishing drafts. New coverage includes reset epochs, session ordering, duplicate checkpoints, stale retries, per-device recommendations, cold start, retention, rejected sources, safe M3U/XMLTV/JSON parsing, import idempotence and preserved operator overrides. Restricted pages are excluded from released content and asset manifests.

The Redis tests use a real local server, not a mocked command implementation. They exercise independent per-TV pending work, Received/Downloaded/Failed remaining pending, SQL Applied before XACK, worker reclaim, duplicate crash boundaries, Redis loss/reconciliation, supersession, revocation, pagination fairness and malformed-message quarantine.

Flutter coverage comprises 6 protocol tests, 5 controller tests, 4 existing experience tests, 8 adaptive tests, 18 playback tests and 1 profile-staging test. It exercises portrait/landscape and RTL, direct Info Hub panels, contextual banners, long text sizing, D-pad selection/favourites, policy-aware resume, Start over, three-second rewind, completion, local retention, stale sessions, concurrent/reset/identity races, offline continuity, Retry/Back and immediate hiding of old-audience content while a replacement is downloading.

Player state and error controls are tested without a real Android video decoder. A successful widget test does not certify hardware playback. The screenshot renderer loads actual project fonts, artwork and widgets with clearly labelled sample data. It is separate from the 109 regression tests.

## Not executed in this environment

- Android release APK/AAB signing, Android native plugins/PDF bridge, physical-TV codecs, remote firmware, touch hardware and standby/reboot behavior.
- Production PostgreSQL service, the complete Compose deployment, cross-host sockets/storage, load tests, backup restore and failover drills. Local SQL tests use PGlite; supplied CI supports real PostgreSQL/Redis but that hosted workflow was not run here.
- Full browser form, upload and drag-and-drop acceptance on the target browser fleet. The actual embedded preview navigation was verified separately: all 38 destinations opened, and a 540px viewport preserved the selector and working menu drawer, including link selection, Escape and focus restoration.
- The actual Chinese headend/scanner, vendor API authentication/polling/token renewal, licensed streams, DRM and provider-specific Catch-Up. File-import connectors and sample exports are implemented; actual model/API details are still needed.

Vite reports a large media-player chunk warning; the build succeeds. No performance certification is implied.

## Reproduce

~~~sh
npm ci
npm run check
# Use a dedicated Redis service/database:
npm run test:redis
npm audit
cd apps/tv
flutter pub get --enforce-lockfile
flutter analyze
flutter test
flutter test test/render_screens.dart --update-goldens
~~~

Set TEST_REDIS_URL before Redis tests; they fail rather than silently skip when it is missing. Use TEST_DATABASE_URL for the supplied real PostgreSQL Redis-test fixture. See [complete developer specification](FEATURE_SPEC_V4.md), [acceptance scenarios](RELEASE_ACCEPTANCE_V4.md), [production checklist](PRODUCTION_READINESS.md), and [TV review gallery](TV_GALLERY.md).

## Full handover recheck

All 109 regression tests above were rerun successfully on 3 November 2026, together with TypeScript checking, the production build and Dart analysis. The current package includes the responsive navigation repair and standalone preview. The separate screenshot-rendering, dependency-audit and browser navigation checks were completed earlier the same day and retained because their inputs did not change. The archive audit verified required runtime files, all six migrations, API route coverage, assets, documentation links and CRC integrity. See [ADMIN_NAVIGATION_REPAIR.md](ADMIN_NAVIGATION_REPAIR.md) and [START_HERE.md](../START_HERE.md).
