import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';

import 'api.dart';
import 'cache.dart';
import 'protocol.dart';
import 'playback_state.dart';

class TvController extends ChangeNotifier {
  final FlutterSecureStorage storage;
  MadarApi? api;
  ReleaseCache? cache;
  Map<String, dynamic>? bundle, envelope, pairing;
  Map<String, dynamic> config = {}, operations = {};
  final Set<String> favourites = {};
  final Map<String, bool> favouriteQueue = {};
  final PlaybackMemory playbackMemory = PlaybackMemory();
  final Map<String, Map<String, dynamic>> progressQueue = {};
  List<Map<String, dynamic>> recommendations = [];
  String preferenceMessage = '';
  String? _historyModeSeen;
  bool _progressBusy = false, _resetPending = false;
  int preferencesEpoch = 0;
  bool _epochKnown = false;
  Future<void> _playbackSave = Future.value();
  Future<void> _favouriteSave = Future.value();
  bool _favouriteBusy = false;
  int _favouriteIntentVersion = 0;
  String error = '', server = '', page = 'home';
  bool busy = false, online = false, demo = false, renderFailed = false;
  DateTime? lastOnline, operationsAt, nextAckAttempt;
  Timer? timer, pairTimer;
  bool _disposed = false, _ackBusy = false;
  TvController({this.storage = const FlutterSecureStorage()});
  bool get paired => api?.deviceKey != null;
  bool get ar => bundle?['profile']?['theme']?['language'] == 'ar';
  String get identity => digestOf(utf8.encode('$server|${api?.deviceKey}'));
  bool ownsConnection(MadarApi? client, String deviceIdentity) =>
      !_disposed && identical(api, client) && identity == deviceIdentity;
  Map<String, dynamic> get experienceSettings => {
    ...Map<String, dynamic>.from(bundle?['profile']?['experience'] ?? {}),
    ...Map<String, dynamic>.from(config['experience'] ?? {}),
  };
  String get historyMode {
    final mode = experienceSettings['historyMode'];
    if (['off', 'session', 'device'].contains(mode)) return mode;
    return [
          'employee',
          'management',
        ].contains(bundle?['profile']?['profileType'])
        ? 'device'
        : 'off';
  }

  bool get recommendationEnabled =>
      experienceSettings['recommendations'] != false;
  double get completionThreshold =>
      ((experienceSettings['completionThreshold'] as num?)?.toDouble() ?? .95)
          .clamp(.8, 1);
  Map<String, dynamic>? progressFor(String kind, Map item) =>
      historyMode == 'off' || _resetPending
      ? null
      : playbackMemory.forItem(kind, item);
  void changed() {
    if (!_disposed) notifyListeners();
  }

  Future<void> start() async {
    try {
      server =
          await storage.read(key: 'server') ??
          const String.fromEnvironment('MADAR_API_URL');
      final key = await storage.read(key: 'deviceKey');
      if (server.isNotEmpty && key != null) {
        api = MadarApi(server, deviceKey: key);
        await initializeCache();
        await sync();
        timer = Timer.periodic(const Duration(seconds: 10), (_) => sync());
      }
    } catch (e) {
      error = '$e';
      changed();
    }
  }

  Future<void> initializeCache() async {
    final dir = await getApplicationSupportDirectory();
    cache = ReleaseCache(Directory('${dir.path}/releases'));
    final record = await cache!.load(identity);
    if (record != null) {
      envelope = Map<String, dynamic>.from(record['envelope']);
      bundle = validateEnvelope(envelope!);
      lastOnline = DateTime.parse(record['verifiedAt']);
      page = (bundle!['pages'] as Map).containsKey('home')
          ? 'home'
          : (bundle!['pages'] as Map).keys.first;
    }
    final saved = await storage.read(key: 'favourites');
    if (saved != null) {
      final data = jsonDecode(saved);
      if (data['identity'] == identity) {
        preferencesEpoch = (data['epoch'] as int?) ?? 0;
        favourites.addAll(List<String>.from(data['items']));
        favouriteQueue.addAll(Map<String, bool>.from(data['queue']));
      }
    }
    await loadPlaybackState();
    changed();
  }

