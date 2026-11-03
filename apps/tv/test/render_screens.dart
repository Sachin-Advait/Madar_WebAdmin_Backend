// Explicit visual-review renderer; not part of the normal *_test.dart suite.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madar_tv/application.dart';
import 'package:madar_tv/controller.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final icons = FontLoader('MaterialIcons')
      ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
    for (final entry in {
      'MadarSans': 'dmsans',
      'MadarArabic': 'notosansarabic',
    }.entries) {
      final loader = FontLoader(entry.key);
      loader.addFont(
        Future.value(
          ByteData.sublistView(
            File('assets/fonts/${entry.value}.ttf').readAsBytesSync(),
          ),
        ),
      );
      await loader.load();
    }
  });
  testWidgets('Render native TV review screens', (tester) async {
    await tester.binding.setSurfaceSize(const Size(1920, 1080));
    final c = TvController();
    await tester.runAsync(() => c.showDemo());
    await tester.pumpWidget(
      RepaintBoundary(
        key: const ValueKey('capture'),
        child: MadarApp(controller: c),
      ),
    );
    await tester.runAsync(() async {
      await precacheImage(
        const AssetImage('assets/madar-logo.png'),
        tester.element(find.byType(MadarApp)),
      );
    });
    for (final page in [
      'home',
      'info-hub',
      'info-meetings',
      'videos',
      'live-tv',
      'replay',
    ]) {
      c.navigate(page);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await expectLater(
        find.byKey(const ValueKey('capture')),
        matchesGoldenFile('../../../docs/screens/tv-$page.png'),
      );
    }
    await tester.binding.setSurfaceSize(const Size(1080, 1920));
    for (final page in ['videos', 'replay', 'live-tv', 'info-hub']) {
      c.navigate(page);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await expectLater(
        find.byKey(const ValueKey('capture')),
        matchesGoldenFile('../../../docs/screens/tv-$page-portrait.png'),
      );
    }
    c.bundle!['profile']['theme']['language'] = 'ar';
    c.navigate('videos');
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await expectLater(
      find.byKey(const ValueKey('capture')),
      matchesGoldenFile('../../../docs/screens/tv-videos-portrait-ar.png'),
    );
    await tester.pumpWidget(const SizedBox.shrink());
    c.dispose();
    await tester.binding.setSurfaceSize(null);
  });
}
