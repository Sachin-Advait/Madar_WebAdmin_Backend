# Channel source and headend connector

The implemented connector accepts **operator-uploaded or pasted M3U, XMLTV and JSON exports**. It works with a vendor export without assuming a particular Chinese headend brand. All imports are reviewed as drafts. A scheduled vendor API adapter requires the actual model, firmware, API specification and sample export; it is not claimed as implemented.

Open **Admin → Integrations → Source import**. Choose a permanent source ID such as `building-headend`, choose the format, upload or paste the export, preview the changes, then apply. Review drafts and publish through Content Manager. Import the channel playlist before its XMLTV programme guide, using the **same source ID**.

## Supported contract

Both routes require an administrator session and the existing `X-Madar-Request: 1` CSRF header. The server never fetches a submitted URL. Provider URLs remain in server-side storage; they are excluded from TV release bundles and import previews. An authorized playback request resolves the reference into the playback URL.

| Endpoint | Request | Result |
|---|---|---|
| `POST /api/admin/source-import/preview` | `{sourceId, format, text}` | `{sourceId, format, digest, counts, items, warnings}` |
| `POST /api/admin/source-import/apply` | Same input plus the returned `digest` | `{created, updated, unchanged, ids, warnings}` |

`format` is `m3u`, `xmltv` or `json`. `sourceId` matches `^[a-z][a-z0-9-]{1,63}$`. `text` is at most **750 KiB UTF-8**, with **1–500 records** per import. Preview items contain `externalId`, `kind`, `resourceId`, `payload`, `action` (`create`, `update`, `unchanged`) and optional `artworkPending`. Counts contain `total`, `create`, `update`, `unchanged`. Apply IDs are `{kind, id, externalId}`.

Each source is capped at 100,000 mapped records. Delete obsolete guide records through Content Manager before exceeding this limit. Preview loads only the current batch and its referenced channels, at most 1,000 mappings. Applying a batch removes superseded source-media URL versions that no resource draft or publication uses; URLs still used by published content are retained.

The digest covers source text, current mapped resource revisions and custom field definitions. If the operator changes content after preview, or the input changes, apply returns **409** and requires a new preview. Apply is one transaction: the source and relevant schema/content rows are locked; a failure leaves no partial import. Imports do not create releases or acknowledgements because publication has not occurred.

## M3U mapping

```m3u
#EXTM3U
#EXTINF:-1 tvg-id="news-en" tvg-chno="12" group-title="News",News HD
https://media.example.com/live/news/index.m3u8
```

| Export field | MADAR field |
|---|---|
| `tvg-id` (required and stable) | Source external ID and `epgId` |
| Text after EXTINF comma | Channel `title` |
| `tvg-name` | Fallback title |
| `tvg-chno` or `channel-number` | Integer channel `number` |
| `group-title` | `category` |
| Following HTTPS URL | Immutable server-side reference in `streamRef` |
| `tvg-logo` | Source metadata only; upload verified artwork in MADAR |
| `catchup` / `catchup-source` | Warning only; does not fabricate playable recordings |

Use double-quoted playlist attributes. Each EXTINF entry must have exactly one media URL. Missing stable IDs and duplicate IDs are rejected. Generic VLC options and comments are ignored; custom request headers, UDP, RTP, RTSP and HTTP are not converted into HTTPS automatically. Use a media gateway when the headend cannot provide a supported HTTPS playback stream. Stream codec compatibility still needs verification on the actual Android TV hardware.

## XMLTV mapping

```xml
<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <programme channel="news-en"
    start="20261103110000 +0400" stop="20261103113000 +0400">
    <title lang="en">Morning News</title>
    <title lang="ar">الأخبار الصباحية</title>
    <desc>Headlines and local updates.</desc>
    <category>News</category>
  </programme>
</tv>
```

`channel` resolves to a channel already imported under this source ID. Programme `id`, when supplied, is the stable external programme ID; otherwise it is formed from channel ID and normalized start time. A schedule moving to a different start time therefore creates a new programme unless the export supplies a stable ID. Existing programmes absent from a later import are **not deleted**. Review and retire obsolete guide entries through Content Manager.

`start` and `stop` require year, month, day, hour and minute, with optional seconds and numeric timezone. Missing timezone means UTC. Dates are validated and converted to ISO UTC; stop must follow start. English and Arabic titles/descriptions and the first category are imported. XMLTV channel definitions alone do not create stream URLs. EPG metadata never creates a replay or enables recording.

The reader supports a bounded XMLTV subset: flat text fields, attributes, comments, CDATA, predefined XML entities and numeric character references. DTDs, entity declarations, external references, namespaces, other processing instructions and malformed XML are rejected. Maximum XML depth is 12 and maximum element count is 25,000. No entity expansion, filesystem reads or network requests occur. Remove a vendor's `DOCTYPE` before importing. This is not a general XML parser or full XMLTV validator.