  Future<void> enroll(String url, String name) async {
    try {
      error = '';
      pairTimer?.cancel();
      api?.close();
      server = url.trim().replaceFirst(RegExp(r'/$'), '');
      api = MadarApi(server);
      pairing = Map<String, dynamic>.from(
        await api!.json(
          '/api/app/enroll',
          method: 'POST',
          body: {
            'name': name,
            'model': 'MADAR Flutter TV',
            'platform': 'Android TV / touch',
            'appVersion': '4.0.0',
          },
        ),
      );
      changed();
      pairTimer = Timer.periodic(
        const Duration(seconds: 3),
        (_) => checkPairing(),
      );
    } catch (e) {
      error = '$e';
      changed();
    }
  }

  Future<void> checkPairing() async {
    final p = pairing;
    if (p == null) return;
    try {
      final r = await api!.json(
        '/api/app/enroll/${p['id']}',
        headers: {'X-Enrollment-Key': p['enrollmentKey']},
      );
      if (r['status'] == 'approved') {
        pairTimer?.cancel();
        api!.deviceKey = r['deviceKey'];
        await storage.write(key: 'server', value: server);
        await storage.write(key: 'deviceKey', value: api!.deviceKey);
        pairing = null;
        await initializeCache();
        await sync();
        timer = Timer.periodic(const Duration(seconds: 10), (_) => sync());
      }
    } catch (e) {
      error = '$e';
      if (e is ApiException && [401, 410].contains(e.status)) {
        pairTimer?.cancel();
      }
      changed();
    }
  }

  Future<void> showDemo() async {
    timer?.cancel();
    pairTimer?.cancel();
    demo = true;
    online = false;
    api?.close();
    api = null;
    final data = jsonDecode(await rootBundle.loadString('assets/demo.json'));
    bundle = Map<String, dynamic>.from(data['bundle']);
    config = {};
    // Sample progress is session-only and is never sent to a server.
    bundle!['profile']['experience'] = {
      ...Map<String, dynamic>.from(bundle!['profile']['experience'] ?? {}),
      'historyMode': 'session',
    };
    operations = Map<String, dynamic>.from(data['operations']);
    page = 'home';
    favourites.clear();
    playbackMemory.clear();
    progressQueue.clear();
    recommendations = [];
    _historyModeSeen = historyMode;
    final demoVideos = contentItems(bundle!, 'videos');
    if (demoVideos.isNotEmpty) {
      final h = playbackMemory.begin('videos', demoVideos.first);
      playbackMemory.record(h, 135, 600);
      playbackMemory.current = null;
    }
    buildLocalRecommendations();
    error = '';
    changed();
  }

  Future<void> sync() async {
    if (busy || !paired || demo || _disposed) return;
    busy = true;
    Map<String, dynamic>? delivery;
    try {
      final next = Map<String, dynamic>.from(
        await api!.json('/api/app/config'),
      );
      if (config['assignedPage'] != next['assignedPage']) {
        page = next['assignedPage'];
      }
      if (next['preferencesEpoch'] is int &&
          next['preferencesEpoch'] < preferencesEpoch) {
        throw ApiException(409, 'An older configuration response was ignored.');
      }
      config = next;
      if (!await observePreferencesEpoch(next['preferencesEpoch'])) {
        throw ApiException(
          409,
          'An obsolete configuration response was ignored.',
        );
      }
      await applyHistoryPolicy();
      final result = await api!.json(
        '/api/app/sync',
        headers: {
          if (envelope != null) 'If-None-Match': '"${envelope!['digest']}"',
        },
      );
      if (result != null) {
        delivery = Map<String, dynamic>.from(result);
        final nextBundle = validateEnvelope(delivery);
        await ack(delivery, 'received');
        await cache!.stage(delivery, api!);
        await ack(delivery, 'downloaded');
        await cache!.commit(delivery, identity);
        envelope = delivery;
        bundle = nextBundle;
        renderFailed = false;
        delivery = null;
      } else if (envelope != null) {
        await cache!.commit(envelope!, identity);
      }
      if (bundle != null && !(bundle!['pages'] as Map).containsKey(page)) {
        page = (bundle!['pages'] as Map).keys.first;
      }
      final currentOps = await api!.json('/api/app/operations');
      operations = Map<String, dynamic>.from(currentOps);
      operationsAt = DateTime.now();
      await flushFavourites();
      await refreshFavourites();
      await syncPreferences();
      await api!.json(
        '/api/app/heartbeat',
        method: 'POST',
        body: {'appVersion': 'flutter-4.0.0', 'page': page},
      );
      online = true;
      lastOnline = DateTime.now();
      error = '';
    } catch (e) {
      online = false;
      error = '$e';
      if (e is ApiException && e.status == 401) {
        await revoke();
      } else if (delivery != null) {
        try {
          await ack(delivery, 'failed', message: '$e');
        } catch (_) {}
      }
      if (operationsAt != null &&
          DateTime.now().difference(operationsAt!).inSeconds > 90) {
        operations = {};
      }
      if (lastOnline != null &&
          DateTime.now().difference(lastOnline!).inHours >= 24) {
        bundle = null;
        envelope = null;
        await cache?.clear();
        await clearPlaybackState();
        error = 'Offline permission expired. Connect this TV to refresh its access.';
      }
    } finally {
      busy = false;
      changed();
    }
  }

