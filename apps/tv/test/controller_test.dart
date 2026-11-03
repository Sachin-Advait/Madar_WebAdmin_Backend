import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:madar_tv/api.dart';
import 'package:madar_tv/cache.dart';
import 'package:madar_tv/controller.dart';
import 'package:madar_tv/protocol.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late TvController controller;
  late Map<String, dynamic> bundle, envelope;
  late List<String> stages;
  setUp(() async {
    FlutterSecureStorage.setMockInitialValues({});
    directory = await Directory.systemTemp.createTemp('madar-controller-');
    bundle = Map<String, dynamic>.from(
      jsonDecode(File('assets/demo.json').readAsStringSync())['bundle'],
    );
    final text = jsonEncode(bundle);
    envelope = {
      'bundleText': text,
      'digest': digestOf(utf8.encode(text)),
      'releaseId': bundle['releaseId'],
      'deliveryId': 'delivery',
      'status': 'pending',
    };
    stages = [];
    controller = TvController()
      ..server = 'https://tv.example.test'
      ..cache = ReleaseCache(directory);
  });
  tearDown(() async {
    controller.dispose();
    if (await directory.exists()) await directory.delete(recursive: true);
  });
  void connect({bool corrupt = false}) {
    controller.api = MadarApi(
      controller.server,
      deviceKey: 'device-key',
      client: MockClient((r) async {
        Object body = {};
        switch (r.url.path) {
          case '/api/app/config':
            body = {'assignedPage': 'home'};
          case '/api/app/sync':
            body = {...envelope, if (corrupt) 'digest': 'wrong'};
          case '/api/app/operations':
            body = {'meeting': null, 'queue': null};
          case '/api/app/favourites':
            body = [];
          case '/api/app/ack':
            stages.add(jsonDecode(r.body)['stage']);
        }
        return http.Response(
          jsonEncode(body),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      }),
    );
  }

  test(
    'downloaded is acknowledged before rendered, and applied is idempotent',
    () async {
      connect();
      await controller.sync();
      expect(stages, ['received', 'downloaded'], reason: controller.error);
      expect(controller.bundle, isNotNull);
      expect(controller.online, isTrue);
      await controller.rendered(bundle['releaseId']);
      await controller.rendered(bundle['releaseId']);
      expect(stages, ['received', 'downloaded', 'applied']);
    },
  );
  test('checksum or rendering failures cannot acknowledge applied', () async {
    connect(corrupt: true);
    await controller.sync();
    expect(controller.bundle, isNull);
    expect(stages, contains('failed'));
    expect(stages, isNot(contains('downloaded')));
    connect();
    stages.clear();
    await controller.sync();
    controller.renderFailed = true;
    await controller.rendered(bundle['releaseId']);
    expect(stages, ['received', 'downloaded']);
  });
  test('revoked devices erase cached state and favourites', () async {
    connect();
    await controller.sync();
    controller.favourites.add('videos/vid-001');
    controller.api!.close();
    controller.api = MadarApi(
      controller.server,
      deviceKey: 'device-key',
      client: MockClient(
        (_) async => http.Response('{"detail":"revoked"}', 401),
      ),
    );
    await controller.sync();
    expect(controller.bundle, isNull);
    expect(controller.paired, isFalse);
    expect(controller.favourites, isEmpty);
    expect(await directory.exists(), isFalse);
  });
  test(
    'offline favourites queue final intent and retry idempotently',
    () async {
      controller.api = MadarApi(
        controller.server,
        deviceKey: 'key',
        client: MockClient((_) async => throw const SocketException('offline')),
      );
      await controller.toggleFavourite('videos', 'vid-001');
      expect(controller.favouriteQueue['videos/vid-001'], isTrue);
      await controller.toggleFavourite('videos', 'vid-001');
      expect(controller.favouriteQueue['videos/vid-001'], isFalse);
      controller.api!.close();
      final methods = <String>[];
      controller.api = MadarApi(
        controller.server,
        deviceKey: 'key',
        client: MockClient((r) async {
          methods.add(r.method);
          return http.Response('{}', 200);
        }),
      );
      await controller.flushFavourites();
      expect(methods, ['DELETE']);
      expect(controller.favouriteQueue, isEmpty);
    },
  );
  test('offline authorization expires after 24 hours', () async {
    controller.bundle = bundle;
    controller.lastOnline = DateTime.now().subtract(const Duration(hours: 25));
    controller.api = MadarApi(
      controller.server,
      deviceKey: 'key',
      client: MockClient((_) async => throw const SocketException('offline')),
    );
    await controller.sync();
    expect(controller.bundle, isNull);
    expect(controller.error, contains('expired'));
  });
}
