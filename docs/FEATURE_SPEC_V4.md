# MADAR platform v4 — developer feature specification

This is the implementation contract and handover map for the React administration application, Express API, PostgreSQL data model and Flutter TV application. It extends the v3 platform. The companion [release acceptance checklist](RELEASE_ACCEPTANCE_V4.md) separates source implementation from checks that require the deployment and actual TV hardware.

The application is a managed, device-scoped information and media experience. A device has an administrator-approved audience profile. It does not identify the person standing in front of a shared screen. Recommendations, favourites and playback progress must not be presented as personal account data.

## 1. Product contract

| Area | Contract | Primary implementation |
|---|---|---|
| Branding | MADAR logo with bronze `#6B5837`, ivory surfaces, restrained sage accents, English/Arabic fonts and RTL support | `apps/admin/src/control.css`, Flutter `lib/application.dart` and `lib/widgets.dart` |
| Administration | Dashboard, nine master lists, fourteen content collections, content-field designer, page/grid builders, profiles, screens, schedules, users, audit, integrations and reports | `apps/admin/src/App.tsx`, `pages/` |
| Content | Typed forms, bilingual text, audiences, draft/review/publication, validity windows, uploads, revision checks and immutable published copies | `services/api/src/domain.mjs`, `cms.mjs`, `cms-routes.mjs` |
| Device trust | Manual registration or device-initiated enrollment followed by administrator approval; device keys are separate from admin credentials | `services/api/src/app.mjs`, Flutter `lib/controller.dart` |
| Delivery | PostgreSQL release/outbox transaction, Redis Streams consumer groups, retry/reclaim, per-device stages and checksum verification | `releases.mjs`, `delivery-stream.mjs` |
| TV navigation | Six destinations; landscape top navigation, portrait side navigation; four Info Hub groups displaying two sections each | Flutter `lib/experience.dart` |
| Media presentation | Focus-driven contextual banners, direct media activation, reachable details/favourite controls, VOD and Replay discovery, Live now/next | Flutter `lib/experience.dart`, `lib/details.dart` |
| Playback continuity | Device/session/off history policy, media-revision identity, local checkpoint, fenced server updates, Resume and Start over | Flutter `lib/player.dart`, `lib/playback_state.dart`, API `preferences.mjs` |
| Recommendations | Small explainable content-based ranking from permitted device activity, with editorial cold start and privacy controls | API `preferences.mjs`, `preference-routes.mjs` |
| Source imports | Reviewed M3U, XMLTV and JSON file import; stable source identity; administrator changes preserved; no assumed vendor API | `source-import.mjs`, `source-import-routes.mjs`, [connector guide](SOURCE_CONNECTOR.md) |
| Native delivery | Android TV/touch project, bounded offline cache, remote and touch controls, Android PDF bridge, release-signing configuration | `apps/tv/` |

The source files and [OpenAPI export](openapi.json) define the exact accepted schema. The specification does not turn unconfigured stream URLs, sample media references or an unknown headend into a working broadcast service. Profile page permissions are enforced when building release content and its asset manifest, as well as when serving device APIs.

## 2. Architecture and ownership

React 19/TypeScript/Vite uses TanStack Query for API state, React Hook Form for management forms, RJSF/AJV for schema forms, dnd-kit for ordered sections, and React Grid Layout for the twelve-column dashboard. The API serves the production React build from the same origin. The offline HTML showcase uses an explicitly labelled browser-local adapter; production does not silently switch to sample data.

Node.js 24 and Express 5 provide authentication, authorization, validation, content management, device APIs, import adapters and playback resolution. PostgreSQL is the production source of truth. PGlite is a development/test fallback and is rejected in production. Redis supports durable work distribution, notification fan-out and shared rate limits; it is not the authoritative content database.

Flutter is the native TV client. A verified release contains the profile, allowed layouts, sanitized content, masters, displayable custom-field definitions, assets and schedule metadata. Playback and preference calls are authenticated separately from release synchronization. Progress updates never acknowledge a content release.

| Component | Owns | Does not own |
|---|---|---|
| PostgreSQL | Accounts, profiles, content, layouts, assets metadata, releases, delivery ledger, device records, favourites, progress and connector mappings | Binary media files or the physical display |
| Redis | Pending delivery transport, reclaim/retry coordination and notification fan-out | Permanent proof of delivery or the only copy of desired content |
| Asset storage | Immutable uploaded/normalized binaries addressed by generated IDs and digests | Arbitrary executable uploads or automatic transcoding |
| Express | Authorization, publication, signed/opaque playback resolution, preference fences and source validation | A generic open proxy, DRM platform or tuner driver |
| Flutter | Rendering, remote/touch interaction, verified cache, progress checkpoints and client-side policy enforcement | Administration or automatic permission to internal content |

