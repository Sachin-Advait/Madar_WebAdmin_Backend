> **Version 4.0 supplement:** [Complete developer feature specification](FEATURE_SPEC_V4.md) documents the adaptive layout, banner, source-import and device-preference APIs. [Release acceptance](RELEASE_ACCEPTANCE_V4.md) records remaining deployment and hardware checks.

# TV API and delivery contract — schema version 1

## Authentication and registration

| Method / endpoint | Caller / purpose |
|---|---|
| POST /api/auth/login | Admin email/password → HttpOnly session cookie |
| GET /api/admin/me; POST /api/auth/logout | Current admin identity / revoke current session |
| POST /api/app/enroll | TV submits name, model, platform, appVersion → id, 8-character code, enrollmentKey, 600-second expiry |
| GET /api/app/enroll/{id} | X-Enrollment-Key proves possession; returns Pending or Approved; on approval the same secret becomes the device credential |
| GET /api/admin/enrollments | Administrator reviews pending unexpired devices |
| POST /api/admin/enrollments/{id}/approve | Administrator verifies the code and assigns a profile, location/group, start page and enabled state |
| POST /api/admin/screens | Manual device registration → one-time screenKey |
| PUT /api/admin/screens/{id} | Assignment, location, group, start page or enabled state |
| POST /api/admin/screens/{id}/rotate-key | Replaces the hashed credential; old HTTP credential fails immediately |

All device calls use `X-Screen-Key`. Do not use serial number, IP address or a pairing code as an authentication secret. Store the device secret in the platform keystore for native clients. The browser demo uses local storage and is a reference implementation.

## Device runtime

| Method / endpoint | Response / behavior |
|---|---|
| GET /api/app/config | Device assignment, profile, currently scheduled page, desired/applied release IDs, polling interval |
| GET /api/app/sync | deliveryId, releaseId, version, SHA-256 digest, exact bundleText and current status |
| POST /api/app/ack | deliveryId, stage(received/downloaded/applied/failed), digest, optional error |
| POST /api/app/heartbeat | appVersion, page, cacheBytes, lastError; returns desired release and server time |
| GET /api/app/operations | Meeting and queue normalized live data with availability/staleness |
| GET /api/app/catalog | Profile-scoped page definitions, display fields and active masters |
| GET /api/app/content/{kind} | Active, profile-accessible published content; internal custom fields and provider references are excluded |
| GET /api/app/favourites | Device-scoped saved items, filtered for current visibility and expiry |
| PUT /api/app/favourites/{kind}/{id}; DELETE same path | Idempotent save/remove; up to 200 favourites per device |
| GET /api/app/pages/{page} | Legacy resolved page response; use versioned sync bundle for consistent activation |
| GET /api/app/playback/{kind}/{id} | Resolve authorized channels/videos/radio/replay; configured HTTPS provider URL or temporary local-media ticket |
| GET /api/assets/{id} | Authorized binary asset with correct content type; validate its release digest |

Socket.IO uses WebSocket transport and `auth.deviceKey`. `sync-required` is only a notification hint. The browser fetches `/api/app/sync` after connection/reconnection and every 30 seconds. The Flutter implementation polls config/sync every 10 seconds and does not require a native Socket.IO dependency. Redis Streams keeps each device delivery pending until Applied commits to SQL; the worker then XACKs and removes the entry. Received/Downloaded/Failed messages remain pending. Superseded or revoked deliveries are retired as cancellations. The HTTP ACK endpoint and payload are unchanged. ETag/If-None-Match yields 304 only once that same device has acknowledged Applied.

## Bundle format

```json
{
  "schemaVersion": 1,
  "releaseId": "uuid",
  "version": 12,
  "profile": {"id":"public","profileType":"public","theme":{"accent":"#6b5837","mode":"light","language":"en"},"allowedSections":["*"]},
  "pages": {"home":{"schemaVersion":1,"pageKey":"home","sections":[]}},
  "content": {"notices":[]},
  "assets": [{"id":"uuid","url":"/api/assets/uuid","digest":"sha256-hex","bytes":1000,"mime":"image/webp"}],
  "schedules": [],
  "masters": {"rooms":[],"counters":[]},
  "displayFields": {"services":[]},
  "widgetSources": {"announcements":"notices"},
  "pageTitles": {"home":"Home"},
  "createdAt": "ISO-8601"
}
```

