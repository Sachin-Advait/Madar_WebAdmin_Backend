> **Version 4.0 supplement:** [Complete developer feature specification](FEATURE_SPEC_V4.md) documents the adaptive layout, banner, source-import and device-preference APIs. [Release acceptance](RELEASE_ACCEPTANCE_V4.md) records remaining deployment and hardware checks.

# MADAR 4.0 · Flutter TV developer guide

`apps/tv` is a native Android TV/touch application, with Android launcher and Leanback launcher entries. It is separate from the React TV reference player. It targets Android API 24+ and uses Flutter **3.47.9 / Dart 3.13.7** in this verification run. Dependencies are pinned in `pubspec.yaml` and resolved in `pubspec.lock`.

## Run and pair

```sh
cd apps/tv
flutter pub get --enforce-lockfile
flutter analyze
flutter test
flutter run --dart-define=MADAR_API_URL=https://tv.example.com
```

The first screen accepts the HTTPS server origin and a screen name. Request pairing, then approve the displayed code in React Admin → Screens & Devices and select a profile/page. Pairing expires after 10 minutes. The approved key is stored with `flutter_secure_storage`, using the Android secure-storage implementation. The app never contains an administrator password.

For an unpaired sample experience:

```sh
flutter run --dart-define=MADAR_DEMO=true
```

This enables an explicit **Explore sample experience** button and a persistent sample label. It reads `assets/demo.json`, generated from the real backend seed with `npm run demo:tv` at the repository root. It has 145 published records. Production gets content from `/api/app/sync`; changing the bundled demo file never changes a paired TV. Sample media references need a real provider mapping or uploaded MP4/MP3 before playback works.

Production builds require HTTPS. The development-only `MADAR_ALLOW_HTTP=true` flag allows a local HTTP origin in Dart; Android's debug manifest must also explicitly permit cleartext for a local-network test. Keep production cleartext disabled. Use a reachable LAN address or Android emulator host address, not the developer PC's `localhost` from a physical TV.

## TV experience

| Destination | Dynamic content |
|---|---|
| Home | Featured banners, live channels, videos, notices, events, radio, Info Hub links and optional operational widgets |
| Live TV | Managed channel categories, channel cards, programme records and playback |
| Videos | Managed categories, uploaded/provider videos, artwork, duration and details |
| Replay | Provider-supported Catch-Up records; no PVR or personal recording |
| Radio | Station categories, metadata and play/pause controls |
| Info Hub | Meeting Rooms, Queue Management, Official Notices, Events & Training, Services & Information, Visitor Guide, Media Highlights, Priority Alerts |

Published layouts control enabled widgets, order, category, count, compact presentation, hero rotation and operational grid coordinates. Supported widget types are explicitly validated; unknown types prevent Applied acknowledgement. Info Hub detail views show the standard fields and all custom fields marked Show on TV. Meeting subjects are redacted on the server for public/VIP/signage audiences. Uploaded PDFs open in an Android-native renderer with previous/next controls. HTTPS service/registration/direction links display QR codes for a companion phone; they do not expose TV credentials.

The adaptive shell uses the actual available width/height with a profile/device orientation override. Landscape uses top navigation; portrait uses a side rail, on the right for Arabic. Info Hub groups its eight sections into four configurable two-item tabs. Media pages include contextual artwork, Continue Watching, recommendations, favourites and available Replay filters. See [the v4 feature contract](FEATURE_SPEC_V4.md) for the exact policies and banner fallback order.

## Remote and touch

Arrow/D-pad keys move focus through controls with a visible bronze focus outline. Center/Select, Enter and Space activate focused controls. Touch activates the same buttons. Back returns from detail/player views, then from Info Hub subsections to the hub, then Home. At Home, the system can exit the app. Media Play/Pause, rewind and fast-forward are handled by the player; on-screen controls remain available. The PDF viewer supports remote page buttons and touch pan/zoom. These interactions have widget-test coverage; validate the actual remote key map on each target TV model.

Use the focusable heart on a media card or hero, or open an item and choose **Save favourite**. Both are reachable by D-pad and touch; a hold-OK shortcut is not required or implemented. The heart in the main navigation opens this TV's saved items. Favourites are shared by users of that device, not personal accounts. Offline changes queue the final add/remove intent and retry idempotently. Server responses filter removed, expired and profile-inaccessible content. Disabling a device blocks its API access.

## Resume playback and device interests

`off` keeps no viewing history; `session` keeps it only in memory; `device` persists bounded progress and synchronizes it with the server. Public/VIP/signage profiles default to history off. Videos and available Replay items can resume three seconds before their checkpoint or start over; the configured completion threshold defaults to 95%. Source revision changes invalidate old progress. Live channels and radio do not resume from a VOD checkpoint.