## 3. Administration, masters and content workflow

### Roles

Administrators manage accounts, profiles and trusted devices, publish content/layouts, reset device preferences and inspect audit. Editors create drafts, edit drafts and submit content for review; publication remains administrator-only. Viewers have read-only administration access. A TV key cannot call administration endpoints.

Admin sessions use HttpOnly cookies. State-changing requests include `X-Madar-Request: 1`, and the server checks the request Origin when supplied. Production uses HTTPS, secure cookies, strong bootstrap credentials, private database/Redis networking and a configured upload scanner.

### Master data

All masters have stable IDs, a name, optional Arabic name/description, active state and ordering. Updates include the expected revision. Deleting referenced records is rejected; deactivation preserves references and history.

| Master | Additional fields and use |
|---|---|
| Buildings | Address; linked by name from locations and visitor content |
| Locations | Building, floor, directions, accessibility; linked from rooms, counters and content |
| Departments | Contact and service hours; owner/department form choices |
| Device groups | Purpose; screen assignment and group scheduling |
| Rooms | Location ID, capacity, available/occupied/unavailable state |
| Counters | Location ID, service, available/serving/paused/closed state |
| Categories | Content collection; TV category filtering and recommendation features |
| Languages | Code, display name, LTR/RTL direction; metadata does not generate translations |
| Providers | Protocol, server-side reference prefix and support contact; no provider secret in TV bundles |

Name/code-based references must be updated before renaming an in-use value. ID-based room/location references retain identity through display-name edits.

### Authoring and publication

1. Maintain required masters, then choose a content collection.
2. Enter standard fields and dynamic fields, upload approved artwork/media, choose audiences and validity.
3. Save a draft or submit for review. An existing published copy stays live while its draft changes.
4. An administrator publishes. The same transaction builds immutable profile releases and per-device outbox rows.
5. The TV downloads and verifies the assigned release and required assets. Admin delivery stages show actual device acknowledgements.

Updates use `{payload, expectedRevision}` and return `409` on a stale revision. Do not silently retry a conflicting editor save. Layout rollback creates a draft requiring another explicit publication.

### Dynamic fields

Each collection supports up to 24 additional fields in `customFields`. Types are text, long text, number, boolean, date, HTTPS URL and select. Definitions contain a stable key, bilingual labels, required flag, `showOnTv` and select options. The server validates definitions and values; arbitrary keys, executable HTML and executable widgets are not accepted.

Only `showOnTv` fields and their values enter release JSON. Incompatible field-definition changes are rejected against existing draft and published content. Add a new field as optional, fill existing records, then make it required. Adding a supported field is dynamic; adding a new executable widget renderer requires Flutter/browser code and protocol tests.

### Uploads and bulk records

Artwork accepts PNG/JPEG/WebP up to 10 MB. The API inspects magic bytes, decodes and normalizes artwork to WebP within 3840 × 2160, strips metadata and records SHA-256. PDF, MP4 and MP3 uploads are limited to 100 MB. Production document/audio/video uploads fail closed if scanning is unavailable. SVG and executable uploads are rejected.

The ordinary collection JSON import accepts 1–100 objects, validates every record and commits the batch atomically. It creates new resource IDs. The source connector import is a separate operation with source identities and reimport reconciliation; see section 10.

## 4. Content fields and TV meaning

Every collection shares English/Arabic title and description, category, owner, optional location ID, image, status, sort order, visible audience types, and optional `startAt`/`endAt`. Text remains plain text. English titles are bounded to 180 characters; descriptions to 5,000. Use ISO 8601 instants with timezone offsets for date/time fields.

