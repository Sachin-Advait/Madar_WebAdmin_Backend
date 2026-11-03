> Version4 scenarios and team sign-off: [RELEASE_ACCEPTANCE_V4.md](RELEASE_ACCEPTANCE_V4.md). Complete implementation/API guide: [FEATURE_SPEC_V4.md](FEATURE_SPEC_V4.md).

# Production acceptance — MADAR 4.0

The admin, APIs, schema and native TV source are implemented and have the local verification recorded in [VERIFICATION.md](VERIFICATION.md). Production release still requires the checks below against the intended infrastructure and TV models. No deployment, store publication or signed APK is included in this handover.

| Area | Implemented | Acceptance before rollout |
|---|---|---|
| Database | PostgreSQL migrations 001–003, revision guards, immutable releases and durable outbox | Run migrations on a restored staging copy; validate backups/restore, sizing and PostgreSQL service behaviour |
| Delivery | Redis Streams consumer groups, retries, reclaim, SQL reconciliation and render-dependent Applied | Test loss of connectivity, worker/API restart, storage failure, Redis loss and recovery with real devices |
| Admin | Nine masters, content field designer, 14 collections, layouts, devices, profiles, schedules, accounts, audit, dashboard and reports | Browser visual/accessibility review on desktop/tablet; exercise drag/drop/resize, uploads, review and publication |
| Native TV | Adaptive portrait/landscape navigation, media banners, session/device resume, explainable recommendations, Flutter pages/widgets, secure pairing, touch/remote controls, favourites, bounded verified cache, media/PDF controls | Build Android with the supported SDK/Java; test target TV hardware, focus/back, codecs, PDF, power/resume and RTL |
| Android signing | Environment-based organization signing configuration | Set application ID and keystore credentials; produce, install and verify the signed release artifact |
| Media | Uploaded MP4/MP3/PDF and server-mapped HTTPS sources | Configure licensed real streams; test CORS for browser playback, audio/video formats, token renewal and Catch-Up mappings |
| Operations | Admin-managed meetings/queues and authenticated external snapshots | Agree source fields, daily-count semantics and refresh intervals; test redaction and stale-data behaviour |
| Security | Roles, hashed credentials, cookie protections, validation, rate limits, trusted asset paths, upload scanner hooks | Configure TLS, proxy trust, strong bootstrap credentials and ClamAV; verify scanning fails closed and production has no demo keys |
| Scale | Per-device quotas, Redis fan-out, transactional retries and bounded downloads | Load-test the actual fleet, release/asset size, shared NAT, reconnect storms and reporting volume |
| Recovery | PostgreSQL source of truth and verified last-good client release | Perform a full database + asset restore drill; monitor old ACKs, offline TVs, disk capacity and failed uploads |

## Deployment sequence

1. Run the supplied CI workflow. Resolve any real PostgreSQL/Android build differences before deployment.
2. Configure `DATABASE_URL`, `REDIS_URL`, HTTPS `APP_ORIGIN`, bootstrap administrator credentials, upload scanning and persistent storage. Keep `MADAR_DEMO=0`. Restrict database/Redis network access to application services.
3. Review `docker compose --env-file .env config`, deploy the staging environment and wait for healthy database, Redis, scanner and API services.
4. Create actual masters, upload approved content, configure profiles, then pair a small representative set of TVs. Confirm code verification and wrong-profile denial.
5. Publish content, theme and layout changes separately. Verify Received, Downloaded and Applied for each screen; interrupt power/network at each stage and verify recovery without a false Applied result.
6. Exercise uploaded files and real provider sources, remote and touch navigation, Arabic text, favourites, disabled/revoked devices and offline expiry. Verify real TVs behind the same router remain independently rate-limited.
7. Validate monitoring, backup restoration, credentials/keystore ownership and rollback procedures. Expand the fleet only after the staging results meet your acceptance criteria.

## Explicit operational limits

- Delivery is persistent **at-least-once** processing with idempotent ACK/application. An offline or broken TV cannot be forced to display immediately. Applied is software-renderer confirmation, not physical-panel telemetry.
- Native Flutter polls every 10 seconds, plus transfer/render time; Socket.IO accelerates notifications for the browser client. Do not promise instantaneous delivery.
- Native offline retention is at most 24 hours without server contact. A disconnected device cannot learn a revocation immediately. Choose a shorter policy for sensitive deployments.
- Asset cache capacity is 300 MB per release. The native client retains two checkpoints, so provision roughly 1 GB of free app storage including staging headroom. There is no automatic media transcoding.
- The supplied Compose baseline has one API node and a persistent media volume. Cross-host shared/object storage and HA are deployment work; no S3/MinIO adapter or automatic failover is supplied.
- Dashboard device health is current heartbeat state; reports are recorded operational data, not historical uptime, verified viewing duration or people analytics. CSV/report source rows are capped at 5,000 and truncation is flagged.
- Standard UI languages are English and Arabic. Additional language-master entries are metadata, not automatic translations.
- Authentication is local role-based administration. Enterprise SSO/MFA, provider-specific DRM, personal PVR and certified emergency broadcasting are not implemented.
- Playback sessions and device progress have bounded automatic cleanup (8-hour sessions, 90-day progress). Expired admin sessions, enrollments, media tickets, superseded releases and retired source guide records still need a reviewed retention/cleanup policy. Preserve every release referenced by an active device and retain asset/database consistency in backups.