Favourites and history are device-wide, not personal accounts. Recommendations rank eligible content using watched engagement, completion, favourites, categories, tags and language, with time decay and category diversity. This is a lightweight explainable ranking algorithm, with no external LLM. Reset actions invalidate in-flight writes using preference epochs. Details, retention bounds and APIs are in [FEATURE_SPEC_V4.md](FEATURE_SPEC_V4.md).

## Delivery and offline behaviour

1. Poll config/sync every 10 seconds while connected. This gives roughly 10-second detection plus transfer/render time, not a zero-latency guarantee. The server's Redis Stream pending entry stays outstanding until Applied.
2. Validate schema, widget types, asset paths, limits and SHA-256 of the exact UTF-8 `bundleText`.
3. Send Received. Stream each asset into a temporary file, enforce size bounds, then verify its SHA-256. Reject a corrupt or over-capacity release. Uploaded media is included in the manifest; media assets can play from the verified local cache.
4. Send Downloaded and persist a complete immutable cache checkpoint. Retain at most two release checkpoints. Up to 300 MB per release means roughly 600 MB plus temporary download headroom; provision at least 1 GB of free application storage.
5. Render the release, then send Applied after the frame callback. An application rendering error blocks Applied. Repeated delivery/ACK requests are safe. The server commits Applied in PostgreSQL before the Redis worker XACKs/XDELs the stream entry.
6. Continue the last verified release when offline. Cached access expires after 24 hours without successful contact. Revocation clears credentials/content/favourites after the next successful server response. An entirely offline device cannot discover a new revocation before reconnecting or that expiry.

Operational meeting/queue data refreshes during sync and is cleared after prolonged failed refreshes; disconnected data is not labelled live. Publication content also enforces start/expiry times locally. A software rendering acknowledgement does not prove the physical panel is powered on, visible or free of hardware faults.

## Code map

| File | Responsibility |
|---|---|
| `lib/api.dart` | Authenticated HTTPS API, error handling, bounded streamed asset downloads; authenticated redirects are refused |
| `lib/protocol.dart` | Release/schema/widget/checksum validation and content visibility |
| `lib/cache.dart` | Verified asset staging, immutable checkpoints, identity-bound recovery and cleanup |
| `lib/controller.dart` | Pairing, sync, heartbeat, ACK ordering, offline expiry and favourites |
| `lib/adaptive.dart`, `lib/banner.dart` | Orientation-aware shell, paired Info Hub tabs, contextual banner metadata and artwork layout |
| `lib/playback_state.dart` | Revision-bound progress, ordered session/checkpoint state and local recommendation fallback |
| `lib/experience.dart` | Six destinations, eight Info Hub pages and registered widget rendering |
| `lib/widgets.dart` | Shared touch/remote buttons, focus styling and artwork |
| `lib/details.dart`, `player.dart` | Details, custom fields, favourite action, media controls and QR links |
| `lib/pdf_viewer.dart`, Android `MainActivity.kt` | Bounded PDF rendering through Android's `PdfRenderer`; no external native PDF dependency |

## Build and release

```sh
flutter build apk --debug
flutter build appbundle --release --dart-define=MADAR_API_URL=https://tv.example.com
```

Supply `MADAR_KEYSTORE_PATH`, `MADAR_KEYSTORE_PASSWORD`, `MADAR_KEY_ALIAS`, and `MADAR_KEY_PASSWORD` to Gradle for organization release signing. The release configuration does not silently use a debug signing key. Do not distribute an unsigned artifact. Set your organization application ID and review launcher/banner/store assets before publication. Android Studio/SDK, Java 17+, the required Android platforms and SDK licences are prerequisites. The included CI job builds a debug APK to catch Kotlin/Android integration errors when run on a configured GitHub runner.

This delivery's verification does not include a signed APK, Play Store publication, physical remote/codec/DRM testing or a deployed provider feed. The media adapter supports mapped HTTPS streams and uploaded media; provider-specific DRM and Catch-Up URL generation require the actual provider contract. Native PDF rendering still needs an Android build/device acceptance check; widget tests exercise Flutter controls, not Android's PDF engine.

Official implementation references: [Flutter focus](https://docs.flutter.dev/ui/interactivity/focus), [platform channels](https://docs.flutter.dev/platform-integration/platform-channels), [Android TV setup](https://developer.android.com/training/tv/get-started/create), [Android PdfRenderer](https://developer.android.com/reference/android/graphics/pdf/PdfRenderer).
