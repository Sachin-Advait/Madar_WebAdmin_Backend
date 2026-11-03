import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:madar_tv/protocol.dart';
import 'package:madar_tv/api.dart';
import 'package:madar_tv/cache.dart';

Map<String, dynamic> sample() => Map<String, dynamic>.from(
  jsonDecode(File('assets/demo.json').readAsStringSync())['bundle'],
);
Map<String, dynamic> envelope(Map b) {
  final text = jsonEncode(b);
  return {
    'bundleText': text,
    'digest': digestOf(utf8.encode(text)),
    'releaseId': b['releaseId'],
    'deliveryId': 'test-delivery',
  };
}

void main() {
  test(
    'all agreed destinations and widgets validate against the backend sample',
    () {
      final b = sample();
      expect(b['pages'].length, 14);
      expect(supportedWidgets.length, 20);
      expect(validateEnvelope(envelope(b))['releaseId'], b['releaseId']);
      expect(
        (b['content'] as Map).values.fold<int>(
          0,
          (n, list) => n + (list as List).length,
        ),
        greaterThan(130),
      );
    },
  );
  test(
    'corrupt releases, unsafe asset paths and unknown widgets are rejected',
    () {
      final b = sample(), e = envelope(b);
      e['digest'] = 'bad';
      expect(() => validateEnvelope(e), throwsFormatException);
      b['pages']['home']['sections'][0]['type'] = 'unregistered';
      expect(() => validateEnvelope(envelope(b)), throwsFormatException);
      final a = sample();
      a['assets'] = [
        {
          'id': '../escape',
          'url': '/api/assets/../escape',
          'bytes': 1,
          'digest': '0' * 64,
        },
      ];
      expect(() => validateEnvelope(envelope(a)), throwsFormatException);
    },
  );
  test('content visibility windows and categories are enforced locally', () {
    final at = DateTime.utc(2026, 11, 3);
    expect(
      activeItem({
        'status': 'published',
        'startAt': '2026-11-01',
        'endAt': '2026-11-04',
      }, at),
      isTrue,
    );
    expect(
      activeItem({'status': 'published', 'endAt': '2026-11-02'}, at),
      isFalse,
    );
    expect(activeItem({'status': 'draft'}, at), isFalse);
    expect(
      contentItems(
        sample(),
        'videos',
        category: 'Community',
      ).every((r) => r['category'] == 'Community'),
      isTrue,
    );
  });
  test('authenticated API attaches credentials, forbids redirects and surfaces revocation', () async {
    final client = MockClient((r) async {
      expect(r.headers['X-Screen-Key'], 'device-key');
      expect(r.followRedirects, isFalse);
      return http.Response('{"detail":"revoked"}', 401);
    });
    final api = MadarApi(
      'https://tv.example.test',
      client: client,
      deviceKey: 'device-key',
    );
    await expectLater(
      api.json('/api/app/config'),
      throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)),
    );
    expect(() => MadarApi('http://insecure.example'), throwsFormatException);
    api.close();
  });
  test(
    'verified cache survives restart, rejects identity mismatch and corruption',
    () async {
      final dir = await Directory.systemTemp.createTemp('madar-cache-');
      try {
        final cache = ReleaseCache(dir),
            b = sample(),
            bytes = utf8.encode('verified asset');
        const id = '00000000-0000-4000-a000-000000000001';
        b['assets'] = [
          {
            'id': id,
            'url': '/api/assets/$id',
            'bytes': bytes.length,
            'digest': digestOf(bytes),
          },
        ];
        final e = envelope(b),
            api = MadarApi(
              'https://tv.example.test',
              deviceKey: 'key',
              client: MockClient((r) async => http.Response.bytes(bytes, 200)),
            );
        await cache.stage(e, api);
        await cache.commit(e, 'identity');
        expect(
          (await ReleaseCache(dir).load('identity'))?['envelope']['digest'],
          e['digest'],
        );
        expect(await cache.load('another-device'), isNull);
        await File(cache.pathFor(b, '/api/assets/$id'))
            .writeAsString('corrupt');
        expect(await cache.load('identity'), isNull);
        api.close();
      } finally {
        await dir.delete(recursive: true);
      }
    },
  );
  test('cache never commits a corrupt or oversized asset', () async {
    final dir = await Directory.systemTemp.createTemp('madar-cache-');
    try {
      final b = sample();
      const id = '00000000-0000-4000-a000-000000000002';
      b['assets'] = [
        {
          'id': id,
          'url': '/api/assets/$id',
          'bytes': 3,
          'digest': digestOf([1, 2, 3]),
        },
      ];
      final api = MadarApi(
        'https://tv.example.test',
        deviceKey: 'key',
        client: MockClient((_) async => http.Response.bytes([9, 9, 9], 200)),
      );
      await expectLater(
        ReleaseCache(dir).stage(envelope(b), api),
        throwsFormatException,
      );
      expect(await ReleaseCache(dir).load('identity'), isNull);
      api.close();
    } finally {
      await dir.delete(recursive: true);
    }
  });
}