| Collection | Specific fields | TV use |
|---|---|---|
| Channels | `streamRef`, `epgId`, number, `catchupEnabled` | Channel cards, logo/branding, Live TV playback and EPG association |
| Videos | `videoRef`, duration, language, featured | VOD cards, resume, categories and recommendations |
| Replay | Channel ID, provider reference, retention days, availability; programme/broadcast metadata when supplied | Programme-level Catch-Up cards, channel/date filters, expiry and resume |
| Radio | Station reference, language | Station selection and audio controls |
| Featured | Target type/ID and CTA text | Editorial Home banner that links to existing authorized content |
| Programmes | Channel ID, broadcast start/end, optional Replay ID | Now/next, progress and programme guide; guide alone is not a recording |
| Notices | Priority, reference number, issuing department, attachment | Official notice and PDF details |
| Events | Venue, organizer, start/end, audience, registration URL, related video | Event/training cards and registration QR |
| Services | Requirements, service URL, contact, hours | Direct service information and companion-phone QR |
| Visitor | Floor, building, hours, directions URL, accessibility, contact | Visitor instructions and directions |
| Media | Related video ID, display date | Editorial highlights with related content |
| Alerts | Severity, instructions, full-screen override; required expiry | Priority information; authorized full-screen alert takes precedence |
| Meetings | Room ID, start/end, organizer, public title | Managed schedule and room state; public subjects are redacted |
| Queue tickets | Ticket, counter ID, waiting/calling/served | Managed calling and counter information without personal identity |

The API validates reference existence and publication rules. Protected provider/source references are removed from release JSON. A playable reference resolves through the backend, rather than exposing configuration credentials as CMS metadata.

Meeting/queue data can come from administrator-managed records and room/counter masters, or authenticated normalized external snapshots. A connected snapshot takes precedence and becomes stale after 90 seconds. Labels distinguish Managed, Sample, Stale and Unconnected. Public/VIP/signage meeting subjects are replaced with the configured public title; private subjects and internal custom fields are removed server-side.

## 5. Adaptive layouts, navigation and banners

### Layout selection

Use the available logical viewport dimensions, not the physical mount or a guessed device type. Auto uses landscape when width is at least height and portrait otherwise. A device override is resolved against its profile setting. An orientation override selects layout; it does not physically rotate a panel or override an operating-system orientation lock.

| Presentation | Landscape | Portrait |
|---|---|---|
| Main navigation | Top navigation with six destinations | Compact side rail; Arabic follows RTL placement |
| Banner | Wide art and adjacent/overlaid text kept as real text | Portrait art if provided, otherwise safe fallback; narrower text composition |
| Lists | Horizontal rails and grids with readable focus targets | Reflowed grid/stack with vertical scrolling |
| Info Hub | Two direct section panels when width permits | Panels stack if remaining width is too narrow |
| Remote | D-pad focus, Select/Enter/Space activation, Back hierarchy | Same actions; no touch-only required controls |

The destinations remain **Home, Live TV, Videos, Replay, Radio, Info Hub**. Radio and Home retain configured widgets. The browser TV is a reference client; native Flutter is the authoritative target of the v4 adaptive interaction changes.

### Info Hub grouping

| Default subtab | Direct section 1 | Direct section 2 |
|---|---|---|
| At a glance | Meeting Rooms | Queue Management |
| Updates | Official Notices | Priority Alerts |
| Services | Services & Information | Visitor Guide |
| Explore | Events & Training | Media Highlights |

Administrators configure group labels/order and section pairings through profile experience settings. Each group contains two valid section page keys. Only authorized sections appear. A selected tab shows information directly rather than requiring a tile followed by another menu. Individual details remain available where the content needs them. Critical full-screen alerts are evaluated globally, not only when Updates is selected.

### Banner content contract

Media items support `bannerMode` (`auto`, `override`, `manual`), `bannerTitle`/`bannerTitleAr`, `bannerDescription`/`bannerDescriptionAr`, `landscapeImage`, `portraitImage`, and normalized `focalX`/`focalY` from 0 to 1. The existing image and ordinary title/description supply fallbacks. Banner text is never baked into the uploaded image.

Automatic mode uses catalogue/EPG information. Override mode keeps automatic data where an override is empty. Manual mode uses editorial values with safe title/branding fallback. Import reconciliation preserves administrator-owned values. Artwork for a published release must be uploaded/verified or a packaged demo asset; external artwork metadata is not permission to fetch arbitrary URLs from a TV. Publication verifies that referenced banner assets have an image MIME type, and rejects profiles whose total referenced assets exceed the native 300 MiB cache limit.

Recommended optional artwork is 1920 × 1080 landscape and 1080 × 1920 portrait. Operators may upload one image and set its focal point, or provide both orientations for exact composition. No artwork yields a MADAR template with branding/title rather than a broken empty hero.

### Media page behaviour

