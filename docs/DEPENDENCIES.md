# Direct runtime libraries

Installed versions from the verified lockfile. The lockfile pins transitive dependencies. The dependency audit returned zero known advisories after updating sharp to 0.35.5.

| Workspace | Library | Version | License |
|---|---|---|---|
| apps/admin | @dnd-kit/core | 6.3.1 | MIT |
| apps/admin | @dnd-kit/sortable | 10.0.0 | MIT |
| apps/admin | @dnd-kit/utilities | 3.2.2 | MIT |
| apps/admin | @fontsource/dm-sans | 5.3.0 | OFL-1.1 |
| apps/admin | @fontsource/noto-sans-arabic | 5.3.0 | OFL-1.1 |
| apps/admin | @rjsf/core | 6.11.0 | Apache-2.0 |
| apps/admin | @rjsf/validator-ajv8 | 6.11.0 | Apache-2.0 |
| apps/admin | @tanstack/react-query | 5.105.2 | MIT |
| apps/admin | hls.js | 1.7.4 | Apache-2.0 |
| apps/admin | idb | 8.0.4 | ISC |
| apps/admin | lucide-react | 0.468.0 | ISC |
| apps/admin | react | 19.3.1 | MIT |
| apps/admin | react-dom | 19.3.1 | MIT |
| apps/admin | react-grid-layout | 2.3.0 | MIT |
| apps/admin | react-hook-form | 7.91.0 | MIT |
| apps/admin | react-resizable | 3.2.0 | MIT |
| apps/admin | socket.io-client | 4.8.4 | MIT |
| services/api | @electric-sql/pglite | 0.3.16 | Apache-2.0 |
| services/api | @socket.io/redis-adapter | 8.3.0 | MIT |
| services/api | ajv | 8.20.0 | MIT |
| services/api | ajv-formats | 3.0.1 | MIT |
| services/api | cookie-parser | 1.4.7 | MIT |
| services/api | express | 5.3.0 | MIT |
| services/api | express-rate-limit | 8.7.2 | MIT |
| services/api | file-type | 21.3.4 | MIT |
| services/api | helmet | 8.3.0 | MIT |
| services/api | multer | 2.5.0 | MIT |
| services/api | pg | 8.23.1 | MIT |
| services/api | pino | 10.4.0 | MIT |
| services/api | pino-http | 11.0.0 | MIT |
| services/api | rate-limit-redis | 4.3.1 | MIT |
| services/api | redis | 5.12.1 | MIT |
| services/api | sharp | 0.35.5 | Apache-2.0 |
| services/api | socket.io | 4.8.4 | MIT |
| services/api | zod | 4.6.7 | MIT |

Fonts are bundled locally. Development tooling is pinned in package-lock.json. Third-party notices remain available in each installed package.

## Native Flutter client

Verified using Flutter 3.47.9 and Dart 3.13.7. The native client's exact resolved dependency graph is in `apps/tv/pubspec.lock`. The JavaScript npm audit does not audit this separate Dart dependency graph.

| Direct package | Version | Purpose |
|---|---|---|
| http | 1.6.0 | Authenticated API and streamed downloads |
| crypto | 3.0.8 | SHA-256 release and asset verification |
| flutter_secure_storage | 11.2.0 | Platform-protected device credentials |
| path_provider | 2.1.6 | App-private cache paths |
| video_player | 2.14.1 | Native video/audio playback |
| flutter_svg | 2.3.2 | Bundled decorative sample artwork |
| qr_flutter | 4.1.0 | Service, registration and direction QR links |
| flutter / flutter_localizations | Flutter SDK | UI, localization and platform integration |
| flutter_test / flutter_lints | SDK / 6.x | Tests and static analysis |

PDF rendering uses Android's built-in `PdfRenderer` through a method channel. No external native PDF engine is required. DM Sans and Noto Sans Arabic font files and their OFL licences are included in `apps/tv/assets/fonts`. Preserve dependency licences when distributing binaries.