  Future<void> ack(
    Map<String, dynamic> d,
    String stage, {
    String? message,
  }) async {
    await api!.json(
      '/api/app/ack',
      method: 'POST',
      body: {
        'deliveryId': d['deliveryId'],
        'digest': d['digest'],
        'stage': stage,
        if (message != null)
          'error': message.substring(0, message.length.clamp(0, 500)),
      },
    );
  }

  Future<void> rendered(String releaseId) async {
    if (demo ||
        _ackBusy ||
        renderFailed ||
        envelope == null ||
        bundle?['releaseId'] != releaseId ||
        envelope?['status'] == 'applied') {
      return;
    }
    if (nextAckAttempt != null && DateTime.now().isBefore(nextAckAttempt!)) {
      return;
    }
    _ackBusy = true;
    final d = envelope!;
    try {
      await ack(d, 'applied');
      if (identical(d, envelope)) envelope!['status'] = 'applied';
    } catch (e) {
      nextAckAttempt = DateTime.now().add(const Duration(seconds: 5));
      error = 'Display acknowledgement pending: $e';
      changed();
    } finally {
      _ackBusy = false;
    }
  }

  void navigate(String value) {
    if (value == 'favourites' || bundle?['pages']?[value] != null) {
      page = value;
      changed();
    }
  }

  bool isFavourite(String kind, String id) => favourites.contains('$kind/$id');
  Future<void> toggleFavourite(String kind, String id) async {
    _favouriteIntentVersion++;
    final key = '$kind/$id', save = !favourites.contains(key);
    if (save) {
      favourites.add(key);
    } else {
      favourites.remove(key);
    }
    if (!demo) {
      favouriteQueue[key] = save;
      await saveFavourites();
      try {
        await flushFavourites();
      } catch (e) {
        error = 'Favourite saved on this TV; waiting to sync.';
      }
    }
    changed();
  }

  Future<void> saveFavourites() {
    if (demo) return Future.value();
    final snapshot = jsonEncode({
      'identity': identity,
      'epoch': preferencesEpoch,
      'items': favourites.toList(),
      'queue': favouriteQueue,
    });
    return _favouriteSave = _favouriteSave
        .catchError((_) {})
        .then((_) => storage.write(key: 'favourites', value: snapshot));
  }