The digest is computed over the exact UTF-8 `bundleText` string, not a reserialized JSON object. Sections contain id, type, enabled, order, props and layout{x,y,w,h}. Grid coordinates use 12 columns. Only registered widget types may be published on the registered page.

## Activation sequence

1. Download the bundle, validate schema support and exact SHA-256, then acknowledge Received.
2. Fetch every required immutable asset; verify SHA-256. Retain the previous good release if any download or validation fails.
3. Verify all assets and finish writing staged asset files, then acknowledge Downloaded. Commit a complete immutable local release checkpoint before activation. A failed acknowledgement or checkpoint write must not be counted as Applied.
4. Activate the renderer, restore a valid focus target, and render the new release. Only now acknowledge Applied with the same deliveryId and digest.
5. Persist enough state to resend an acknowledgement after a crash. Duplicate acknowledgements are safe. Wrong digest, other-device delivery ID, premature Applied and superseded delivery IDs are rejected.
6. On failure, submit Failed with a concise diagnostic and retain the last good release. The server retries; monitoring must alert on prolonged failures.

The reference player uses browser render callbacks for Applied. It cannot independently prove the connected panel is powered on or displaying the pixels. An offline, revoked, storage-full, incompatible or broken TV cannot be guaranteed an immediate update. The contract is persistent retry with idempotent application and explicit per-device confirmation under recovery conditions.

## Administration endpoints

| Area | Endpoints |
|---|---|
| Catalogue | GET /api/admin/catalog, GET /api/admin/overview |
| Masters | GET/POST /api/admin/masters/{kind}; PUT/DELETE /api/admin/masters/{kind}/{id} |
| Custom fields | GET /api/admin/content-types; PUT /api/admin/content-types/{kind} with fields and expectedRevision |
| Import | POST /api/admin/resources/{kind}/import with an items array of 1–100 records |
| Reports | GET /api/admin/reports/summary; GET /api/admin/reports/{report}?from=YYYY-MM-DD&to=YYYY-MM-DD&query=TEXT&status=STATUS&profileId=ID&format=csv |
| Content | GET/POST /api/admin/resources/{kind}; PUT/DELETE /api/admin/resources/{kind}/{id}; `?published=1` reads approved snapshots |
| Layout | GET/PUT /api/admin/layouts/{page}?profileId=ID; POST /publish; GET /versions; POST /rollback |
| Preview | GET /api/admin/preview/{page}?profileId=ID&mode=draft or published |
| Profiles | GET/POST /api/admin/profiles; PUT /api/admin/profiles/{id} |
| Schedules | GET/POST /api/admin/schedules; PUT/DELETE /api/admin/schedules/{id} |
| Assets | GET /api/admin/assets; POST /api/admin/assets/upload (multipart field `file`) |
| Delivery | GET /api/admin/deliveries; POST /api/admin/deliveries/{id}/retry |
| Access | GET/POST /api/admin/users; PUT /api/admin/users/{id}; GET /api/admin/audit |
| Settings | GET/PUT /api/admin/settings; GET /api/admin/integrations |

Content writes: `{payload, expectedRevision}` for updates; `{payload}` for creation. Layout writes: `{layout, expectedRevision}`. Publish: `{expectedRevision}`. Rollback: `{version, expectedRevision}`. A conflict returns 409; reload and review rather than blindly retrying stale data.

HTTP errors use `{detail: string}`. 401 means missing/invalid credentials; 403 means wrong role/profile/origin; 404 means unavailable record; 409 means version/state conflict; 422 means invalid input or failed integrity; 429 rate limit; 503 unavailable service/provider. There is no unauthenticated TV administration API.