| Page | Banner and discovery | Main action |
|---|---|---|
| Videos | Focus updates hero; Continue Watching, recommendations, recent items, favourites and categories | Select plays/resumes; Details exposes full metadata and Start over |
| Replay | Programme title, original broadcast time, channel and actual availability/expiry; channel/date filtering | Play/resume only an available authorized Catch-Up record |
| Live TV | Focused channel logo/name, current/next programme and current-programme progress | Watch Live; missing guide falls back to channel branding |

The featured area does not start video merely because focus moved. Media cards have a direct action and a normal focusable path to details/favourites; a long-press shortcut must never be the only way to save content. Returning from details/playback retains the originating list context where the item still exists. If publication removed the item, focus falls back to a valid target.

## 6. Device preferences, progress and recommendations

### Policy

`profile.experience` contains orientation, history mode, recommendations flag, completion threshold and Info Hub groups. Defaults are safe for shared displays: public, VIP and signage do not persist playback history; employee and management profiles default to device history. Administrators should deliberately choose the policy for the actual screen location. Recommendation display defaults on, but without permitted activity it is editorial catalogue ordering, not personalization.

```json
{
  "orientation": "auto",
  "historyMode": "off",
  "recommendations": true,
  "completionThreshold": 0.95,
  "hubGroups": [
    {"id":"glance","title":"At a glance","titleAr":"","pages":["info-meetings","info-queue"]},
    {"id":"updates","title":"Updates","titleAr":"","pages":["info-notices","info-alerts"]},
    {"id":"services","title":"Services","titleAr":"","pages":["info-services","info-visitor"]},
    {"id":"explore","title":"Explore","titleAr":"","pages":["info-events","info-media"]}
  ]
}
```

Completion threshold is 0.8–1.0. There must be four groups with unique IDs and two valid sections each; all eight Info Hub sections occur exactly once. Titles are at most 50 characters. The device field `orientationOverride` is `inherit`, `auto`, `landscape` or `portrait`; `inherit` keeps the profile setting. `/api/app/config` returns the resolved `experience` alongside the screen/profile and `preferencesEpoch`.

| History mode | Device behaviour | Server history |
|---|---|---|
| `off` | No durable resume/interest learning | No persistent playback progress |
| `session` | In-memory continuity for the running app session | No persistent playback progress |
| `device` | Identity-bound local continuity and server synchronization | Bounded per-device progress and active playback sessions |

Favourites remain explicit device-level saves, capped at 200 per device. They are shared by people using the screen and must be described that way in the UI. Resetting preferences clears progress, playback sessions and favourites for the selected device, increments the server preference epoch, and invalidates older client work when the new epoch is observed. Recommendation processing is subject to the current policy, regardless of older queued activity. Revocation, assignment changes and policy changes must prevent retained history from leaking to a different audience. An offline client cannot discover a remote reset until it reconnects.

### Resume identity and ordering

Progress is keyed by device, content kind/ID and `mediaRevision`. Media revision represents the actual source/explicit revision, not an unrelated title edit. Replacing the movie or Catch-Up source starts new progress; changing the caption does not.

Only Videos and Replay use VOD resume. Live TV opens the live stream, and Radio is not treated as a finite movie. The normal resume action seeks a short interval before the saved position; Start over deliberately starts from zero. Completion defaults to 95% and is configurable within the API's permitted range.

The client checkpoints locally around every five seconds and sends server progress around every fifteen seconds and on pause/back/background transitions. Server sessions provide ordering fences; each checkpoint carries a monotonically increasing sequence. A later playback session supersedes earlier queued updates. A duplicate accepted checkpoint is safe; stale sessions/sequences cannot overwrite newer intent. Position is not merged by taking the maximum because rewinding and Start over are valid user actions.

Local history is bound to the paired device identity, bounded, and policy-aware. Offline activity does not block rendering or release acknowledgements. Network errors retain valid local continuity without falsely reporting server persistence. Session/off modes do not write persistent server history.

### Recommendation model

The first implementation is a small content-based recommender. It ranks permitted videos and replay records from device-local evidence such as watched fraction/completion and explicit favourites, matched to catalogue features such as category/language/tags. Evidence decays with age, and category diversity reduces repeated-category dominance. Devices with no permitted history receive editorial/catalogue fallback content.

This is deterministic, explainable interest scoring; it is not an LLM, neural model, face recognition, identity inference, collaborative profiling of other users or an external AI service. It can be improved later only after measuring usefulness with the user's approved data policy. Titles, protected content, expired Replay and disabled recommendations must be filtered before rendering results.

