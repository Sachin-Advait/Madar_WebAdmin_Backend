import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:madar_tv/api.dart';
import 'package:madar_tv/controller.dart';
import 'package:madar_tv/details.dart';
import 'package:madar_tv/playback_state.dart';

const revision =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
Map<String, dynamic> media(String id, {String category = 'Learning'}) => {
  'id': id,
  'title': id,
  'mediaRevision': revision,
  'status': 'published',
  'category': category,
};
Map<String, dynamic> catalogue(String mode) => {
  'profile': {
    'profileType': 'employee',
    'theme': {'language': 'en'},
    'experience': {'historyMode': mode, 'recommendations': true},
  },
  'pages': {'videos': {}, 'replay': {}, 'home': {}},
  'content': {
    'videos': [media('a'), media('b'), media('c', category: 'Sport')],
    'replay': [],
  },
};
http.Response reply(Object value, [int status = 200]) => http.Response(
  jsonEncode(value),
  status,
  headers: {'content-type': 'application/json'},
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late TvController tv;
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    tv = TvController()
      ..bundle = catalogue('device')
      ..server = 'https://tv.example.test';
  });
  tearDown(() => tv.dispose());
  void connect(Future<http.Response> Function(http.Request) handler) {
    tv.api?.close();
    tv.api = MadarApi(
      tv.server,
      deviceKey: 'screen-key',
      client: MockClient(handler),
    );
  }

  Map<String, dynamic> progress(double seconds, {DateTime? at}) => {
    'kind': 'videos',
    'id': 'a',
    'mediaRevision': revision,
    'positionSeconds': seconds,
    'durationSeconds': 100.0,
    'completed': seconds >= 95,
    'updatedAt': (at ?? DateTime.now()).toUtc().toIso8601String(),
  };

  test(
    'media revision controls resume; completion and three-second rewind work',
    () {
      final memory = PlaybackMemory(), item = media('a'), h = PlaybackMemory();
      expect(h.progress, isEmpty);
      final handle = memory.begin('videos', item);
      memory.record(handle, 42, 100);
      expect(
        memory.resumeSeconds('videos', {...item, 'title': 'Edited title'}),
        39,
      );
      expect(
        memory.forItem('videos', {...item, 'mediaRevision': 'new'}),
        isNull,
      );
      memory.record(handle, 95, 100);
      expect(memory.resumeSeconds('videos', item), 0);
    },
  );

  test('old player cannot overwrite a later player or reset state', () {
    final memory = PlaybackMemory();
    final older = memory.begin('videos', media('a'));
    final latest = memory.begin('videos', media('a'));
    memory.record(latest, 18, 100);
    expect(memory.record(older, 70, 100), isNull);
    expect(memory.forItem('videos', media('a'))!['positionSeconds'], 18);
    memory.clear();
    expect(memory.record(latest, 20, 100), isNull);
  });

  test(
    'off policy stores no history and session policy never uploads history',
    () async {
      var requests = 0;
      connect((_) async {
        requests++;
        return reply({});
      });
      tv.bundle = catalogue('off');
      var h = await tv.beginPlayback('videos', media('a'));
      await tv.checkpoint(h, 50, 100, upload: true);
      expect(tv.progressFor('videos', media('a')), isNull);
      tv.bundle = catalogue('session');
      h = await tv.beginPlayback('videos', media('a'));
      await tv.checkpoint(h, 50, 100, upload: true);
      expect(tv.progressFor('videos', media('a'))!['positionSeconds'], 50);
      expect(requests, 0);
      final saved = await tv.storage.read(key: 'playback-state');
      expect(
        saved == null || (jsonDecode(saved)['progress'] as List).isEmpty,
        isTrue,
      );
    },
  );

  test(
    'device checkpoint uses fenced session and strictly increasing sequence',
    () async {
      final writes = <Map>[];
      connect((r) async {
        if (r.method == 'POST') {
          expect(r.headers['X-Preferences-Epoch'], '0');
          return reply({'tracking': true, 'sessionId': 's1', 'epoch': 0});
        }
        writes.add(jsonDecode(r.body));
        return reply({'ok': true});
      });
      final h = await tv.beginPlayback('videos', media('a'));
      await tv.checkpoint(h, 10, 100);
      await tv.checkpoint(h, 15, 100, upload: true);
      expect(writes, hasLength(1));
      expect(writes.single['sequence'], 2);
      expect(writes.single['positionSeconds'], 15);
      expect(tv.progressQueue, isEmpty);
    },
  );

  test('admin epoch clears all local intents and older responses cannot restore them', () async {
    tv.favourites.add('videos/a');
    tv.favouriteQueue['videos/a'] = true;
    final h = tv.playbackMemory.begin('videos', media('a'));
    tv.playbackMemory.record(h, 40, 100);
    expect(await tv.observePreferencesEpoch(2), isTrue);
    expect(tv.favourites, isEmpty);
    expect(tv.favouriteQueue, isEmpty);
    expect(tv.playbackMemory.progress, isEmpty);
    expect(await tv.observePreferencesEpoch(1), isFalse);
    expect(tv.preferencesEpoch, 2);
    connect(
      (_) async => reply({
        'epoch': 1,
        'policy': {'historyMode': 'device'},
        'progress': [progress(60)],
      }),
    );
    await tv.syncPreferences();
    expect(tv.playbackMemory.progress, isEmpty);
    expect(tv.preferencesEpoch, 2);
  });

  test('rapid favourite toggles serialize network writes and preserve final intent', () async {
    final first = Completer<http.Response>();
    final methods = <String>[];
    connect((r) async {
      methods.add(r.method);
      if (methods.length == 1) return first.future;
      return reply({});
    });
    final add = tv.toggleFavourite('videos', 'a');
    while (methods.isEmpty) {
      await Future<void>.delayed(Duration.zero);
    }
    await tv.toggleFavourite('videos', 'a');
    expect(methods, ['PUT']);
    first.complete(reply({}));
    await add;
    await tv.flushFavourites();
    expect(methods, ['PUT', 'DELETE']);
    expect(tv.favourites, isEmpty);
    expect(tv.favouriteQueue, isEmpty);
    final stored = jsonDecode((await tv.storage.read(key: 'favourites'))!);
    expect(stored['items'], isEmpty);
    expect(stored['queue'], isEmpty);
  });

  test(
    'rejected old checkpoint cannot erase a newer session progress or queue',
    () async {
      final oldWrite = Completer<http.Response>();
      var posts = 0, putStarted = false;
      connect((r) async {
        if (r.method == 'POST') {
          return reply({
            'tracking': true,
            'sessionId': 's${++posts}',
            'epoch': 0,
          });
        }
        if (r.url.path.endsWith('/s1')) {
          putStarted = true;
          return oldWrite.future;
        }
        return reply({});
      });
      final older = await tv.beginPlayback('videos', media('a'));
      final flushing = tv.checkpoint(older, 70, 100, upload: true);
      while (!putStarted) {
        await Future<void>.delayed(Duration.zero);
      }
      final newer = await tv.beginPlayback(
        'videos',
        media('a'),
        startOver: true,
      );
      await tv.checkpoint(newer, 5, 100);
      tv.endPlayback(newer);
      oldWrite.complete(reply({'detail': 'superseded'}, 409));
      await flushing;
      expect(tv.progressFor('videos', media('a'))!['positionSeconds'], 5);
      expect(tv.progressQueue.values.single['sessionId'], 's2');
    },
  );

  test(
    'closed offline playback keeps newer local resume when server is older',
    () async {
      connect((_) async => throw const SocketException('offline'));
      final h = await tv.beginPlayback('videos', media('a'));
      await tv.checkpoint(h, 60, 100);
      tv.endPlayback(h);
      expect(tv.progressQueue, isEmpty);
      connect(
        (r) async => reply(
          r.url.path.endsWith('recommendations')
              ? {'items': []}
              : {
                  'epoch': 0,
                  'policy': {'historyMode': 'device'},
                  'progress': [
                    progress(
                      20,
                      at: DateTime.now().subtract(const Duration(hours: 1)),
                    ),
                  ],
                },
        ),
      );
      await tv.syncPreferences();
      expect(tv.progressFor('videos', media('a'))!['positionSeconds'], 60);
    },
  );

  test(
    'reset survives offline and suppresses old writes until server confirms',
    () async {
      connect((_) async => throw const SocketException('offline'));
      await tv.resetPreferences();
      final persisted = jsonDecode(
        (await tv.storage.read(key: 'playback-state'))!,
      );
      expect(persisted['resetPending'], isTrue);
      final calls = <String>[];
      connect((r) async {
        calls.add('${r.method} ${r.url.path}');
        return reply(
          r.method == 'DELETE'
              ? {'ok': true}
              : r.url.path.endsWith('recommendations')
              ? {'items': []}
              : {
                  'epoch': 1,
                  'policy': {'historyMode': 'device'},
                  'progress': [],
                },
        );
      });
      await tv.syncPreferences();
      expect(calls.first, 'DELETE /api/app/preferences');
      expect(tv.preferencesEpoch, 1);
      expect(
        jsonDecode(
          (await tv.storage.read(key: 'playback-state'))!,
        )['resetPending'],
        isFalse,
      );
    },
  );

  test(
    'session recommendations exclude expired unavailable and future replay',
    () async {
      tv.bundle = catalogue('session');
      tv.bundle!['content']['replay'] = [
        {
          ...media('no'),
          'available': false,
          'eventEnd': DateTime.now()
              .subtract(const Duration(hours: 1))
              .toIso8601String(),
        },
        {
          ...media('future'),
          'available': true,
          'eventEnd': DateTime.now()
              .add(const Duration(hours: 1))
              .toIso8601String(),
        },
        {
          ...media('expired'),
          'available': true,
          'eventEnd': DateTime.now()
              .subtract(const Duration(hours: 1))
              .toIso8601String(),
          'endAt': DateTime.now()
              .subtract(const Duration(minutes: 1))
              .toIso8601String(),
        },
        {
          ...media('yes'),
          'available': true,
          'eventEnd': DateTime.now()
              .subtract(const Duration(hours: 1))
              .toIso8601String(),
        },
      ];
      final h = await tv.beginPlayback('videos', media('a'));
      await tv.checkpoint(h, 50, 100);
      expect(tv.recommendations.map((r) => r['id']), contains('yes'));
      expect(
        tv.recommendations.map((r) => r['id']),
        isNot(anyOf(contains('no'), contains('future'), contains('expired'))),
      );
      expect(tv.recommendations.first['reason'], contains('Local suggestion'));
    },
  );

  test('concurrent epoch observations keep the greatest epoch', () async {
    final older = tv.observePreferencesEpoch(1);
    final newer = tv.observePreferencesEpoch(2);
    expect(await older, isFalse);
    expect(await newer, isTrue);
    expect(tv.preferencesEpoch, 2);
    final saved = jsonDecode((await tv.storage.read(key: 'playback-state'))!);
    expect(saved['epoch'], 2);
  });

  test('reset during favourite flush cannot send old remaining items under new epoch', () async {
    final first = Completer<http.Response>();
    final paths = <String>[];
    connect((r) async {
      paths.add(r.url.path);
      expect(r.headers['X-Preferences-Epoch'], '0');
      return first.future;
    });
    tv.favouriteQueue.addAll({'videos/a': true, 'videos/b': true});
    final flushing = tv.flushFavourites();
    while (paths.isEmpty) {
      await Future<void>.delayed(Duration.zero);
    }
    await tv.observePreferencesEpoch(1);
    first.complete(reply({}));
    await flushing;
    expect(paths, ['/api/app/favourites/videos/a']);
    expect(tv.favouriteQueue, isEmpty);
    expect(tv.favourites, isEmpty);
  });

  test('stale favourite GET cannot undo a newer local toggle', () async {
    final get = Completer<http.Response>();
    connect((r) async => r.method == 'GET' ? get.future : reply({}));
    final refreshing = tv.refreshFavourites();
    await tv.toggleFavourite('videos', 'a');
    get.complete(reply([]));
    await refreshing;
    expect(tv.favourites, contains('videos/a'));
  });

  test(
    'local playback ownership stays unique across new controller memories',
    () {
      final first = PlaybackMemory().begin('videos', media('a'));
      final afterRestart = PlaybackMemory().begin('videos', media('a'));
      expect(first.generation, afterRestart.generation);
      expect(first.localId, isNot(afterRestart.localId));
    },
  );

  test(
    'current config restriction blocks cached media before new bundle arrives',
    () {
      tv.bundle!['profile']['id'] = 'staff';
      tv.config = {
        'profile': {
          'id': 'staff',
          'profileType': 'employee',
          'allowedSections': ['home'],
        },
      };
      expect(tv.playableItem('videos', media('a')), isNull);
      tv.config['profile']['allowedSections'] = ['*'];
      expect(tv.playableItem('videos', media('a')), isNotNull);
      tv.config['profile']['id'] = 'public';
      expect(tv.playableItem('videos', media('a')), isNull);
      tv.buildLocalRecommendations();
      expect(tv.recommendations, isEmpty);
    },
  );

  test('Replay eligibility uses current availability even if details card is stale', () {
    final before = {
      ...media('r'),
      'available': true,
      'eventEnd': DateTime.now()
          .subtract(const Duration(hours: 1))
          .toIso8601String(),
    };
    tv.bundle!['content']['replay'] = [
      {...before, 'available': false},
    ];
    expect(tv.playableItem('replay', before), isNull);
    tv.bundle!['content']['replay'] = [before];
    expect(tv.playableItem('replay', before), isNotNull);
  });

  test(
    'late preferences and favourite replies cannot cross device identities',
    () async {
      final preferenceReply = Completer<http.Response>(),
          favouriteReply = Completer<http.Response>();
      connect(
        (r) async => r.url.path.endsWith('preferences')
            ? preferenceReply.future
            : favouriteReply.future,
      );
      final preferences = tv.syncPreferences();
      final favourites = tv.refreshFavourites();
      await Future<void>.delayed(Duration.zero);
      tv.api = MadarApi(
        tv.server,
        deviceKey: 'another-screen',
        client: MockClient((_) async => reply({})),
      );
      preferenceReply.complete(
        reply({
          'epoch': 5,
          'policy': {'historyMode': 'device'},
          'progress': [progress(80)],
        }),
      );
      favouriteReply.complete(
        reply([
          {'kind': 'videos', 'id': 'a'},
        ]),
      );
      await preferences;
      await favourites;
      expect(tv.preferencesEpoch, 0);
      expect(tv.favourites, isEmpty);
      expect(tv.playbackMemory.progress, isEmpty);
    },
  );

  testWidgets(
    'failed playback exposes remote Retry and Back without native plugin',
    (tester) async {
      tv.demo = true;
      await tester.pumpWidget(
        MaterialApp(
          home: Builder(
            builder: (context) => TextButton(
              onPressed: () => openMedia(context, tv, 'videos', media('a')),
              child: const Text('Open'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      expect(find.text('Unable to play'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
      await tester.sendKeyEvent(LogicalKeyboardKey.escape);
      await tester.pumpAndSettle();
      expect(find.text('Open'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