## JSON mapping for VOD, radio and actual Catch-Up

JSON accepts an array or `{ "items": [...] }`:

```json
{
  "items": [
    {
      "kind": "channels",
      "externalId": "news-en",
      "mediaUrl": "https://media.example.com/live/news/index.m3u8",
      "payload": {"title": "News HD", "number": 12, "category": "News"}
    },
    {
      "kind": "replay",
      "externalId": "news-20261103-1100",
      "channelExternalId": "news-en",
      "mediaUrl": "https://media.example.com/replay/news-20261103-1100.mp4",
      "payload": {
        "title": "Morning News",
        "available": true,
        "eventStart": "2026-11-03T07:00:00Z",
        "eventEnd": "2026-11-03T07:30:00Z",
        "startAt": "2026-11-03T07:30:00Z",
        "endAt": "2026-11-10T07:30:00Z",
        "durationSeconds": 1800
      }
    }
  ]
}
```

Supported kinds are `channels`, `videos`, `radio`, `replay`, `programmes`. Each record needs a stable `externalId` and schema-valid `payload`. Media kinds require `mediaUrl`. Programme/replay records require `channelExternalId`; a channel earlier or later in the same JSON batch is resolved before apply. Explicit replay additionally requires `available:true`, `startAt` and `endAt`; these are availability dates, while `eventStart` and `eventEnd` are original broadcast dates. A valid provider URL must correspond to an actual playable recording. MADAR does not record streams or invent provider-specific Catch-Up URL templates.

`artworkUrl` is optional source metadata, never a directly published image. Supply image bytes using the existing scanned artwork upload, then select wide/portrait artwork in Content Manager. `streamRef`, `videoRef`, `stationRef`, `providerRef`, MADAR IDs, custom fields and banner overrides are managed by MADAR and are not accepted from a JSON import. New imported records start as drafts visible to the standard profile set; adjust audiences during review. Custom field requirements apply to imported drafts too.

## Update and ownership rules

- Identity is `(sourceId, kind, externalId)`, mapped to a deterministic resource ID. Repeat imports update the same item and an unchanged import leaves its revision unchanged.
- Each mapping stores the previous imported values. A new provider value replaces a field only when the operator has not changed that field since the last import, or when the field is absent. Operator changes, audience choices, custom fields and banner overrides are retained.
- Source-controlled fields removed from the next export are removed only when their current value still matches the previous import. Omission never deletes whole MADAR records.
- Changed drafts are marked `draft`. Existing published payloads and TV releases remain unchanged until explicit publication.
- A stream reference hashes source ID plus URL. URL changes create a new immutable server-side reference in the draft; the old published reference keeps its URL. Keep source IDs stable across exports.
- No stream/artwork URL is fetched by the API. HTTPS is required, URL user-info credentials and fragments are rejected, and loopback/link-local/multicast endpoints are rejected. Private LAN HTTPS addresses are allowed for on-premise headends. DNS/certificate/network reachability is a deployment responsibility.
- Query-string credentials, if required by a provider, are retained in the server database and returned only through authorized playback. Prefer short-lived URLs and a vendor gateway for token refresh; static import does not refresh expiring signatures.

## Developer integration and verification

`source-import.mjs` parses and plans imports, merges preserved fields, and exports `importedMediaUrl(db, reference)`. `source-import-routes.mjs` owns authorized preview/apply and the transaction. Migration `005_source_import.sql` creates `source_imports`, `source_bindings` and `source_media`. These tables contain source metadata and playback endpoints; do not expose them through general TV APIs.

Nine integration tests in `services/api/tests/source-import.test.mjs` cover draft-only/idempotent M3U import; immutable published playback and operator overrides; preview concurrency guards; XMLTV IDs/timezones; explicit JSON replay; malicious/malformed/oversized inputs; administrator role boundaries; retired URL cleanup; and the checked-in examples. Run `node --test services/api/tests/source-import.test.mjs` from the project root. Live provider playback, schedules, token refresh and codec acceptance need the actual headend and TV.

Format references: [XMLTV DTD](https://github.com/XMLTV/xmltv/blob/master/xmltv.dtd), [XML 1.0](https://www.w3.org/TR/xml/). The connector intentionally accepts a smaller, bounded subset than these general formats.

Try the coherent fictional exports in `docs/examples/source-channels.m3u`, then `source-guide.xml`, then `source-catalogue.json`, all with source ID `example-headend`. They use reserved `.example` URLs and do not play actual streams. Dates are fixed examples; adjust availability dates before using them as current content.