The API returns a model identifier, whether personalization was used, item references, scores and concise reasons. Flutter joins references only against its authorized release. Admin summary shows operational aggregates and policy/model information, not a claim that the system knows an individual viewer's interests. The Flutter session/demo/offline fallback can rank from in-memory/local category and language evidence without submitting it to an external AI service; its fallback ordering is not a claim of exact score parity with the server model.

The implemented model identifier is `madar-interest-v1`. Its constants are explicit in `preferences.mjs`:

| Signal or step | Formula or rule |
|---|---|
| Viewing engagement | `2 × min(1, watchedSeconds / max(60, durationSeconds))`, plus 1 if completed |
| Favourite evidence | Weight 3 per explicit favourite |
| Recency | Multiply evidence by `0.5^(ageDays / 30)`; 30-day half-life |
| Feature weight | Category 1.0, language 0.35, tag 0.7; at most 12 tags read |
| Editorial base | Featured item 1.0; other eligible item 0.25 |
| Previously completed candidate | Multiply candidate score by 0.25 |
| Already-favourited candidate | Multiply candidate score by 0.8 |
| Diversity reranking | Divide by `1 + 0.4 × alreadySelectedInCategory`; greedily choose next item |
| Stable fallback | Score, then sort order, then resource ID |

`watchedSeconds` grows only from positive position deltas capped by elapsed server wall time plus two seconds of tolerance; seeking forward does not create a full viewing session. It is still client/player evidence, not independent human-viewing measurement. Recommendations include only current, active, authorized Videos and Replay. Replay requires `available:true`, and a supplied broadcast end must have passed. Media-revision mismatches are excluded from progress evidence.

Server progress uses a 90-day retention window and is bounded to 500 rows per device. Expired rows are excluded on device access; physical deletion runs in bounded batches and may lag during a large cleanup backlog. Playback sessions expire after eight hours and are bounded to 500 per device. The server runs expiry cleanup every 60 seconds with at most 500 expired session rows and 500 old progress rows per batch; preference API access also prunes the current device. Native local progress retains at most 200 records for up to 90 days, bound to the device identity. Favourites are explicit saves and do not expire at 90 days, although their recommendation influence decays. Changing model constants should change the model version and regression tests.

## 7. API contract

All device calls except enrollment use `X-Screen-Key`. Administration uses an authenticated role-authorized session. Errors use `{detail: string}`: 401 invalid credentials, 403 forbidden, 404 unavailable content, 409 conflicting revision/state, 422 invalid input, 429 throttled, and 503 unavailable provider/service. Treat 401/revocation differently from transient connection failures.

### Existing endpoint groups

