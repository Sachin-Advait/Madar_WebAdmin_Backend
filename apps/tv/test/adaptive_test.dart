import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madar_tv/application.dart';
import 'package:madar_tv/controller.dart';
import 'package:madar_tv/banner.dart';
import 'package:madar_tv/widgets.dart';

TvController makeController() {
  final data = jsonDecode(File('assets/demo.json').readAsStringSync());
  return TvController()
    ..demo = true
    ..bundle = Map<String, dynamic>.from(data['bundle'])
    ..operations = Map<String, dynamic>.from(data['operations']);
}

void main() {
  testWidgets('portrait Info Hub uses its extra height for direct content', (
    tester,
  ) async {
    final c = makeController()..page = 'info-hub';
    await tester.binding.setSurfaceSize(const Size(1920, 1080));
    await tester.pumpWidget(MadarApp(controller: c));
    await tester.pump();
    final panel = find.byKey(const ValueKey('hub-panel-content-info-meetings'));
    expect(tester.getSize(panel).height, 480);
    await tester.binding.setSurfaceSize(const Size(1080, 1920));
    await tester.pump();
    expect(tester.getSize(panel).height, greaterThanOrEqualTo(1100));
    expect(tester.getSize(panel).height, lessThanOrEqualTo(1200));
    final meetings = tester.getRect(
          find.byKey(const ValueKey('hub-panel-info-meetings')),
        ),
        queue = tester.getRect(
          find.byKey(const ValueKey('hub-panel-info-queue')),
        );
    expect(meetings.top, queue.top);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    c.dispose();
    await tester.binding.setSurfaceSize(null);
  });
  testWidgets(
    'long Live TV guide text grows the landscape banner without overflow',
    (tester) async {
      final c = makeController()..page = 'live-tv';
      final channel = c.bundle!['content']['channels'][0], now = DateTime.now();
      c.bundle!['content']['programmes'] = [
        {
          'id': 'long-guide',
          'channelId': channel['id'],
          'status': 'published',
          'title': 'A very long programme title covering international culture, innovation and community stories across the region',
          'description': 'A detailed programme description with the latest conversations, interviews and discoveries from around the region and beyond. This text should remain readable without pushing playback controls outside the banner.',
          'eventStart': now
              .subtract(const Duration(minutes: 20))
              .toIso8601String(),
          'eventEnd': now.add(const Duration(minutes: 40)).toIso8601String(),
        },
      ];
      await tester.pumpWidget(MadarApp(controller: c));
      for (final width in [900.0, 1000.0, 1920.0]) {
        await tester.binding.setSurfaceSize(Size(width, 600));
        await tester.pump();
        expect(tester.takeException(), isNull, reason: '$width logical pixels');
        final hero = find.byKey(const ValueKey('contextual-media-banner'));
        expect(tester.getSize(hero).height, greaterThanOrEqualTo(365));
        expect(
          tester.getSize(hero).height,
          lessThan(650),
          reason: 'Artwork must not stretch the hero and hide the media rows',
        );
        expect(find.byKey(const ValueKey('hero-play')), findsOneWidget);
      }
      await tester.pumpWidget(const SizedBox.shrink());
      c.dispose();
      await tester.binding.setSurfaceSize(null);
    },
  );
  testWidgets(
    'portrait reflows media and places the Arabic rail on the right',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(1080, 1920));
      final c = makeController();
      c.bundle!['profile']['theme']['language'] = 'ar';
      await tester.pumpWidget(MadarApp(controller: c));
      await tester.pump();
      expect(find.byKey(const ValueKey('side-navigation')), findsOneWidget);
      expect(
        tester.getCenter(find.byKey(const ValueKey('side-navigation'))).dx,
        greaterThan(900),
      );
      for (final page in ['videos', 'replay', 'live-tv', 'info-hub']) {
        c.navigate(page);
        await tester.pump(const Duration(milliseconds: 200));
        expect(tester.takeException(), isNull, reason: page);
        if (page != 'info-hub') {
          final banner = tester.widget<MediaBanner>(find.byType(MediaBanner));
          expect(banner.portrait, isTrue);
          expect(banner.compact, isTrue);
        }
      }
      await tester.pumpWidget(const SizedBox.shrink());
      c.dispose();
      await tester.binding.setSurfaceSize(null);
    },
  );
  testWidgets(
    'admin orientation override controls navigation independently of window ratio',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(1080, 1920));
      final c = makeController();
      c.config['experience'] = {'orientation': 'landscape'};
      await tester.pumpWidget(MadarApp(controller: c));
      await tester.pump();
      expect(find.byKey(const ValueKey('top-navigation')), findsOneWidget);
      c.config['experience'] = {'orientation': 'portrait'};
      c.changed();
      await tester.pump();
      expect(find.byKey(const ValueKey('side-navigation')), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      c.dispose();
      await tester.binding.setSurfaceSize(null);
    },
  );
  testWidgets(
    'Info Hub tabs render two direct sections without entering another page',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(1920, 1080));
      final c = makeController()..page = 'info-hub';
      await tester.pumpWidget(MadarApp(controller: c));
      await tester.pump();
      expect(
        find.byKey(const ValueKey('hub-panel-info-meetings')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('hub-panel-info-queue')),
        findsOneWidget,
      );
      final meetingsRect = tester.getRect(
            find.byKey(const ValueKey('hub-panel-info-meetings')),
          ),
          queueRect = tester.getRect(
            find.byKey(const ValueKey('hub-panel-info-queue')),
          );
      expect(meetingsRect.top, queueRect.top);
      expect(meetingsRect.right, lessThan(queueRect.left));
      await tester.tap(find.text('Updates'));
      await tester.pump();
      expect(c.page, 'info-hub');
      expect(
        find.byKey(const ValueKey('hub-panel-info-notices')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('hub-panel-info-alerts')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('hub-panel-info-meetings')),
        findsNothing,
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      c.dispose();
      await tester.binding.setSurfaceSize(null);
    },
  );
  testWidgets(
    'remote card focus changes contextual banner and its accessible heart saves that item',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(1920, 1080));
      final c = makeController()..page = 'videos';
      await tester.pumpWidget(MadarApp(controller: c));
      await tester.pump();
      final items = (c.bundle!['content']['videos'] as List)
          .where((r) => r['status'] == 'published')
          .toList();
      final card = find.byKey(ValueKey('card-videos-${items[1]['id']}')).first;
      final gesture = find
          .descendant(of: card, matching: find.byType(GestureDetector))
          .first;
      Focus.of(tester.element(gesture)).requestFocus();
      await tester.pump(const Duration(milliseconds: 200));
      expect(
        tester.widget<MediaBanner>(find.byType(MediaBanner)).item['id'],
        items[1]['id'],
      );
      final favourite = find.byKey(const ValueKey('hero-favourite'));
      await tester.ensureVisible(favourite);
      await tester.pump();
      final heartGesture = find
          .descendant(of: favourite, matching: find.byType(GestureDetector))
          .first;
      Focus.of(tester.element(heartGesture)).requestFocus();
      await tester.pump();
      await tester.sendKeyEvent(LogicalKeyboardKey.select);
      await tester.pump();
      expect(c.isFavourite('videos', items[1]['id']), isTrue);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      c.dispose();
      await tester.binding.setSurfaceSize(null);
    },
  );
  testWidgets(
    'portrait artwork and blank override fields use nonempty safe fallbacks',
    (tester) async {
      final c = makeController();
      final item = Map<String, dynamic>.from(c.bundle!['content']['videos'][0]);
      item.addAll({
        'bannerMode': 'override',
        'bannerTitle': 'Configured title',
        'bannerTitleAr': '',
        'landscapeImage': '',
        'portraitImage': '/art/culture.svg',
        'image': '/art/community.svg',
      });
      c.bundle!['profile']['theme']['language'] = 'ar';
      await tester.pumpWidget(
        MaterialApp(
          home: SingleChildScrollView(
            child: MediaBanner(
              controller: c,
              kind: 'videos',
              item: item,
              compact: true,
              portrait: true,
              onPlay: () {},
              onDetails: () {},
              onFavourite: () {},
            ),
          ),
        ),
      );
      await tester.pump();
      expect(find.text('Configured title'), findsOneWidget);
      expect(
        tester.widget<Artwork>(find.byType(Artwork)).url,
        '/art/culture.svg',
      );
      await tester.pumpWidget(const SizedBox.shrink());
      c.dispose();
    },
  );
  test('Replay playback requires an available completed broadcast and unexpired window', () {
    final now = DateTime.utc(2026, 11, 3, 12),
        item = <String, dynamic>{
          'status': 'published',
          'available': true,
          'eventEnd': '2026-11-03T11:00:00Z',
          'endAt': '2026-11-04T11:00:00Z',
        };
    expect(replayReady(item, now), isTrue);
    expect(replayReady({...item, 'available': false}, now), isFalse);
    expect(replayReady({...item, 'available': null}, now), isFalse);
    expect(
      replayReady({...item, 'eventEnd': '2026-11-03T13:00:00Z'}, now),
      isFalse,
    );
    expect(
      replayReady({...item, 'endAt': '2026-11-03T11:59:00Z'}, now),
      isFalse,
    );
  });
}
