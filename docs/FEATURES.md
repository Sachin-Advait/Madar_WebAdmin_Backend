> **Version 4.0 supplement:** [Complete developer feature specification](FEATURE_SPEC_V4.md) documents the adaptive layout, banner, source-import and device-preference APIs. [Release acceptance](RELEASE_ACCEPTANCE_V4.md) records remaining deployment and hardware checks.

# Agreed scope and implementation map

Version 4.0 continues the Node/PostgreSQL/Redis platform and preserves the React page builders, schemas and stable widget IDs from earlier releases. It includes the native Flutter client, dynamic fields, master data, samples, favourites, dashboard and reports, plus adaptive portrait/landscape layouts, contextual banners, resume playback, per-device recommendations and reviewed headend imports. The original Python/SQLite API and earlier Spring Boot migration notes do not apply to this package.

| Area | Delivered implementation | Boundary |
|---|---|---|
| Admin theme | Ivory surfaces, bronze controls, sage accents, supplied Arabic MADAR logo, local Latin/Arabic fonts, responsive layouts | All 38 admin destinations and compact navigation were exercised in the browser preview; target-browser form, drag/drop and accessibility acceptance remains |
| Page builder | dnd-kit pointer/keyboard sorting, add/duplicate/hide/remove, schema settings, draft revision, publication, version history, rollback to draft | New widget types require a matching TV renderer implementation |
| Dashboard designer | react-grid-layout v2 move/resize, persisted x/y/w/h on 12 columns | Physical TV focus and layout acceptance must be tested |
| Content library | 14 collections: channels, videos, replay, radio, featured, notices, events, services, visitor, media, alerts, programmes, meetings and queue tickets; typed custom fields; atomic JSON import | Broadcast media uses a configured provider; sample labels are explicit |
| Master data | Nine CRUD master lists: buildings, locations, departments, device groups, rooms, counters, categories, languages, providers; revision and reference checks | Media provider credentials remain server-side; language metadata does not add automatic translations |
| Dashboard and reports | Real device/content/ACK metrics, 14-day publishing trend, five operational reports with filtering and safe CSV export | Snapshot/report data is not verified viewing analytics; source rows capped at 5,000 |
| Approval | Editor draft/review; administrator publication; immutable live snapshots preserved during edits | No email approval notifications are sent |
| Assets | MIME detection, image normalization, SHA-256, authenticated access, shared references, MP4/MP3/PDF support | Production scanner required; no automatic transcoding or DRM service |
| Profiles | Public/Visitor, Employee, Management, VIP, Dedicated Signage; theme/language/page permissions | Public access redacts meeting subjects; operational feeds are normalized |
| Devices | Manual registration or device-initiated pairing, 10-minute codes, administrator approval, profile/page/location/group assignment, disable and key rotation | Device cannot self-approve privileged access |
| Delivery | SQL transactional outbox + per-TV Redis Streams; XREADGROUP, XAUTOCLAIM, XACK after Applied; retry, reconciliation and stale-release rejection | Applied is player confirmation, not independent proof of physical pixels |
| TV player | Native Flutter Android TV/touch app and browser renderer, six destinations, eight Info Hub sections, 20 widgets, favourites, details, media/PDF controls and verified offline cache | Android build/signing, physical remote/codec testing and provider acceptance remain |
| Media experience | Orientation-aware banners, focus-driven media details, resume/start-over, Continue Watching and recommendations by device | Native media engine and actual target-TV acceptance remain |
| Source imports | M3U, XMLTV and normalized JSON preview/apply into drafts, stable provider bindings and preserved operator edits | Actual vendor API authentication/polling and broadcast gateways depend on the supplied headend specifications |
| Preferences | Off/session/device history modes, reset epochs, ordered playback checkpoints and explainable category/tag/favourite scoring | Shared-device interests do not identify an individual; public profiles default to history off |
| Schedules | IANA timezone, weekdays, validity dates, priority, screen/group, overnight windows | Offline player retains last server-selected opening page |
| Operational feeds | Authenticated meeting and queue ingestion, stale flag, managed fallback from published meeting/queue records and room/counter masters | Source-specific mapping and actual service access must be supplied |
| Security | Hashed passwords/tokens, HttpOnly sessions, CSRF header/origin checks, RBAC, schema validation, rate limiting, Helmet, audit | Enterprise SSO/MFA is not implemented |
| Deployment | Dockerfile, PostgreSQL/Redis Streams/ClamAV/Caddy Compose, AOF/noeviction, health probe, graceful shutdown, CI with Redis/PostgreSQL | Recipe not executed in this Windows environment; baseline is one API node with persistent media volume |

Every navigation label and widget ID from the prior agreement is retained. VIP is added alongside the original four profile types.

Widget IDs: `featured_banner`, `live_channel_row`, `video_row`, `replay_channels`, `radio_row`, `meeting_summary`, `queue_summary`, `meeting_room_grid`, `meeting_schedule`, `queue_calling`, `queue_counters`, `announcements`, `events_row`, `services_grid`, `visitor_directory`, `media_highlights`, `priority_alerts`, `epg_guide`, `video_categories`, `info_links`.
