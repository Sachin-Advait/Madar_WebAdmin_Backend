import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';

import 'controller.dart';
import 'api.dart';
import 'playback_state.dart';
import 'protocol.dart';
import 'widgets.dart';

class PlayerScreen extends StatefulWidget {
  final TvController controller;
  final Map<String, dynamic> item;
  final String kind;
  final bool startOver;
  const PlayerScreen({
    super.key,
    required this.controller,
    required this.item,
    required this.kind,
    this.startOver = false,
  });
  @override
  State<PlayerScreen> createState() => _PlayerScreenState();
}

class _PlayerScreenState extends State<PlayerScreen>
    with WidgetsBindingObserver {
  VideoPlayerController? player;
  PlaybackHandle? handle;
  Timer? checkpointTimer;
  String error = '';
  bool opening = false, closing = false, allowPop = false, ended = false;
  bool catalogueChanged = false;
  int ticks = 0;
  double retryPosition = 0;
  bool get resumable => ['videos', 'replay'].contains(widget.kind);
  bool get radio => widget.kind == 'radio';
  TvController get tv => widget.controller;
  String label(String english, String arabic) => tv.ar ? arabic : english;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    tv.addListener(checkAccess);
    open();
  }

  void checkAccess() {
    if (tv.playableItem(widget.kind, widget.item) == null && !closing) close();
  }

  Future<void> open() async {
    if (opening || closing) return;
    opening = true;
    checkpointTimer?.cancel();
    if (mounted) setState(() => error = '');
    final previous = player;
    player = null;
    previous?.removeListener(refresh);
    try {
      await previous?.dispose();
    } catch (_) {
      /* A failed native player must not prevent explicit retry. */
    }
    VideoPlayerController? next;
    try {
      final url = await tv.playback(widget.kind, widget.item);
      if (!mounted || closing) return;
      handle ??= resumable
          ? await tv.beginPlayback(
              widget.kind,
              widget.item,
              startOver: widget.startOver,
            )
          : null;
      if (!mounted || closing) return;
      next = url.startsWith('https:') || url.startsWith('http:')
          ? VideoPlayerController.networkUrl(Uri.parse(url))
          : VideoPlayerController.file(File(url));
      player = next;
      await next.initialize().timeout(const Duration(seconds: 30));
      if (!mounted || closing || player != next) return;
      final resume = retryPosition > 0
          ? retryPosition
          : widget.startOver
          ? 0.0
          : tv.resumeSeconds(widget.kind, widget.item);
      if (resumable && resume > 0) {
        await next.seekTo(
          Duration(
            milliseconds: (resume * 1000).round().clamp(
              0,
              next.value.duration.inMilliseconds,
            ),
          ),
        );
      }
      ended = false;
      next.addListener(refresh);
      await next.play();
      checkpointTimer = Timer.periodic(const Duration(seconds: 5), (_) {
        checkAccess();
        ticks++;
        unawaited(save(upload: ticks % 3 == 0));
      });
    } catch (e) {
      catalogueChanged =
          e is ApiException && [404, 409, 410].contains(e.status);
      if (mounted) {
        setState(
          () => error = catalogueChanged
              ? 'This item changed or expired. Return to the catalogue, let it refresh, and choose the item again.'
              : 'Playback could not start. $e',
        );
      }
    } finally {
      opening = false;
      if (mounted) setState(() {});
      if ((!mounted || closing) && next != null) await next.dispose();
    }
  }

  void refresh() {
    final c = player;
    if (!mounted || c == null) return;
    if (c.value.hasError) {
      retryPosition = c.value.position.inMilliseconds / 1000;
      error = 'The stream is unavailable. Retry to reconnect or return to the catalogue.';
      checkpointTimer?.cancel();
    }
    if (resumable && c.value.isCompleted && !ended) {
      ended = true;
      unawaited(save(event: 'ended', upload: true));
    }
    setState(() {});
  }

  Future<void> save({String event = 'checkpoint', bool upload = false}) async {
    final c = player, h = handle;
    if (c == null || h == null || !c.value.isInitialized) return;
    retryPosition = c.value.position.inMilliseconds / 1000;
    try {
      await tv.checkpoint(
        h,
        retryPosition,
        c.value.duration.inMilliseconds / 1000,
        event: event,
        upload: upload,
      );
    } catch (_) {
      /* Keep playback usable if secure storage or connectivity fails. */
    }
  }

  Future<void> toggle() async {
    final c = player;
    if (c == null || !c.value.isInitialized) return;
    if (c.value.isPlaying) {
      await c.pause();
      await save(event: 'pause', upload: true);
    } else {
      await c.play();
    }
  }

  Future<void> seek(int seconds) async {
    final c = player;
    if (!resumable || c == null || !c.value.isInitialized) return;
    final target = c.value.position + Duration(seconds: seconds);
    await c.seekTo(
      Duration(
        milliseconds: target.inMilliseconds.clamp(
          0,
          c.value.duration.inMilliseconds,
        ),
      ),
    );
    ended = false;
  }

  Future<void> startOver() async {
    final c = player;
    if (!resumable || c == null || !c.value.isInitialized) return;
    await c.pause();
    handle = await tv.beginPlayback(widget.kind, widget.item, startOver: true);
    if (!mounted || closing) return;
    retryPosition = 0;
    ended = false;
    await c.seekTo(Duration.zero);
    await save(event: 'pause', upload: true);
    await c.play();
  }

  Future<void> close() async {
    if (closing) return;
    closing = true;
    checkpointTimer?.cancel();
    try {
      await player?.pause();
    } catch (_) {}
    await save(event: 'pause');
    tv.endPlayback(handle);
    unawaited(tv.flushProgress());
    if (!mounted) return;
    setState(() => allowPop = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) Navigator.pop(context);
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if ([
      AppLifecycleState.inactive,
      AppLifecycleState.paused,
      AppLifecycleState.detached,
    ].contains(state)) {
      unawaited(player?.pause() ?? Future.value());
      unawaited(save(event: 'pause', upload: true));
    }
  }

  @override
  void dispose() {
    tv.removeListener(checkAccess);
    WidgetsBinding.instance.removeObserver(this);
    checkpointTimer?.cancel();
    unawaited(save(event: 'pause'));
    tv.endPlayback(handle);
    player?.removeListener(refresh);
    player?.dispose();
    super.dispose();
  }

  String clock(Duration value) => value.toString().split('.').first;
  @override
  Widget build(BuildContext context) {
    final c = player,
        ready = player?.value.isInitialized == true && error.isEmpty;
    final saved = tv.isFavourite(widget.kind, widget.item['id']);
    return PopScope(
      canPop: allowPop,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) close();
      },
      child: Focus(
        autofocus: true,
        onKeyEvent: (_, event) {
          if (event is! KeyDownEvent) return KeyEventResult.ignored;
          if ([
            LogicalKeyboardKey.escape,
            LogicalKeyboardKey.goBack,
          ].contains(event.logicalKey)) {
            close();
            return KeyEventResult.handled;
          }
          if (event.logicalKey == LogicalKeyboardKey.mediaPlayPause) {
            toggle();
            return KeyEventResult.handled;
          }
          if (event.logicalKey == LogicalKeyboardKey.mediaFastForward &&
              resumable) {
            seek(30);
            return KeyEventResult.handled;
          }
          if (event.logicalKey == LogicalKeyboardKey.mediaRewind && resumable) {
            seek(-10);
            return KeyEventResult.handled;
          }
          return KeyEventResult.ignored;
        },
        child: Scaffold(
          backgroundColor: Colors.black,
          appBar: AppBar(
            leading: IconButton(
              onPressed: close,
              icon: const Icon(Icons.arrow_back),
              tooltip: label('Back', 'رجوع'),
            ),
            title: Text(itemTitle(widget.item, tv.ar)),
            backgroundColor: Colors.black,
            foregroundColor: Colors.white,
          ),
          body: SafeArea(
            child: Column(
              children: [
                Expanded(
                  child: Center(
                    child: error.isNotEmpty
                        ? SingleChildScrollView(
                            child: Padding(
                              padding: const EdgeInsets.all(32),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(
                                    Icons.wifi_off,
                                    color: Color(0xffc8b78d),
                                    size: 64,
                                  ),
                                  const SizedBox(height: 20),
                                  Text(
                                    label('Unable to play', 'تعذّر التشغيل'),
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 28,
                                    ),
                                  ),
                                  const SizedBox(height: 12),
                                  Text(
                                    error,
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      color: Colors.white70,
                                    ),
                                  ),
                                  const SizedBox(height: 24),
                                  Wrap(
                                    spacing: 16,
                                    runSpacing: 16,
                                    children: [
                                      if (!catalogueChanged)
                                        TvButton(
                                          autofocus: true,
                                          onPressed: open,
                                          child: Text(
                                            label('Retry', 'إعادة المحاولة'),
                                          ),
                                        ),
                                      TvButton(
                                        onPressed: close,
                                        child: Text(
                                          label(
                                            'Back to catalogue',
                                            'العودة إلى المحتوى',
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          )
                        : !ready
                        ? const CircularProgressIndicator(
                            color: Color(0xffc8b78d),
                          )
                        : radio
                        ? const Icon(
                            Icons.radio,
                            size: 140,
                            color: Color(0xffc8b78d),
                          )
                        : AspectRatio(
                            aspectRatio: c!.value.aspectRatio,
                            child: VideoPlayer(c),
                          ),
                  ),
                ),
                if (ready)
                  Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (resumable) ...[
                          VideoProgressIndicator(
                            c!,
                            allowScrubbing: true,
                            colors: const VideoProgressColors(
                              playedColor: Color(0xffc8b78d),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            '${clock(c.value.position)} / ${clock(c.value.duration)}',
                            style: const TextStyle(color: Colors.white),
                          ),
                          const SizedBox(height: 12),
                        ],
                        Wrap(
                          alignment: WrapAlignment.center,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          spacing: 14,
                          runSpacing: 12,
                          children: [
                            if (resumable)
                              TvButton(
                                label: label(
                                  'Back 10 seconds',
                                  'رجوع عشر ثوانٍ',
                                ),
                                onPressed: () => seek(-10),
                                child: const Icon(Icons.replay_10),
                              ),
                            TvButton(
                              autofocus: true,
                              label: label(
                                'Play or pause',
                                'تشغيل أو إيقاف مؤقت',
                              ),
                              onPressed: toggle,
                              child: Icon(
                                c!.value.isPlaying
                                    ? Icons.pause
                                    : Icons.play_arrow,
                              ),
                            ),
                            if (resumable)
                              TvButton(
                                label: label(
                                  'Forward 30 seconds',
                                  'تقدّم ثلاثين ثانية',
                                ),
                                onPressed: () => seek(30),
                                child: const Icon(Icons.forward_30),
                              ),
                            if (resumable)
                              TvButton(
                                onPressed: startOver,
                                child: Text(
                                  label('Start over', 'البدء من جديد'),
                                ),
                              ),
                            TvButton(
                              onPressed: () async {
                                await tv.toggleFavourite(
                                  widget.kind,
                                  widget.item['id'],
                                );
                                if (mounted) setState(() {});
                              },
                              label: saved
                                  ? label(
                                      'Remove favourite',
                                      'إزالة من المفضلة',
                                    )
                                  : label(
                                      'Save favourite',
                                      'إضافة إلى المفضلة',
                                    ),
                              child: Icon(
                                saved ? Icons.favorite : Icons.favorite_border,
                              ),
                            ),
                            TvButton(
                              onPressed: close,
                              child: Text(label('Close', 'إغلاق')),
                            ),
                          ],
                        ),
                        if (c.value.isBuffering)
                          Padding(
                            padding: const EdgeInsets.only(top: 12),
                            child: Text(
                              label('Buffering…', 'جارٍ التحميل…'),
                              style: const TextStyle(color: Colors.white70),
                            ),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