  Future<void> flushFavourites() async {
    if (_resetPending || _favouriteBusy || api == null) return;
    _favouriteBusy = true;
    final flushEpoch = preferencesEpoch;
    final connection = api!, deviceIdentity = identity;
    try {
      for (final entry in Map<String, bool>.from(favouriteQueue).entries) {
        if (flushEpoch != preferencesEpoch ||
            _resetPending ||
            !ownsConnection(connection, deviceIdentity)) {
          return;
        }
        if (favouriteQueue[entry.key] != entry.value) continue;
        try {
          await connection.json(
            '/api/app/favourites/${entry.key}',
            method: entry.value ? 'PUT' : 'DELETE',
            headers: {'X-Preferences-Epoch': '$flushEpoch'},
          );
          if (flushEpoch != preferencesEpoch ||
              _resetPending ||
              !ownsConnection(connection, deviceIdentity)) {
            return;
          }
          _favouriteIntentVersion++;
        } on ApiException catch (e) {
          if (!ownsConnection(connection, deviceIdentity)) return;
          if (e.status == 409) {
            // Discard the stale intent; never retry it under a new reset epoch.
            favouriteQueue.clear();
            await refreshPreferenceEpoch();
            await saveFavourites();
            return;
          }
          if (e.status != 404) rethrow;
          favourites.remove(entry.key);
        }
        if (favouriteQueue[entry.key] == entry.value) {
          favouriteQueue.remove(entry.key);
        }
      }
      await saveFavourites();
    } finally {
      _favouriteBusy = false;
    }
  }

  Future<void> refreshFavourites() async {
    final epoch = preferencesEpoch, intent = _favouriteIntentVersion;
    final connection = api!, deviceIdentity = identity;
    final list = await connection.json('/api/app/favourites') as List;
    if (epoch != preferencesEpoch ||
        intent != _favouriteIntentVersion ||
        _resetPending ||
        !ownsConnection(connection, deviceIdentity)) {
      return;
    }
    favourites.clear();
    favourites.addAll(list.map((r) => '${r['kind']}/${r['id']}'));
    for (final e in favouriteQueue.entries) {
      e.value ? favourites.add(e.key) : favourites.remove(e.key);
    }
    await saveFavourites();
  }

  Future<void> loadPlaybackState() async {
    _historyModeSeen = historyMode;
    final saved = await storage.read(key: 'playback-state');
    if (saved == null) return;
    try {
      final data = jsonDecode(saved);
      if (data['identity'] != identity) {
        await storage.delete(key: 'playback-state');
        return;
      }
      final storedEpoch = (data['epoch'] as int?) ?? 0;
      if (storedEpoch != preferencesEpoch) {
        favourites.clear();
        favouriteQueue.clear();
      }
      preferencesEpoch = storedEpoch > preferencesEpoch
          ? storedEpoch
          : preferencesEpoch;
      _epochKnown = data['epoch'] is int;
      _resetPending = data['resetPending'] == true;
      if (historyMode != 'device' ||
          _resetPending ||
          storedEpoch < preferencesEpoch) {
        await saveFavourites();
        await savePlaybackState();
        return;
      }
      for (final p in (data['progress'] as List? ?? [])) {
        playbackMemory.merge(Map<String, dynamic>.from(p));
      }
      for (final entry in (data['queue'] as Map? ?? {}).entries) {
        final q = Map<String, dynamic>.from(entry.value);
        if (q['sessionId'] is String &&
            q['sequence'] is int &&
            q['queuedAt'] is String &&
            DateTime.tryParse(
                  q['queuedAt'],
                )?.isAfter(DateTime.now().subtract(const Duration(hours: 8))) ==
                true) {
          progressQueue['${entry.key}'] = q;
        }
      }
    } catch (_) {
      await storage.delete(key: 'playback-state');
    }
  }

  Future<void> savePlaybackState() {
    if (demo) return Future.value();
    final snapshot = jsonEncode({
      'version': 1,
      'identity': identity,
      'epoch': preferencesEpoch,
      'resetPending': _resetPending,
      'progress': historyMode == 'device' && !_resetPending
          ? playbackMemory.progress.values.toList()
          : [],
      'queue': historyMode == 'device' && !_resetPending ? progressQueue : {},
    });
    // Secure-storage calls are ordered so an older snapshot cannot finish last.
    return _playbackSave = _playbackSave
        .catchError((_) {})
        .then((_) => storage.write(key: 'playback-state', value: snapshot));
  }

  Future<void> clearPlaybackState() async {
    playbackMemory.clear();
    progressQueue.clear();
    recommendations = [];
    await _playbackSave.catchError((_) {});
    await storage.delete(key: 'playback-state');
  }

