> **Version 4.0 supplement:** [Complete developer feature specification](FEATURE_SPEC_V4.md) documents the adaptive layout, banner, source-import and device-preference APIs. [Release acceptance](RELEASE_ACCEPTANCE_V4.md) records remaining deployment and hardware checks.

# MADAR TV content and upload specification

The six destinations are **Home, Live TV, Videos, Replay, Radio, Info Hub**. TVs display and navigate content. All management is in React Admin. One source record can appear in several page widgets without duplicate uploads.

## TV screen composition

| Destination | Main presentation | Supporting information / interaction |
|---|---|---|
| Home | Bronze/ivory featured hero with existing-content action | Meeting and queue summaries; live channels; videos; approved notices; upcoming events; navigation and clock |
| Live TV | Category chips and channel cards | Channel number, title/logo, now/next/EPG presentation, launch authorized playback; sample guide clearly marked |
| Videos | Featured content, categories, poster rows | Title, description, duration, language and details; play provider source or uploaded media |
| Replay | Catch-up-enabled channels and program guide presentation | Provider retention window; provider playback reference; no recording or PVR controls |
| Radio | Station cards and categories | Station name/logo/language; native audio playback for configured sources |
| Info Hub | Meeting/queue summaries then eight navigation tiles | Official notices, events, services, visitor information, media and alerts; details pages and back navigation |

## Common CMS fields

| Field | Purpose / input |
|---|---|
| title / titleAr | Required English title and optional Arabic title; English title 2–180 characters |
| description / descriptionAr | Plain text body; up to 5,000 characters; no executable HTML |
| category | Search/filter grouping reused by widgets |
| owner | Content owner or department responsible for updates |
| locationId | Optional location metadata; current profile scope is the authorization boundary |
| image | Uploaded artwork reference; publication requires a local verified asset or packaged demo artwork |
| status | Draft → Review → Published, or Disabled. Only administrator can publish or disable |
| visibleTo | Public, Employee, Management, VIP, Signage audience types; required by viewer filtering |
| startAt / endAt | Optional ISO 8601 publication and expiry instants, including timezone |
| sortOrder | Integer ordering priority inside a content collection |

Administrators can edit draft copies of already-published records. The published copy stays live until an explicit publication. Optimistic revision checks prevent overwriting a newer content edit. Review status is visible in the content list and filter; approval is performed by setting Published as an administrator.

## Info Hub — eight agreed sections

| Section | Data captured / source | TV presentation |
|---|---|---|
| Meeting Rooms | Existing meeting system: todayMeetings, ongoing, upcoming; rooms{name,status}; schedule{time,room,title}; ingestion timestamp | KPI strip; available/occupied room cards; upcoming schedule. Public/VIP/signage subjects are replaced with Reserved |
| Queue Management | Existing queue system: servedToday, waiting, activeCounters; calls{ticket,counter}; counters{name,status}; ingestion timestamp | KPI strip; calling-now ticket cards; counter status. Avoid names and identity numbers in source snapshots |
| Official Notices | Common fields + priority(normal/important/urgent), referenceNumber, department, attachmentUrl | Approved notice cards; full notice details; issuing department and reference |
| Events & Training | Common fields + venue, organizer, eventStart, eventEnd, audience, registrationUrl, optional related videoId | Poster, title, venue/date; details and registration link. Publish requires venue and valid start/end |
| Services & Information | Common fields + requirements, serviceUrl, contact, hours | Service cards; prerequisites, contact and hours; approved HTTPS information link |
| Visitor Guide | Common fields + floor, building, openingHours, directionUrl, accessibility, contact | Location tiles; step-free access guidance; contact and directions |
| Media Highlights | Common fields + targetVideoId, displayDate | Editorial image/story cards and related video reference |
| Priority Alerts | Common fields + severity(info/warning/critical), instructions, fullScreenOverride | Alert cards and detail instructions; expiry is required. Authorized full-screen override remains visible until expiry in the reference player; it is not a certified emergency notification system |

