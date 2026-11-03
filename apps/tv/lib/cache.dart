import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';

import 'api.dart';
import 'protocol.dart';

class ReleaseCache {
  final Directory root;
  ReleaseCache(this.root);
  Future<String> fileHash(File file) async =>
      (await sha256.bind(file.openRead()).first).toString();
  String pathFor(Map bundle, String url) =>
      '${root.path}/${bundle['releaseId']}/${url.split('/').last}';
  Future<Map<String, dynamic>?> load(String identity) async {
    if (!await root.exists()) return null;
    final files = await root
        .list()
        .where(
          (f) =>
              f is File &&
              f.path.contains('manifest-') &&
              f.path.endsWith('.json'),
        )
        .cast<File>()
        .toList();
    files.sort((a, b) => b.path.compareTo(a.path));
    for (final file in files) {
      try {
        final record = Map<String, dynamic>.from(
          jsonDecode(await file.readAsString()),
        );
        if (record['identity'] != identity ||
            DateTime.now()
                    .difference(DateTime.parse(record['verifiedAt']))
                    .inHours >=
                24) {
          continue;
        }
        final bundle = validateEnvelope(
          Map<String, dynamic>.from(record['envelope']),
        );
        for (final asset in bundle['assets'] ?? []) {
          final f = File(pathFor(bundle, asset['url']));
          if (!await f.exists() || await fileHash(f) != asset['digest']) {
            throw const FormatException('Cached asset failed verification');
          }
        }
        return record;
      } catch (_) {
        /* Try the previous complete checkpoint. */
      }
    }
    return null;
  }

  Future<void> stage(Map<String, dynamic> envelope, MadarApi api) async {
    final bundle = validateEnvelope(envelope);
    final folder = Directory('${root.path}/${bundle['releaseId']}');
    await folder.create(recursive: true);
    for (final asset in bundle['assets'] ?? []) {
      final file = File(pathFor(bundle, asset['url']));
      if (await file.exists() &&
          await file.length() == asset['bytes'] &&
          await fileHash(file) == asset['digest']) {
        continue;
      }
      final temp = File('${file.path}.part'), sink = temp.openWrite();
      try {
        await api.download(asset['url'], asset['bytes'], (chunk) async {
          sink.add(chunk);
        });
        await sink.flush();
      } finally {
        await sink.close();
      }
      if (await fileHash(temp) != asset['digest']) {
        await temp.delete();
        throw const FormatException('Asset checksum mismatch');
      }
      if (await file.exists()) await file.delete();
      await temp.rename(file.path);
    }
  }

  Future<void> commit(Map<String, dynamic> envelope, String identity) async {
    await root.create(recursive: true);
    final target =
        '${root.path}/manifest-${DateTime.now().microsecondsSinceEpoch}.json';
    final temp = File('$target.part');
    await temp.writeAsString(
      jsonEncode({
        'identity': identity,
        'envelope': envelope,
        'verifiedAt': DateTime.now().toUtc().toIso8601String(),
      }),
      flush: true,
    );
    await temp.rename(target);
    final manifests = await root
        .list()
        .where((f) => f is File && f.path.endsWith('.json'))
        .cast<File>()
        .toList();
    manifests.sort((a, b) => b.path.compareTo(a.path));
    final retained = <String>{};
    for (final f in manifests.take(2)) {
      try {
        retained.add(
          jsonDecode(await f.readAsString())['envelope']['releaseId'],
        );
      } catch (_) {}
    }
    for (final f in manifests.skip(2)) {
      await f.delete();
    }
    await for (final d in root.list()) {
      if (d is Directory &&
          !retained.contains(d.path.split(Platform.pathSeparator).last)) {
        await d.delete(recursive: true);
      }
    }
  }

  Future<void> clear() async {
    if (await root.exists()) await root.delete(recursive: true);
  }
}
