import 'dart:convert';
import 'dart:math';

import 'protocol.dart';

/// Playback identity follows the media, not titles, artwork or CMS releases.
String mediaRevision(Map item) =>
    '${item['mediaRevision'] ?? item['mediaAssetId'] ?? digestOf(utf8.encode('${item['id']}|${item['videoRef'] ?? ''}'))}';
String playbackKey(String kind, Map item) =>
    '$kind/${item['id']}/${mediaRevision(item)}';

class PlaybackHandle {
  final String localId = List.generate(
    24,
    (_) => Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0'),
  ).join();
  final String kind, id, revision, key;
  final int generation;
  String? sessionId;
  int sequence = 0;
  int localSequence = 0;
  bool serverRejected = false;
  bool connecting = false;
  PlaybackHandle(this.kind, Map item, this.generation)
    : id = '${item['id']}',
      revision = mediaRevision(item),
      key = playbackKey(kind, item);
}

/// A bounded, identity-scoped state machine; only a current player can update it.
class PlaybackMemory {
  final Map<String, Map<String, dynamic>> progress = {};
  PlaybackHandle? current;
  int _generation = 0;

  PlaybackHandle begin(String kind, Map item) =>
      current = PlaybackHandle(kind, item, ++_generation);
  bool owns(PlaybackHandle handle) =>
      identical(current, handle) && handle.generation == _generation;
  void clear() {
    progress.clear();
    current = null;
    _generation++;
  }

  Map<String, dynamic>? forItem(String kind, Map item) =>
      progress[playbackKey(kind, item)];
  double resumeSeconds(String kind, Map item) {
    final p = forItem(kind, item);
    if (p == null || p['completed'] == true) return 0;
    return (((p['positionSeconds'] as num?)?.toDouble() ?? 0) - 3).clamp(
      0,
      double.infinity,
    );
  }

  Map<String, dynamic>? record(
    PlaybackHandle handle,
    double position,
    double duration, {
    double threshold = .95,
    String event = 'checkpoint',
    DateTime? now,
  }) {
    if (!owns(handle) ||
        !position.isFinite ||
        !duration.isFinite ||
        duration <= 0 ||
        duration > 604800) {
      return null;
    }
    final p = <String, dynamic>{
      'kind': handle.kind,
      'localPlaybackId': handle.localId,
      'id': handle.id,
      'mediaRevision': handle.revision,
      'positionSeconds': position.clamp(0, duration),
      'durationSeconds': duration,
      'completed': position / duration >= threshold.clamp(.5, 1),
      'updatedAt': (now ?? DateTime.now()).toUtc().toIso8601String(),
    };
    progress[handle.key] = p;
    prune(now: now);
    return p;
  }

  void merge(Map<String, dynamic> p, {bool overwrite = false}) {
    if (!['videos', 'replay'].contains(p['kind']) ||
        p['id'] is! String ||
        p['mediaRevision'] is! String ||
        p['positionSeconds'] is! num ||
        p['durationSeconds'] is! num ||
        !(p['positionSeconds'] as num).isFinite ||
        !(p['durationSeconds'] as num).isFinite ||
        (p['positionSeconds'] as num) < 0 ||
        (p['durationSeconds'] as num) <= 0 ||
        (p['durationSeconds'] as num) > 604800 ||
        (p['positionSeconds'] as num) > (p['durationSeconds'] as num) ||
        DateTime.tryParse('${p['updatedAt']}') == null) {
      return;
    }
    final key = playbackKey(p['kind'], p);
    final old = progress[key];
    if (overwrite ||
        old == null ||
        DateTime.parse(p['updatedAt'])
            .isAfter(DateTime.parse(old['updatedAt']))) {
      progress[key] = Map<String, dynamic>.from(p);
    }
    prune();
  }

  void prune({DateTime? now}) {
    final cutoff = (now ?? DateTime.now()).subtract(const Duration(days: 90));
    progress.removeWhere(
      (_, p) => DateTime.parse(p['updatedAt']).isBefore(cutoff),
    );
    final keys = progress.keys.toList()
      ..sort(
        (a, b) => '${progress[b]!['updatedAt']}'.compareTo(
          '${progress[a]!['updatedAt']}',
        ),
      );
    for (final key in keys.skip(200)) {
      progress.remove(key);
    }
  }
}