  Future<void> applyHistoryPolicy() async {
    if (_historyModeSeen != null && _historyModeSeen != historyMode) {
      await clearPlaybackState();
      preferenceMessage =
          'Viewing history policy changed; local history was cleared.';
    }
    _historyModeSeen = historyMode;
    if (historyMode == 'off' &&
        (playbackMemory.progress.isNotEmpty || progressQueue.isNotEmpty)) {
      await clearPlaybackState();
    }
  }

  Future<bool> observePreferencesEpoch(dynamic value) async {
    if (value is! int || value < 0) return true;
    if (value < preferencesEpoch) return false;
    final reset =
        (_epochKnown && value != preferencesEpoch) ||
        (!_epochKnown && value != preferencesEpoch) ||
        (!_epochKnown && value > 0);
    // Set a monotonic high-water mark before the first await.
    preferencesEpoch = value;
    _epochKnown = true;
    if (reset) {
      _favouriteIntentVersion++;
      favourites.clear();
      favouriteQueue.clear();
      _resetPending = false;
      preferenceMessage = 'Saved preferences were reset by the administrator.';
      await clearPlaybackState();
    }
    await saveFavourites();
    await savePlaybackState();
    changed();
    return value == preferencesEpoch;
  }

  Future<Map<String, dynamic>> refreshPreferenceEpoch() async {
    final connection = api!, deviceIdentity = identity;
    final response = Map<String, dynamic>.from(
      await connection.json('/api/app/preferences'),
    );
    if (!ownsConnection(connection, deviceIdentity)) {
      throw ApiException(
        409,
        'The paired device changed; obsolete preferences were ignored.',
      );
    }
    if (!await observePreferencesEpoch(response['epoch'])) {
      throw ApiException(409, 'An obsolete preference response was ignored.');
    }
    if (!ownsConnection(connection, deviceIdentity)) {
      throw ApiException(
        409,
        'The paired device changed; obsolete preferences were ignored.',
      );
    }
    if (response['policy'] is Map) {
      config['experience'] = {
        ...experienceSettings,
        ...Map<String, dynamic>.from(response['policy']),
      };
    }
    await applyHistoryPolicy();
    if (response['epoch'] is int && response['epoch'] != preferencesEpoch) {
      throw ApiException(409, 'An obsolete preference response was ignored.');
    }
    return response;
  }

  Future<void> syncPreferences() async {
    await applyHistoryPolicy();
    if (demo || api == null) {
      buildLocalRecommendations();
      return;
    }
    final preferenceConnection = api!, preferenceIdentity = identity;
    try {
      if (_resetPending) {
        await preferenceConnection.json(
          '/api/app/preferences',
          method: 'DELETE',
        );
        if (!ownsConnection(preferenceConnection, preferenceIdentity)) return;
        await refreshPreferenceEpoch();
        if (!ownsConnection(preferenceConnection, preferenceIdentity)) return;
        _resetPending = false;
        favourites.clear();
        favouriteQueue.clear();
        await saveFavourites();
        await savePlaybackState();
      }
      final response = await refreshPreferenceEpoch();
      if (!ownsConnection(preferenceConnection, preferenceIdentity)) return;
      if (response['epoch'] is int && response['epoch'] != preferencesEpoch) {
        throw ApiException(409, 'An obsolete preference response was ignored.');
      }
      if (historyMode == 'device') {
        for (final item in (response['progress'] as List? ?? [])) {
          final p = Map<String, dynamic>.from(item),
              key = playbackKey('${item['kind']}', item);
          if (!progressQueue.containsKey(key) &&
              playbackMemory.current?.key != key) {
            playbackMemory.merge(p);
          }
        }
        await flushProgress();
        await savePlaybackState();
      }
      if (recommendationEnabled && historyMode != 'session') {
        final epoch = preferencesEpoch;
        final connection = api!, deviceIdentity = identity;
        final response = await connection.json('/api/app/recommendations');
        if (epoch != preferencesEpoch ||
            _resetPending ||
            !ownsConnection(connection, deviceIdentity)) {
          return;
        }
        recommendations = (response?['items'] as List? ?? [])
            .map((r) => Map<String, dynamic>.from(r))
            .toList();
      } else {
        buildLocalRecommendations();
      }
      preferenceMessage = '';
    } on ApiException catch (e) {
      if (!ownsConnection(preferenceConnection, preferenceIdentity)) return;
      if (e.status == 401) rethrow;
      preferenceMessage =
          'Viewing preferences will sync when the service is available.';
      if (recommendations.isEmpty) buildLocalRecommendations();
    } catch (_) {
      preferenceMessage =
          'Viewing preferences are stored on this TV until it reconnects.';
      if (recommendations.isEmpty) buildLocalRecommendations();
    }
  }

