# MADAR native TV app

Flutter Android TV and touch client, version 3.0.0.

Read [the Flutter developer guide](../../docs/FLUTTER_GUIDE.md) for pairing, API configuration, remote navigation, favourites, cache behaviour, Android setup and organization signing.

```sh
flutter pub get --enforce-lockfile
flutter analyze
flutter test
flutter run --dart-define=MADAR_DEMO=true
```

Production reads the paired backend; the explicit sample experience reads `assets/demo.json`. Regenerate samples from the repository root using `npm run demo:tv`.

A native Android build, signed release and target-device acceptance are required before rollout. See [verification](../../docs/VERIFICATION.md) and [production acceptance](../../docs/PRODUCTION_READINESS.md).
