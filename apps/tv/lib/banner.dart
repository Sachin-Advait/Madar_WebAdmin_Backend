import 'package:flutter/material.dart';

import 'controller.dart';
import 'protocol.dart';
import 'widgets.dart';

String localBroadcastDay(dynamic value) {
  final date = DateTime.tryParse('$value')?.toLocal();
  if (date == null) return '';
  return '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
}

String localBroadcastTime(dynamic value) {
  final date = DateTime.tryParse('$value')?.toLocal();
  if (date == null) return '';
  return '${date.day}/${date.month} · ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
}

bool replayReady(Map<String, dynamic> item, [DateTime? at]) {
  final now = at ?? DateTime.now(),
      end = DateTime.tryParse('${item['eventEnd'] ?? ''}');
  return item['available'] == true &&
      end != null &&
      !end.isAfter(now) &&
      activeItem(item, now);
}

class MediaBanner extends StatelessWidget {
  final TvController controller;
  final String kind;
  final Map<String, dynamic> item;
  final bool compact, portrait;
  final VoidCallback onPlay, onDetails, onFavourite;
  const MediaBanner({
    super.key,
    required this.controller,
    required this.kind,
    required this.item,
    required this.compact,
    this.portrait = false,
    required this.onPlay,
    required this.onDetails,
    required this.onFavourite,
  });
  @override
  Widget build(BuildContext context) {
    final c = controller, ar = c.ar;
    final now = DateTime.now();
    final guide = kind == 'channels'
        ? contentItems(
            c.bundle!,
            'programmes',
          ).where((p) => p['channelId'] == item['id']).toList()
        : <Map<String, dynamic>>[];
    guide.sort(
      (a, b) =>
          DateTime.parse('${a['eventStart']}')
              .compareTo(DateTime.parse('${b['eventStart']}')),
    );
    final current = guide.where((p) {
      final start = DateTime.tryParse('${p['eventStart']}'),
          end = DateTime.tryParse('${p['eventEnd']}');
      return start != null &&
          end != null &&
          !now.isBefore(start) &&
          now.isBefore(end);
    }).firstOrNull;
    final next = guide
        .where(
          (p) => DateTime.tryParse('${p['eventStart']}')?.isAfter(now) == true,
        )
        .firstOrNull;
    final override = item['bannerMode'] != 'auto' && item['bannerMode'] != null;
    String text(String field, String fallback) {
      final localized = '${item['${field}Ar'] ?? ''}';
      final value = ar && localized.isNotEmpty
          ? localized
          : '${item[field] ?? ''}';
      return override && value.isNotEmpty ? value : fallback;
    }

    final title = text('bannerTitle', itemTitle(current ?? item, ar));
    final description = text(
      'bannerDescription',
      '${(ar ? (current ?? item)['descriptionAr'] : null) ?? (current ?? item)['description'] ?? ''}',
    );
    final art =
        [
          if (portrait) item['portraitImage'],
          item['landscapeImage'],
          current?['image'],
          item['image'],
        ].map((v) => '${v ?? ''}').where((v) => v.isNotEmpty).firstOrNull ??
        '';
    final focalX = (item['focalX'] as num? ?? .5).clamp(0, 1).toDouble(),
        focalY = (item['focalY'] as num? ?? .5).clamp(0, 1).toDouble();
    final progress = c.progressFor(kind, item);
    final resume =
        progress != null &&
        progress['completed'] != true &&
        (progress['positionSeconds'] as num? ?? 0) > 0;
    final saved = c.isFavourite(kind, item['id']);
    final available = kind != 'replay' || replayReady(item, now);
    double? fraction;
    if (current != null) {
      final start = DateTime.parse(current['eventStart']),
          end = DateTime.parse(current['eventEnd']);
      fraction =
          (now.difference(start).inMilliseconds /
                  end.difference(start).inMilliseconds)
              .clamp(0, 1);
    }
    final copy = Padding(
      padding: EdgeInsets.all(compact ? 24 : 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            kind == 'channels'
                ? '${current != null ? 'ON NOW' : 'LIVE TV'} · ${itemTitle(item, ar)}'
                : kind == 'replay'
                ? 'REPLAY · ${localBroadcastTime(item['eventStart'])}'
                : kind == 'radio'
                ? 'ON AIR'
                : '${item['category'] ?? 'YOUR NEXT DISCOVERY'}'.toUpperCase(),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Color(0xffd9cba8),
              letterSpacing: 2,
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 14),
          Text(
            title,
            key: const ValueKey('media-banner-title'),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: compact ? 29 : 40,
              height: 1.12,
              color: Colors.white,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            description,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Color(0xffe3e6da), height: 1.4),
          ),
          if (fraction != null) ...[
            const SizedBox(height: 16),
            LinearProgressIndicator(
              value: fraction,
              color: const Color(0xffd9cba8),
              backgroundColor: Colors.white24,
            ),
            const SizedBox(height: 8),
            Text(
              'Next · ${next == null ? 'Guide unavailable' : itemTitle(next, ar)}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Color(0xffe3e6da), fontSize: 13),
            ),
          ],
          if (kind == 'replay') ...[
            const SizedBox(height: 10),
            Text(
              available
                  ? item['endAt'] != null
                        ? 'Available until ${localBroadcastTime(item['endAt'])}'
                        : 'Provider availability applies'
                  : 'Replay unavailable from provider',
              style: const TextStyle(color: Color(0xffe3e6da), fontSize: 13),
            ),
          ],
          if (resume) ...[
            const SizedBox(height: 10),
            Text(
              'Resume from ${((progress['positionSeconds'] as num) / 60).floor()} min',
              style: const TextStyle(color: Color(0xffe3e6da), fontSize: 13),
            ),
          ],
          const SizedBox(height: 20),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              if (available)
                TvButton(
                  key: const ValueKey('hero-play'),
                  onPressed: onPlay,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 18,
                    vertical: 12,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.play_arrow),
                      const SizedBox(width: 7),
                      Text(
                        ar
                            ? 'تشغيل'
                            : kind == 'channels'
                            ? 'Watch live'
                            : resume
                            ? 'Resume'
                            : 'Play',
                      ),
                    ],
                  ),
                ),
              TvButton(
                key: const ValueKey('hero-favourite'),
                label: saved ? 'Remove favourite' : 'Save favourite',
                onPressed: onFavourite,
                padding: const EdgeInsets.all(12),
                child: Icon(saved ? Icons.favorite : Icons.favorite_border),
              ),
              TvButton(
                key: const ValueKey('hero-details'),
                onPressed: onDetails,
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
                child: Text(ar ? 'التفاصيل' : 'Details'),
              ),
            ],
          ),
        ],
      ),
    );
    Widget image() => Stack(
      fit: StackFit.expand,
      children: [
        Artwork(
          url: art,
          local: c.cachedAsset(art),
          alignment: Alignment(focalX * 2 - 1, focalY * 2 - 1),
        ),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: compact
                  ? Alignment.topCenter
                  : AlignmentDirectional.centerStart.resolve(
                      Directionality.of(context),
                    ),
              end: compact
                  ? Alignment.bottomCenter
                  : AlignmentDirectional.centerEnd.resolve(
                      Directionality.of(context),
                    ),
              colors: const [Color(0x4428382e), Color(0x0028382e)],
            ),
          ),
        ),
        if (art.isEmpty)
          Center(
            child: Image.asset(
              'assets/madar-logo.png',
              width: 110,
              color: bronze,
              colorBlendMode: BlendMode.srcIn,
            ),
          ),
      ],
    );
    return Container(
      key: const ValueKey('contextual-media-banner'),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: const Color(0xff28382e),
        borderRadius: BorderRadius.circular(24),
      ),
      child: compact
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(height: 210, child: image()),
                copy,
              ],
            )
          : ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 365),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Positioned.fill(
                    child: Row(
                      children: [
                        const Expanded(flex: 6, child: SizedBox()),
                        Expanded(flex: 5, child: image()),
                      ],
                    ),
                  ),
                  Row(
                    children: [
                      Expanded(flex: 6, child: copy),
                      const Expanded(flex: 5, child: SizedBox()),
                    ],
                  ),
                ],
              ),
            ),
    );
  }
}