  /// Small content-based ranking for session/demo/offline use; no personal identity.
  void buildLocalRecommendations() {
    if (!recommendationEnabled || bundle == null || _resetPending) {
      recommendations = [];
      return;
    }
    final candidates = <Map<String, dynamic>>[];
    for (final kind in ['videos', 'replay']) {
      if (bundle?['pages']?[kind] == null) continue;
      for (final item in contentItems(bundle!, kind)) {
        if (playableItem(kind, item) == null) continue;
        if (kind == 'replay' &&
            (item['available'] != true ||
                DateTime.tryParse('${item['eventEnd']}')
                        ?.isAfter(DateTime.now()) !=
                    false)) {
          continue;
        }
        candidates.add({...item, '_kind': kind});
      }
    }
    final interests = <String, double>{};
    if (historyMode != 'off') {
      for (final item in candidates) {
        final p = progressFor(item['_kind'], item);
        final favourite = isFavourite(item['_kind'], item['id']);
        if (p == null && !favourite) continue;
        final age = p == null
            ? 0
            : DateTime.now()
                  .difference(DateTime.parse(p['updatedAt']))
                  .inDays
                  .clamp(0, 90);
        final weight =
            ((p == null
                    ? 0
                    : ((p['positionSeconds'] as num) /
                              (p['durationSeconds'] as num))
                          .clamp(0, 1)) +
                (favourite ? 2 : 0)) /
            (1 + age / 14);
        for (final tag in ['category', 'language']) {
          final value = '${item[tag] ?? ''}';
          if (value.isNotEmpty) {
            interests['$tag:$value'] = (interests['$tag:$value'] ?? 0) + weight;
          }
        }
      }
    }
    final scored =
        candidates
            .where((r) => progressFor(r['_kind'], r)?['completed'] != true)
            .map((r) {
              final categoryScore = interests['category:${r['category']}'] ?? 0;
              final score =
                  categoryScore +
                  (interests['language:${r['language']}'] ?? 0) * .25;
              return <String, dynamic>{
                'kind': r['_kind'],
                'id': r['id'],
                'score': score,
                'reason': categoryScore > 0
                    ? 'Local suggestion: ${r['category']} interest on this TV'
                    : 'Explore the catalogue',
              };
            })
            .toList()
          ..sort((a, b) {
            final d = (b['score'] as num).compareTo(a['score'] as num);
            return d == 0 ? '${a['id']}'.compareTo('${b['id']}') : d;
          });
    recommendations = scored.take(12).toList();
  }

  Future<PlaybackHandle> beginPlayback(
    String kind,
    Map<String, dynamic> item, {
    bool startOver = false,
  }) async {
    await applyHistoryPolicy();
    final h = playbackMemory.begin(kind, item);
    progressQueue.remove(
      h.key,
    ); // A new session fences all older queued attempts.
    if (startOver) playbackMemory.progress.remove(h.key);
    if (historyMode != 'device' ||
        demo ||
        api == null ||
        _resetPending ||
        !['videos', 'replay'].contains(kind)) {
      return h;
    }
    final connection = api!, deviceIdentity = identity;
    try {
      final response = await connection.json(
        '/api/app/playback-sessions',
        method: 'POST',
        headers: {'X-Preferences-Epoch': '$preferencesEpoch'},
        body: {'kind': kind, 'id': item['id'], 'mediaRevision': h.revision},
      );
      if (!playbackMemory.owns(h) ||
          !ownsConnection(connection, deviceIdentity)) {
        return h;
      }
      if (response['tracking'] == true) h.sessionId = response['sessionId'];
      if (!startOver && response['progress'] is Map) {
        playbackMemory.merge(Map<String, dynamic>.from(response['progress']));
      }
      preferenceMessage = '';
    } on ApiException catch (e) {
      if (!ownsConnection(connection, deviceIdentity)) return h;
      if (e.status == 401) {
        await revoke();
        rethrow;
      }
      if ([404, 409, 410].contains(e.status)) h.serverRejected = true;
      if (e.status == 409) await refreshPreferenceEpoch();
      preferenceMessage =
          'Resume is available locally; server history is waiting to sync.';
    } catch (_) {
      preferenceMessage =
          'Resume is available locally while this TV is offline.';
    }
    await savePlaybackState();
    return h;
  }

