# MADAR v4 — release acceptance and verification

This checklist is for the deployment owner, React/API developers, Flutter developers and QA. Source implementation and automated checks must be distinguished from real hardware/provider acceptance. See [FEATURE_SPEC_V4.md](FEATURE_SPEC_V4.md) for the functional contract and [VERIFICATION.md](VERIFICATION.md) for executed evidence.

## Evidence policy

Record the build/source version, command, date, environment, outcome and any skipped cases. Do not copy v3 test totals into a v4 verification statement. A test that uses PGlite does not prove a deployed PostgreSQL service, and a Flutter widget test does not execute Android codecs, secure storage or native PDF code. A rendered mock screen is design evidence, not successful playback.

The source package must include the current lockfiles, migrations, schema/API export, developer documents and labelled samples. Do not package secrets, `.env`, keystores, local device keys, private database files or test caches.

## Automated checks

| Area | Required check | Pass condition |
|---|---|---|
| Backend regression | `npm test` | Auth/RBAC, content/revisions, masters, release sanitization, delivery order and current extension tests pass |
| Redis | Isolated `TEST_REDIS_URL`, `npm run test:redis` | Real Streams Pending Entries List, Applied/XACK ordering, reconnect/reclaim/reconciliation and cancellation cases pass |
| React | `npm run typecheck`, `npm run build` | TypeScript and production bundle pass with real API mode |
| Flutter | `flutter analyze`, `flutter test` | No analyzer issues; protocol, controller, adaptive UI, focus and progress tests pass |
| Source imports | Parser and route tests | Bounds, malicious XML/URLs, stable IDs, unknown channel mapping, reimport conflicts and override preservation pass |
| Preferences | Route/model tests | Per-device isolation, current policy, session fencing, idempotence, reset, media revision, expiry and authorization pass |
| Dependency review | `npm audit`; review Flutter lockfile/dependency notices | No unresolved advisory accepted without documented risk/mitigation |
| Generated outputs | API/demo/offline exports | Current endpoints and schema appear; demo is explicit; preview cannot claim real device ACKs |
| Native Android | CI/local debug build | Gradle/Kotlin and native plugins compile on supported SDK/Java; APK installs on target device |

Tests must include meaningful failure paths rather than simply asserting a function's own constants. Keep a baseline record and rerun affected tests after corrections. Final aggregate counts belong in the verification report only after the final source is checked.

## Feature acceptance matrix

| Feature | Automated/local acceptance | Target-device or deployment acceptance |
|---|---|---|
| Theme and logo | Bronze token retained, original logo file preserved, RTL layouts compile | Inspect contrast, text sizing and overscan at expected viewing distance |
| Landscape navigation | Width-driven top navigation and reachable content actions | D-pad order, edge movement, Back, focus restoration and TV key map |
| Portrait navigation | Height-driven rail, safe panel reflow, Arabic direction | Physical rotation/OS dimensions, usable screen area, no clipped focus rings |
| Orientation override | Profile/device precedence and invalid-value rejection | Override changes layout without assuming OS rotation; operator can recover misconfiguration |
| Info Hub | Four tab groups, two direct panels, authorization and narrow stacking | Meetings/queue/cards remain legible; critical alerts override any tab |
| VOD | Categories, resume, recommendation/reference joins, empty states | Actual uploaded and provider media, seek, pause, finish, Back and refresh |
| Replay | Guide linking, actual availability/expiry and filter behavior | Real Catch-Up URL, retention boundary, source timezone and codec validity |
| Live TV | Current/next selection and guide-missing fallback | Channel switch latency, stream errors, playback continuity and actual EPG timing |
| Banners | Auto/override/manual values, orientation artwork and fallback | Crop/focal point on each TV aspect ratio; no unreadable text over images |
| Favourites | Idempotent add/remove, device scope, visibility filtering | Save/remove with ordinary remote keys and touch; icon/list reflect final state |
| Resume | Revision identity, sequence/session fences, completion, rewind/start-over | Kill/restart, offline playback, background/power transition, duration changes and failed seeks |
| Recommendation privacy | Public defaults, no cross-device ranking, disabled mode and reset | Confirm deployment policy for public/shared screens; verify operator wording and reset behavior |
| Source imports | Preview/apply integrity, draft-only writes, mappings and overrides | Actual vendor export format, IDs/timezone/authentication and network transport |
| Content/forms | Typed dynamic fields, uploads, audience windows, revision checks | Operator workflow from draft through review/publication for each collection |
| Delivery | Wrong digest/device/sequence rejected; durable retry | Interrupt network/power at each stage; old good release retained; Applied never fabricated |
| Offline cache | Checksum/bounds, policy and identity checks | Storage quota/eviction/full disk, cache expiry and reconnect with changed assignment |
| Masters/reports | Reference checks, CSV formula escaping, real counts | Browser editing, filtering/export and large-data truncation visibility |
| Security | Role/device separation, validation, throttling, secret redaction | TLS/proxy trust, scanner fail-closed, production keys, network restrictions and credential rotation |