| Group | Methods and paths |
|---|---|
| Session | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/admin/me` |
| Catalogue | `GET /api/admin/catalog`, `GET /api/admin/overview` |
| Content | `GET/POST /api/admin/resources/:kind`, `PUT/DELETE /api/admin/resources/:kind/:id`, `POST /api/admin/resources/:kind/import` |
| Fields | `GET /api/admin/content-types`, `PUT /api/admin/content-types/:kind` |
| Masters | `GET/POST /api/admin/masters/:kind`, `PUT/DELETE /api/admin/masters/:kind/:id` |
| Layouts | `GET/PUT /api/admin/layouts/:page?profileId=ID`, `POST .../publish`, `GET .../versions`, `POST .../rollback` |
| Profiles/screens | `GET/POST /api/admin/profiles`, `PUT /api/admin/profiles/:id`; equivalent screen collection/update routes; `POST /api/admin/screens/:id/rotate-key` |
| Enrollment | `POST /api/app/enroll`, `GET /api/app/enroll/:id`, `GET /api/admin/enrollments`, `POST /api/admin/enrollments/:id/approve` |
| Schedules | `GET/POST /api/admin/schedules`, `PUT/DELETE /api/admin/schedules/:id` |
| Assets | `GET /api/admin/assets`, `POST /api/admin/assets/upload`, authorized `GET /api/assets/:id` |
| Delivery | `GET /api/admin/deliveries`, `POST /api/admin/deliveries/:id/retry`, device `GET /api/app/config`, `GET /api/app/sync`, `POST /api/app/ack`, `POST /api/app/heartbeat` |
| Device data | `GET /api/app/catalog`, `GET /api/app/content/:kind`, `GET /api/app/pages/:page`, `GET /api/app/operations` |
| Favourites | `GET /api/app/favourites`, `PUT/DELETE /api/app/favourites/:kind/:id` |
| Playback | `GET /api/app/playback/:kind/:id`, temporary authorized `GET /api/media/:token` |
| Reports | `GET /api/admin/reports/summary`, `GET /api/admin/reports/:report` with supported filters and `format=csv` |
| Operations | `GET /api/admin/integrations`, bearer-authenticated `POST /api/integrations/:kind/snapshot` for meeting/queue |
| Access/settings | User CRUD where supported, `GET /api/admin/audit`, `GET/PUT /api/admin/settings` |

### Preference and source extension routes

| Route | Contract |
|---|---|
| `GET /api/app/preferences` | `{policy,epoch,progress}`; permitted progress entries contain kind, ID, media revision, position/duration seconds, completed and updated time |
| `POST /api/app/playback-sessions` | `{kind,id,mediaRevision}` → `{tracking,sessionId,sessionVersion,expiresAt,progress,policy,epoch}`; HTTP 201 when tracking, 200 without persistent tracking |
| `PUT /api/app/playback-sessions/:sessionId` | `{sequence,positionSeconds,durationSeconds,event}` → `{ok,duplicate,progress}`; event is checkpoint/pause/ended |
| `DELETE /api/app/preferences` | Reset the authenticated device's progress/sessions/favourites |
| `GET /api/app/recommendations?limit=12` | `{model,personalized,items:[{kind,id,score,reason}]}`; limit 1–24, default 12 |
| `GET /api/admin/recommendation-summary` | Administrative aggregate model/policy/history information |
| `DELETE /api/admin/screens/:id/preferences` | Administrator reset of one device's preferences |
| `POST /api/admin/source-import/preview` | Validate source text and return a reviewable normalized preview |
| `POST /api/admin/source-import/apply` | Apply a matching reviewed import to drafts using stable source mapping |

See [TV_CONTRACT.md](TV_CONTRACT.md) for the existing activation envelope and [SOURCE_CONNECTOR.md](SOURCE_CONNECTOR.md) for import request examples and limits. See the source and regenerated [OpenAPI file](openapi.json) for exact response fields and validation bounds.

Preference responses use `Cache-Control: no-store, private`. Playback-start accepts only `videos`/`replay` and a 64-character lowercase hex media revision. Sequence is an integer from 1 to 2,147,483,647; duration is positive and at most 604,800 seconds. Position must be nonnegative and no more than two seconds beyond duration, then is clamped to duration. A stale/newer-session conflict returns 409; an expired/reset/unknown session for that device returns 410; inaccessible media returns 404. Retrying the same accepted sequence and payload returns a duplicate success.

Send `X-Preferences-Epoch: <observed integer>` on playback-session creation and favourite PUT/DELETE. The current value comes from `preferencesEpoch` in config or `epoch` in the preferences response. A missing header is accepted only while the server epoch is zero for initial compatibility. After a reset/profile transition, missing/stale epoch returns 409. Clear old local preference/favourite queues before adopting the new epoch; do not simply resend an old intent with the new number. Existing session checkpoint PUT is fenced by its server-issued session ID and sequence, so its body does not add an epoch field.

Source preview uses `{sourceId,format,text}` and returns `{sourceId,format,digest,counts,items,warnings}`. Apply sends the same input plus `digest` and returns `{created,updated,unchanged,ids,warnings}`. Formats are `m3u`, `xmltv`, `json`; text is at most 750 KiB UTF-8 and 1–500 records. The source mapping has a 100,000-record cap. The digest includes source input, mapped revisions and field definitions; changed input/content requires another preview. These routes are administrator-only and apply drafts without creating a release.

## 8. Database and release delivery

| Migration | Purpose |
|---|---|
| `001_initial.sql` | Users/sessions, profiles, resources, layouts/history, devices/enrollment, releases, deliveries/ACKs, schedules, assets/tickets, settings, integrations, audit |
| `002_redis_delivery_stream.sql` | Delivery transport metadata for Redis Streams upgrade/recovery |
| `003_dynamic_content.sql` | Typed content definitions, nine master kinds and device favourites |
| `004_preferences.sql` | Device playback progress and server-issued session fences |
| `005_source_import.sql` | Connector import identity/mapping and reconciliation state |
| `006_content_created_at.sql` | Stable resource insertion timestamp for Recently added; older rows backfill from their prior updated time |

Startup executes numbered idempotent migrations and records versions in `schema_migrations`. Test upgrades against a staging restore before production. PostgreSQL JSONB holds extensible content/profile payloads while relational keys, revisions and transactions enforce identity and consistency. Do not replace PostgreSQL with Redis; the two serve different purposes.

On the first startup against a v3 database, the server publishes one upgraded immutable bundle per existing profile with `experienceVersion: 4`, media revision identities and sanitized page scopes. It uses the previously published content; pending drafts remain drafts. Subsequent starts do not repeat this upgrade. Stage this upgrade with a database and asset backup before rollout.

`device_progress` uses `(screen_id, kind, resource_id, media_revision)` as its primary key and stores position, duration, watched seconds, completion, current session/version and update time. `playback_sessions` stores the device/content identity, session version, last sequence/payload/position and expiry. `screens.preferences_epoch` invalidates old preference intent after a reset. Resource foreign keys cascade removal; API responses additionally enforce current visibility/revision.

`source_imports` identifies a source. `source_bindings` maps `(source_id, kind, external_id)` to a resource and retains the last imported values for three-way reconciliation. `source_media` stores immutable source/URL references server-side. Changed source URLs do not redirect a still-published old snapshot; unreferenced older URL versions can be pruned. Resource `created_at` supports stable Recently added ordering and does not advance when an operator changes a title.

Publication serializes the exact immutable `bundleText` and computes SHA-256 over its UTF-8 bytes. The client must not compute the digest from a reserialized object. Assets have their own byte counts/digests. Unknown widgets, invalid paths, oversized releases or failed checksums prevent activation.

1. The TV downloads and validates the release, then acknowledges Received.
2. It downloads every required asset to staging and verifies bytes/digests, then acknowledges Downloaded.
3. It commits a complete local checkpoint, activates the UI and confirms a rendered frame before acknowledging Applied.
4. PostgreSQL commits Applied. Only then does the worker XACK/XDEL the matching Redis work item.

Received, Downloaded and Failed leave the delivery pending. Worker/API crashes, Redis loss and disconnects are recovered through pending-entry reclaim and SQL reconciliation. Superseded releases and revoked devices are cancelled explicitly. Retry never fabricates Applied. A device cannot acknowledge another device's release or an incorrect digest.

This is at-least-once delivery with idempotent processing, durable retry and observable per-device confirmation. It cannot guarantee that an offline/broken TV displays immediately. Applied is software render confirmation, not evidence of panel power or physical pixels. The native client normally polls every ten seconds, plus download/render time.

## 9. Dashboard, reports and operational visibility

Control Room shows registered/online/offline/synced devices, content and review totals, publishing activity, recent delivery stages and screen locations. Five reports cover device health, delivery acknowledgements, content inventory, publishing activity and saved content. They support appropriate date/search/status/profile filters and safe CSV escaping.

Reports cap source rows at 5,000 and signal truncation. Device health is a current heartbeat snapshot, not historic uptime. Saved-content counts and recommendation history are not people analytics or independently verified viewing time. Administrative model summaries should not expose unnecessary per-device content histories to read-only users.

Operators should alert on stale heartbeats, un-applied desired releases, repeated failed downloads, Redis/API health, disk capacity, rejected/scanner-failed uploads and expired provider credentials. Backup PostgreSQL and binary assets together; restore into a separate environment and verify digest consistency before switching production traffic.

## 10. Headend and channel-scanning integration

The proposed Chinese headend/scanning device has no confirmed brand, model, software version or API. The implementation therefore uses explicit M3U/XMLTV/JSON imports and stable external IDs rather than claiming a working proprietary driver. The connector guide defines what can be imported and how operator overrides survive refreshes. Automatic vendor API polling, credential refresh and scheduled synchronization are not implemented without that vendor contract. Fictional coherent examples are included in `docs/examples/source-channels.m3u`, `source-guide.xml` and `source-catalogue.json`; import them under the same `example-headend` source ID.

M3U describes channels and media locations. XMLTV describes channels/programmes and optional artwork; it does not guarantee Catch-Up media exists. JSON can provide supported normalized fields. Import preview validates input before applying draft changes. Publishing is still an administrator decision.

Imported guide metadata can populate automatic banners. Optional remote image metadata does not bypass upload verification. UDP/RTP, tuner-specific transport, multicast, proprietary authentication or unsupported codecs may need a licensed gateway that produces a supported HTTPS player source. Actual live, Replay retention/URL semantics, DRM and rights must be validated against the selected hardware/software.

To complete a vendor adapter, obtain its exact model/firmware, sample M3U/XMLTV/API response, authentication method, network topology, programme timezone, stable IDs, stream protocols/codecs, and actual Catch-Up contract. No PVR/recording service is implemented. A channel flag or EPG row must never be represented as a playable recorded programme without a valid source.

## 11. Developer setup and extension points

### React and backend

```sh
npm ci
npm run build
# Copy .env.example to .env and set development values first.
node --env-file=.env services/api/src/server.mjs
# Optional React hot reload in another terminal:
npm run dev -w apps/admin
```

Use Node.js 24. Production requires PostgreSQL and Redis; local demo can use PGlite. `npm run dev` alone does not load `.env`, so use the explicit Node command above when relying on that file. Keep `VITE_SHOWCASE` unset for real API integration. For Vite development writes, set `APP_ORIGIN` to the actual Vite origin.

```sh
npm test
# Point TEST_REDIS_URL at an isolated test Redis database before running:
npm run test:redis
npm run typecheck
npm run build
npm audit
npm run docs:api
npm run demo:tv
npm run preview:offline
```

Do not run tests against production databases. Redis integration can use `TEST_DATABASE_URL` for isolated PostgreSQL schemas. `npm run docs:api` regenerates the API route/schema document; manual route additions must also be captured by its exporter.

### Flutter

```sh
cd apps/tv
flutter pub get --enforce-lockfile
flutter analyze
flutter test
flutter run --dart-define=MADAR_DEMO=true
# Connected mode:
flutter run --dart-define=MADAR_API_URL=https://your-madar-origin
```

Use the Flutter/Dart versions in the project/CI and retain `pubspec.lock`. Android targets API 24+. Production requires HTTPS. A physical TV must use a reachable server address rather than the developer computer's localhost. Pair with the on-screen code through Screens & Devices.

`npm run demo:tv` exports labelled samples from the real backend seed into `assets/demo.json`. A paired TV reads live release APIs and never falls back silently to the bundled demo. Sample media references are placeholders until mapped or replaced with uploaded files.

### Code ownership map

| Concern | Files to start from |
|---|---|
| API auth and route wiring | `services/api/src/app.mjs`, `server.mjs` |
| Resource schemas and visibility | `domain.mjs`, `cms.mjs`, `shared/catalog.json` |
| Profile experience | `experience-config.mjs`, React `pages/Profiles.tsx`, `pages/Screens.tsx` |
| Release/ACK protocol | `releases.mjs`, `delivery-stream.mjs`, Flutter `protocol.dart`, `cache.dart`, `controller.dart` |
| Playback and recommendations | `preferences.mjs`, `preference-routes.mjs`, Flutter `playback_state.dart`, `player.dart`, `details.dart` |
| Source connector | `source-import.mjs`, `source-import-routes.mjs` |
| React management | `App.tsx`, `pages/ContentManager.tsx`, `Masters.tsx`, `ContentFields.tsx`, `Reports.tsx` |
| Native composition and focus | Flutter `experience.dart`, `widgets.dart` |
| Native PDF | `pdf_viewer.dart`, Android `MainActivity.kt` |
| Samples and exports | `sample-data.mjs`, `scripts/export-tv-demo.mjs`, `export-showcase.mjs`, `export-openapi.mjs` |

To add a supported field, use the field designer. To add a collection, update the domain schema, references, visibility mapping, catalogue/navigation, import rules where applicable, seeds and tests. To add a widget, update the registry and both renderers; reject unsupported widgets rather than acknowledging an unrenderable release. To modify progress policy or recommendation constants, update API/client handling, migration/retention decisions and tests together.

## 12. Release boundaries

The source includes the Android project and signing configuration, not a signed production APK or deployed service. Physical remote/codec testing, Android native PDF/plugin execution, selected provider streams, production PostgreSQL/Compose, scanner/TLS configuration, backup restore and browser visual/accessibility acceptance require the target environment. The single API-node Compose baseline does not claim HA, shared object storage or automatic failover.

SSO/MFA, arbitrary widget execution, automatic translation, provider DRM, transcoding, personal user accounts, collaborative user profiling, PVR and certified emergency broadcasting are outside this implementation. The [acceptance checklist](RELEASE_ACCEPTANCE_V4.md) is the release gate; a passing source test suite alone is not a production-readiness certificate.