  double resumeSeconds(String kind, Map item) =>
      historyMode == 'off' || _resetPending
      ? 0
      : playbackMemory.resumeSeconds(kind, item);

  void endPlayback(PlaybackHandle? handle) {
    if (handle != null && playbackMemory.owns(handle)) {
      playbackMemory.current = null;
    }
    buildLocalRecommendations();
  }

  Future<void> checkpoint(
    PlaybackHandle handle,
    double position,
    double duration, {
    String event = 'checkpoint',
    bool upload = false,
  }) async {
    if (_disposed ||
        handle.serverRejected ||
        historyMode == 'off' ||
        _resetPending ||
        !['videos', 'replay'].contains(handle.kind)) {
      return;
    }
    final p = playbackMemory.record(
      handle,
      position,
      duration,
      threshold: completionThreshold,
      event: event,
    );
    if (p == null) return;
    final localSequence = ++handle.localSequence;
    if (historyMode == 'device' && !demo) {
      await savePlaybackState();
      if (upload &&
          handle.sessionId == null &&
          !handle.serverRejected &&
          !handle.connecting &&
          api != null) {
        handle.connecting = true;
        try {
          final response = await api!.json(
            '/api/app/playback-sessions',
            method: 'POST',
            headers: {'X-Preferences-Epoch': '$preferencesEpoch'},
            body: {
              'kind': handle.kind,
              'id': handle.id,
              'mediaRevision': handle.revision,
            },
          );
          if (playbackMemory.owns(handle) && response['tracking'] == true) {
            handle.sessionId = response['sessionId'];
          }
        } on ApiException catch (e) {
          if (e.status == 401) {
            await revoke();
            return;
          }
          if ([404, 409, 410].contains(e.status)) handle.serverRejected = true;
          if (e.status == 409) await refreshPreferenceEpoch();
        } catch (_) {
          /* Offline playback remains local until an active session reconnects. */
        } finally {
          handle.connecting = false;
        }
        if (!playbackMemory.owns(handle) ||
            handle.localSequence != localSequence ||
            handle.serverRejected) {
          return;
        }
      }
      if (handle.sessionId != null) {
        progressQueue[handle.key] = {
          'localPlaybackId': handle.localId,
          'sessionId': handle.sessionId,
          'sequence': ++handle.sequence,
          'positionSeconds': p['positionSeconds'],
          'durationSeconds': duration,
          'event': event,
          'queuedAt': DateTime.now().toUtc().toIso8601String(),
        };
      }
      await savePlaybackState();
      if (upload) await flushProgress();
    } else {
      buildLocalRecommendations();
    }
    changed();
  }

  Future<void> flushProgress() async {
    if (_progressBusy ||
        demo ||
        api == null ||
        historyMode != 'device' ||
        _resetPending) {
      return;
    }
    _progressBusy = true;
    try {
      for (final entry in Map<String, Map<String, dynamic>>.from(
        progressQueue,
      ).entries) {
        final q = entry.value;
        try {
          await api!.json(
            '/api/app/playback-sessions/${q['sessionId']}',
            method: 'PUT',
            body: {
              'sequence': q['sequence'],
              'positionSeconds': q['positionSeconds'],
              'durationSeconds': q['durationSeconds'],
              'event': q['event'],
            },
          );
        } on ApiException catch (e) {
          if (e.status == 401) {
            await revoke();
            return;
          }
          if (![404, 409, 410, 422].contains(e.status)) rethrow;
          // Never open a new session to replay an obsolete checkpoint.
          if (playbackMemory.current?.sessionId == q['sessionId']) {
            playbackMemory.current!.serverRejected = true;
          }
          if (playbackMemory.progress[entry.key]?['localPlaybackId'] ==
              q['localPlaybackId']) {
            playbackMemory.progress.remove(entry.key);
          }
        }
        if (progressQueue[entry.key]?['sessionId'] == q['sessionId'] &&
            progressQueue[entry.key]?['sequence'] == q['sequence']) {
          progressQueue.remove(entry.key);
        }
      }
      await savePlaybackState();
    } catch (_) {
      preferenceMessage = 'Playback progress saved locally; waiting to sync.';
    } finally {
      _progressBusy = false;
    }
  }