Meeting and queue widgets support two sources. An authenticated external snapshot takes precedence and is marked Stale after 90 seconds without refresh. Without a connected source, they derive data from published **Meeting Schedule** / **Queue Tickets** records and the **Rooms** / **Counters** masters. Admin-managed data is labelled Managed, not Live. Demo data is labelled Sample. If neither source exists, the widget shows Unconnected.

## Media catalogue fields

| Type | Additional fields |
|---|---|
| Channels | streamRef, epgId, number, catchupEnabled |
| Videos | videoRef (provider reference or uploaded /api/assets/ID), durationSeconds, language, featured |
| Replay sources | channelId, providerRef, retentionDays (1–90), available |
| Radio | stationRef, language |
| Featured banners | targetType(video/channel/event/notice/info-page), targetId, ctaText |

Source references are validated for existence. Published banner targets must already be published. Protected provider references are excluded from device release JSON; playback resolution happens on the backend. Detailed EPG ingestion, programme-specific replay resolution, broadcast licensing, DRM and transcoding remain provider integration work.

## Upload workflow

1. Open Media Assets and upload PNG/JPEG/WebP, PDF, MP4 or MP3. Artwork is limited to 10 MB; other uploads to 100 MB.
2. The API inspects magic bytes. Artwork is decoded, resized to fit 3840×2160 and normalized to WebP; metadata is removed. SVG and executable files are rejected.
3. Production uploads are scanned when ClamAV or a configured scanner is available. Documents/audio/video are refused if no scanner is configured. Files that fail scanning are removed before a database record is created.
4. Select the content form's artwork, PDF, MP4 or MP3 upload control. It fills image, attachmentUrl, videoRef or stationRef as appropriate. Existing asset references can also be copied from the asset library.
5. Add bilingual text, audiences and validity. Save draft or submit for review. An administrator publishes the item.
6. Publication creates new profile release snapshots and queues assigned TVs. Asset checksums are part of the release; the reference TV caches them before acknowledging download.

Suggested artwork: 1920×1080 for heroes, 1280×720 for videos/events, square artwork for channel/station logos. These are editorial recommendations, not forced upload dimensions.

## Sample information

The package contains **145 published sample records** across 14 content collections: channels, videos, replay, radio, featured, notices, events, services, visitor, media, alerts, programmes, meetings and queue tickets. It also seeds all nine master lists. Sample counts come from these records, and the sample experience is explicitly labelled. Media references are placeholders requiring a provider mapping or uploaded media; no playback success is fabricated.

## Programme and operational records

| Collection | Fields beyond the shared content fields | Display |
|---|---|---|
| Programme Guide | channelId, eventStart, eventEnd, optional replayId | Channel now/next and guide cards |
| Meeting Schedule | roomId, eventStart, eventEnd, organizer, publicTitle | Meeting totals, availability and schedule; public/VIP/signage subjects are redacted |
| Queue Tickets | ticket, counterId, queueState(waiting/calling/served) | Calling tickets, counter cards and queue totals |

Administrators maintain channel/room/counter references before publishing dependent records. Programme and meeting end times must follow their start times. Queue totals are derived from the currently published managed records; reconcile or remove old records as part of the daily queue process, or connect an operational feed for authoritative daily statistics.

## Dynamic fields and master data

**Content Fields** adds up to 24 typed fields per collection: text, long text, number, boolean, date, HTTPS URL and select. Values are stored in `customFields`; the server validates both definitions and submitted values. Only fields marked **Show on TV** enter a device release. The TV details renderer displays their bilingual labels and values. New required fields must first be populated in existing content; incompatible definition edits return a conflict.

Buildings, locations, departments, device groups, rooms, counters, categories, languages and media providers have dedicated master screens. Content and device forms use those values. Name-based references must be updated before renaming an in-use master; ID-based room/location links preserve identity when names change. Deactivate used values to retain history. See [ADMIN_GUIDE.md](ADMIN_GUIDE.md) for the exact fields and import example.

Backend samples are in `services/api/src/sample-data.mjs`; `npm run demo:tv` exports them to `apps/tv/assets/demo.json`. Paired TVs read `/api/app/sync` and never fall back silently to the bundled demonstration data.