## Progress and recommendation scenarios

1. Two devices watch the same media. Their saved positions and recommendations remain separate.
2. Watch to a useful position, pause/back, reopen, and verify Resume seeks slightly before it. Select Start over and verify zero wins over an older delayed high-position checkpoint.
3. Send duplicate checkpoint sequence/payload, then an older sequence, then a checkpoint from a superseded session. Verify duplicates are safe and stale writes cannot replace new intent.
4. Change only title/artwork and retain progress. Change the actual media source/revision and verify old progress is not reused.
5. Cross the configured completion threshold. Completed content leaves Continue Watching; Start over remains possible.
6. Switch from device history to off/session and back. Confirm no old persistent history is resurrected by offline retries. Reset device preferences and verify progress, sessions and favourites clear consistently.
   Send an old favourite intent and playback-session creation with the pre-reset `X-Preferences-Epoch`; both must fail with 409. A missing header is only compatible with epoch zero. Refresh the policy/epoch, discard stale queues, then start new user intent.
7. Disable recommendation personalization, remove all history, and expire/remove a replay record. Verify fallback is authorized and no retired content is recommended.
8. Revoke/reassign the screen while playback/checkpoint requests are in flight. Verify API access fails appropriately and policy/identity-bound local data cannot appear under another assignment.
9. Do not report a watched duration or recommendation score as a verified count of human viewers.

## Connector acceptance scenarios

1. Import a vendor M3U into a new source identity. Review normalized channels, warnings and the absence of automatic publication.
2. Repeat the same import. Verify no duplicate channel IDs. Change the source channel title while leaving an administrator banner override; verify the intended source update and override preservation.
3. Import XMLTV with the mapped channel IDs and explicit timezone offsets. Verify now/next at boundaries and reject/flag unknown mappings.
4. Send XML external entities/DOCTYPE, oversized documents, malformed source IDs, unsupported stream URLs and unrelated path values. Verify no remote fetch or arbitrary file access occurs.
5. Import guide data without a recording source. Verify it remains guide metadata and does not invent Replay availability.
6. Validate source URLs through the configured playback path using the actual headend. If it only exposes UDP/RTP/multicast/proprietary output, verify the selected gateway and codec conversion before calling the integration complete.
7. Test two operators/reimports against the same record and resolve conflicts without overwriting newer administrator edits.

## Deployment and release sequence

1. Back up the current PostgreSQL database and asset volume. Restore into a separate staging environment and run all migrations there.
2. Run CI with real PostgreSQL/Redis and the Android build job. Review production configuration: no demo mode, strong credentials, private PostgreSQL/Redis, persistent assets, HTTPS origin, trusted proxy topology and working upload scanning.
3. Configure real provider/media references. Create actual masters/content, review public/shared history policy and pair representative landscape/portrait/Arabic TVs.
4. Publish content, theme and layout changes separately. Verify each target reaches Received, Downloaded and Applied; interrupt network/power/API/worker at every stage and verify recovery.
5. Exercise remote/touch, playback, errors/retry, favourites, resume, reset, rotation, guides, PDFs and connected operations. Inspect actual pixels and physical remote behavior.
6. Load-test the planned fleet, reconnect storms, shared-NAT rate limits, release size and database/report volume. Confirm latency expectations and storage headroom.
7. Perform a full recovery drill and document monitoring, escalation, rollback, keystore ownership and source/provider renewal responsibilities.
8. Produce an organization-signed release APK/AAB with the intended application ID. Verify installation, upgrade from the previous release and persisted-state compatibility before expanding rollout.

## Known release boundaries

- No signed APK, Play Store publication or external deployment is implied by the source package.
- The unknown headend brand/model/API still requires vendor-specific acceptance. File adapters do not prove tuner, DRM, licensed Catch-Up or codec compatibility.
- Native PDF, secure-storage behavior, video codecs and remote key codes need Android hardware tests.
- Browser visual/accessibility review, live PostgreSQL/Compose behavior and real scanner/provider integration must have their own evidence.
- An offline/broken device cannot be forced to display immediately. Applied is software confirmation; monitor physical panels separately where required.
- The default Compose configuration is a single API node with persistent media storage. HA, cross-host shared storage and disaster recovery automation require deployment engineering.
- Preferences belong to a shared device, not an authenticated individual. No facial/identity inference or personal-account privacy claim is made.

The release owner should fill the executed evidence in [VERIFICATION.md](VERIFICATION.md), record unresolved gates with an owner and due date, and approve rollout only after the target environment satisfies the required cases.