  Future<void> resetPreferences() async {
    _resetPending = !demo;
    await clearPlaybackState();
    favourites.clear();
    favouriteQueue.clear();
    if (!demo) {
      await saveFavourites();
      await savePlaybackState();
    }
    preferenceMessage = demo
        ? 'Demo viewing history cleared.'
        : 'Viewing history cleared on this TV; synchronizing reset.';
    changed();
    await syncPreferences();
    changed();
  }

  String? cachedAsset(String? url) {
    if (url == null ||
        cache == null ||
        bundle == null ||
        !url.startsWith('/api/assets/')) {
      return null;
    }
    return cache!.pathFor(bundle!, url);
  }

  Map<String, dynamic>? playableItem(String kind, Map item) {
    final pageKey = {
      'channels': 'live-tv',
      'radio': 'radio',
      'videos': 'videos',
      'replay': 'replay',
    }[kind];
    if (bundle == null || bundle!['pages'][pageKey] == null) return null;
    final currentProfile = config['profile'];
    if (currentProfile is Map) {
      if (currentProfile['id'] != bundle!['profile']['id'] ||
          currentProfile['profileType'] != bundle!['profile']['profileType']) {
        return null;
      }
      final allowed = currentProfile['allowedSections'] as List? ?? [];
      if (!allowed.contains('*') && !allowed.contains(pageKey)) return null;
    }
    final current = contentItems(bundle!, kind)
        .where(
          (r) =>
              r['id'] == item['id'] &&
              (!['videos', 'replay'].contains(kind) ||
                  mediaRevision(r) == mediaRevision(item)),
        )
        .firstOrNull;
    if (current == null) return null;
    if (kind == 'replay' &&
        (current['available'] != true ||
            DateTime.tryParse('${current['eventEnd']}')
                    ?.isAfter(DateTime.now()) !=
                false)) {
      return null;
    }
    return current;
  }

  Future<String> playback(String kind, Map item) async {
    final current = playableItem(kind, item);
    if (current == null) {
      throw const FormatException(
        'This content is no longer available. Return to the catalogue and choose it again.',
      );
    }
    item = current;
    if (item['mediaAssetId'] != null) {
      final local = cachedAsset('/api/assets/${item['mediaAssetId']}');
      if (local != null && await File(local).exists()) return local;
    }
    if (demo) {
      throw const FormatException(
        'Demo catalogue. Connect a provider or upload a video in Admin to enable playback.',
      );
    }
    final revision =
        ['videos', 'replay'].contains(kind) && item['mediaRevision'] != null
        ? '?mediaRevision=${Uri.encodeQueryComponent('${item['mediaRevision']}')}'
        : '';
    final r = await api!.json('/api/app/playback/$kind/${item['id']}$revision');
    return api!.origin.resolve(r['url']).toString();
  }

  Future<void> revoke() async {
    timer?.cancel();
    pairTimer?.cancel();
    bundle = null;
    changed();
    await cache?.clear();
    await storage.delete(key: 'deviceKey');
    await _favouriteSave.catchError((_) {});
    await storage.delete(key: 'favourites');
    await clearPlaybackState();
    _resetPending = false;
    preferencesEpoch = 0;
    _epochKnown = false;
    api?.close();
    api = null;
    bundle = null;
    envelope = null;
    favourites.clear();
    favouriteQueue.clear();
    operations = {};
    error = 'Screen access was revoked. Request pairing again.';
  }

  @override
  void dispose() {
    _disposed = true;
    timer?.cancel();
    pairTimer?.cancel();
    api?.close();
    super.dispose();
  }
}
