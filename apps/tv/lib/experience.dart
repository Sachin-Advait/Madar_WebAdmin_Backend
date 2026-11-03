import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'controller.dart';
import 'details.dart';
import 'protocol.dart';
import 'widgets.dart';
import 'adaptive.dart';
import 'banner.dart';

const hubIcons = {
  'info-meetings': Icons.meeting_room_outlined,
  'info-queue': Icons.people_outline,
  'info-notices': Icons.campaign_outlined,
  'info-events': Icons.event_outlined,
  'info-services': Icons.account_balance_outlined,
  'info-visitor': Icons.map_outlined,
  'info-media': Icons.photo_library_outlined,
  'info-alerts': Icons.warning_amber_rounded,
};

class TvExperience extends StatefulWidget {
  final TvController controller;
  const TvExperience({super.key, required this.controller});
  @override
  State<TvExperience> createState() => _TvExperienceState();
}

class _TvExperienceState extends State<TvExperience> {
  String category = '', oldPage = '', channelFilter = '', dateFilter = '';
  int tick = 0, hubTab = 0;
  Timer? clock;
  final focusedItems = <String, Map<String, dynamic>>{};
  TvController get c => widget.controller;
  Map<String, dynamic> get settings => {
    ...Map<String, dynamic>.from(c.bundle?['profile']?['experience'] ?? {}),
    ...Map<String, dynamic>.from(c.config['experience'] ?? {}),
  };
  @override
  void initState() {
    super.initState();
    clock = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => tick++);
    });
  }

  @override
  void dispose() {
    clock?.cancel();
    super.dispose();
  }

  String pageName(String key) => key == 'favourites'
      ? (c.ar ? 'المفضلة' : 'Favourites')
      : c.ar
      ? arabicPages[key] ?? hubPages[key] ?? key
      : destinations[key] ?? hubPages[key] ?? key;
  void go(String page) {
    setState(() {
      category = '';
      channelFilter = '';
      dateFilter = '';
    });
    c.navigate(page);
  }

  Future<void> details(String kind, Map<String, dynamic> item) async {
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ContentDetails(controller: c, item: item, kind: kind),
      ),
    );
    if (mounted) setState(() {});
  }

  Future<void> choose(String kind, Map<String, dynamic> item) async {
    final focus = FocusManager.instance.primaryFocus;
    if (kind == 'replay' && !replayReady(item)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('This programme is not available for replay.'),
        ),
      );
      return;
    }
    if (kind == 'featured') {
      if (item['targetType'] == 'info-page') {
        go(item['targetId']);
        return;
      }
      final k = {
        'video': 'videos',
        'channel': 'channels',
        'event': 'events',
        'notice': 'notices',
      }[item['targetType']];
      final target = contentItems(
        c.bundle!,
        k ?? '',
      ).where((r) => r['id'] == item['targetId']).firstOrNull;
      if (target != null) {
        await choose(k!, target);
        return;
      }
    }
    if (['videos', 'replay', 'channels', 'radio'].contains(kind)) {
      await openMedia(context, c, kind, item);
    } else {
      await details(kind, item);
    }
    if (mounted) {
      setState(() {});
      if (focus?.context != null) focus!.requestFocus();
    }
  }

  void back() => go(
    c.page.startsWith('info-') && c.page != 'info-hub' ? 'info-hub' : 'home',
  );
  @override
  Widget build(BuildContext context) {
    final b = c.bundle!, pages = b['pages'] as Map;
    if (oldPage != c.page) {
      oldPage = c.page;
      category = '';
      channelFilter = '';
      dateFilter = '';
    }
    final release = '${b['releaseId']}';
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) c.rendered(release);
    });
    final alerts = contentItems(b, 'alerts').where(
      (r) =>
          r['fullScreenOverride'] == true && pages.containsKey('info-alerts'),
    );
    if (alerts.isNotEmpty) {
      final a = alerts.first;
      return Scaffold(
        body: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(40),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.warning_amber_rounded,
                  size: 90,
                  color: bronze,
                ),
                const SizedBox(height: 30),
                Text(
                  itemTitle(a, c.ar),
                  style: Theme.of(context).textTheme.displaySmall,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 25),
                Text(
                  '${a['instructions'] ?? a['description']}',
                  style: Theme.of(context).textTheme.headlineSmall,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 30),
                Text('Valid until ${a['endAt']}'),
              ],
            ),
          ),
        ),
      );
    }
    final kind = {
      'live-tv': 'channels',
      'videos': 'videos',
      'radio': 'radio',
      'replay': 'replay',
    }[c.page];
    return PopScope(
      canPop: c.page == 'home',
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) back();
      },
      child: Shortcuts(
        shortcuts: const {
          SingleActivator(LogicalKeyboardKey.escape): DismissIntent(),
          SingleActivator(LogicalKeyboardKey.goBack): DismissIntent(),
        },
        child: Actions(
          actions: {
            DismissIntent: CallbackAction<DismissIntent>(
              onInvoke: (_) {
                back();
                return null;
              },
            ),
          },
          child: FocusTraversalGroup(
            policy: ReadingOrderTraversalPolicy(),
            child: Scaffold(
              body: SafeArea(
                child: AdaptiveTvShell(
                  orientation: '${settings['orientation'] ?? 'auto'}',
                  currentPage: c.page,
                  destinations: destinations.keys
                      .where(pages.containsKey)
                      .toList(),
                  title: pageName,
                  navigate: go,
                  footer: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 22,
                      vertical: 10,
                    ),
                    child: Row(
                      children: [
                        Icon(
                          c.demo
                              ? Icons.science_outlined
                              : c.online
                              ? Icons.wifi
                              : Icons.cloud_off,
                          size: 15,
                          color: bronze,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            c.demo
                                ? 'SAMPLE DATA · Admin-managed content demonstration'
                                : c.online
                                ? 'Connected · ${b['profile']['name']} · v${b['version']}'
                                : 'Offline · Last verified version · ${c.error}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.labelSmall,
                          ),
                        ),
                        Text(
                          c.ar ? 'مدار' : 'MADAR',
                          style: Theme.of(context).textTheme.labelSmall,
                        ),
                      ],
                    ),
                  ),
                  body: LayoutBuilder(
                    builder: (context, constraints) {
                      final padding = constraints.maxWidth < 700 ? 20.0 : 32.0,
                          width = constraints.maxWidth - padding * 2;
                      return SingleChildScrollView(
                        key: PageStorageKey('page-${c.page}'),
                        padding: EdgeInsets.all(padding),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (c.page != 'home') ...[
                              if (c.page.startsWith('info-') &&
                                  c.page != 'info-hub')
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 16),
                                  child: TvButton(
                                    onPressed: () => go('info-hub'),
                                    child: Text(
                                      c.ar
                                          ? 'مركز المعلومات'
                                          : 'Back to Info Hub',
                                    ),
                                  ),
                                ),
                              Text(
                                c.ar ? 'تجربة مدار' : 'YOUR MADAR EXPERIENCE',
                                style: const TextStyle(
                                  color: bronze,
                                  letterSpacing: 2,
                                  fontSize: 12,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                pageName(c.page),
                                style: Theme.of(context).textTheme.displaySmall,
                              ),
                              const SizedBox(height: 12),
                              Text(
                                c.page == 'favourites'
                                    ? 'Saved on this TV. Use Details or the heart action to manage favourites.'
                                    : c.page == 'replay'
                                    ? 'Choose a programme. Broadcast time and availability are supplied by your provider.'
                                    : c.page == 'info-hub'
                                    ? 'Eight sections. Four simple views.'
                                    : 'Discover information, stories and services in one place.',
                              ),
                              const SizedBox(height: 22),
                            ],
                            if (kind != null)
                              ...mediaContent(
                                kind,
                                width,
                                portrait: portraitLayout(
                                  constraints,
                                  '${settings['orientation'] ?? 'auto'}',
                                ),
                              ),
                            if (c.page == 'favourites')
                              favouriteCards()
                            else if (c.page == 'info-hub')
                              hubPanels(width, constraints)
                            else
                              ...sections(width),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget hubPanels(double width, BoxConstraints constraints) {
    final portrait = portraitLayout(
      constraints,
      '${settings['orientation'] ?? 'auto'}',
    );
    // Keep enough room for the page heading, tabs and panel controls while
    // exposing more of each direct section on a tall display.
    final panelHeight = portrait
        ? (constraints.maxHeight - 420).clamp(480.0, 1200.0)
        : 480.0;
    final configured = settings['hubGroups'] as List? ?? defaultHubGroups;
    final groups = configured
        .map((v) => Map<String, dynamic>.from(v))
        .where(
          (g) => (g['pages'] as List? ?? []).any(
            (p) => c.bundle!['pages'][p] != null,
          ),
        )
        .toList();
    if (groups.isEmpty) {
      return const Text('No Info Hub sections are enabled for this profile.');
    }
    final index = hubTab.clamp(0, groups.length - 1), group = groups[index];
    final keys = (group['pages'] as List)
        .where((p) => c.bundle!['pages'][p] != null)
        .cast<String>()
        .toList();
    final panelWidth = width >= 850 ? (width - 20) / 2 : width;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: List.generate(
            groups.length,
            (i) => TvButton(
              key: ValueKey('hub-tab-${groups[i]['id']}'),
              selected: index == i,
              onPressed: () => setState(() => hubTab = i),
              child: Text(
                '${c.ar ? groups[i]['titleAr'] ?? groups[i]['title'] : groups[i]['title']}',
              ),
            ),
          ),
        ),
        const SizedBox(height: 22),
        Wrap(
          spacing: 20,
          runSpacing: 20,
          children: keys.map((key) {
            final sections = List<Map<String, dynamic>>.from(
              (c.bundle!['pages'][key]?['sections'] as List? ?? [])
                  .where((s) => s['enabled'] == true)
                  .map((s) => Map<String, dynamic>.from(s)),
            )..sort((a, b) => (a['order'] as int).compareTo(b['order']));
            return SizedBox(
              key: ValueKey('hub-panel-$key'),
              width: panelWidth,
              child: Card(
                margin: EdgeInsets.zero,
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(hubIcons[key], color: bronze),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              pageName(key),
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      SizedBox(
                        key: ValueKey('hub-panel-content-$key'),
                        height: panelHeight,
                        child: FocusableScrollPanel(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: sections
                                .map((s) => renderSection(s, panelWidth - 42))
                                .toList(),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      TvButton(
                        onPressed: () => go(key),
                        child: Text(
                          c.ar ? 'عرض الكل' : 'View all ${pageName(key)}',
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  List<Widget> mediaContent(
    String kind,
    double width, {
    required bool portrait,
  }) {
    final all = contentItems(c.bundle!, kind),
        items = all
            .where(
              (r) =>
                  (category.isEmpty || r['category'] == category) &&
                  (channelFilter.isEmpty || r['channelId'] == channelFilter) &&
                  (dateFilter.isEmpty ||
                      localBroadcastDay(r['eventStart']) == dateFilter),
            )
            .toList();
    final focus = focusedItems[kind],
        selected =
            items.where((r) => r['id'] == focus?['id']).firstOrNull ??
            items.firstOrNull;
    final result = <Widget>[];
    if (selected != null) {
      result.add(
        MediaBanner(
          controller: c,
          kind: kind,
          item: selected,
          compact: portrait || width < 850,
          portrait: portrait,
          onPlay: () => choose(kind, selected),
          onDetails: () => details(kind, selected),
          onFavourite: () async {
            await c.toggleFavourite(kind, selected['id']);
            if (mounted) setState(() {});
          },
        ),
      );
      result.add(const SizedBox(height: 20));
    }
    result.add(
      Wrap(
        spacing: 10,
        runSpacing: 10,
        children:
            [
                  '',
                  ...all
                      .map((r) => '${r['category'] ?? ''}')
                      .where((v) => v.isNotEmpty)
                      .toSet(),
                ]
                .map(
                  (v) => TvButton(
                    selected: category == v,
                    onPressed: () => setState(() => category = v),
                    child: Text(v.isEmpty ? (c.ar ? 'الكل' : 'All') : v),
                  ),
                )
                .toList(),
      ),
    );
    if (kind == 'replay') {
      final channels = contentItems(
        c.bundle!,
        'channels',
      ).where((ch) => all.any((r) => r['channelId'] == ch['id']));
      final dates =
          all
              .map((r) => '${r['eventStart'] ?? ''}')
              .where((s) => s.length >= 10)
              .map((s) => s.substring(0, 10))
              .toSet()
              .toList()
            ..sort((a, b) => b.compareTo(a));
      result.add(
        Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              TvButton(
                selected: channelFilter.isEmpty,
                onPressed: () => setState(() => channelFilter = ''),
                child: const Text('All channels'),
              ),
              ...channels.map(
                (ch) => TvButton(
                  selected: channelFilter == ch['id'],
                  onPressed: () => setState(() => channelFilter = ch['id']),
                  child: Text(itemTitle(ch, c.ar)),
                ),
              ),
              TvButton(
                selected: dateFilter.isEmpty,
                onPressed: () => setState(() => dateFilter = ''),
                child: const Text('All dates'),
              ),
              ...dates
                  .take(14)
                  .map(
                    (d) => TvButton(
                      selected: dateFilter == d,
                      onPressed: () => setState(() => dateFilter = d),
                      child: Text(d),
                    ),
                  ),
            ],
          ),
        ),
      );
    }
    if (kind == 'videos') {
      final continuing = items.where((r) {
        final p = c.progressFor(kind, r);
        return p != null &&
            p['completed'] != true &&
            (p['positionSeconds'] as num? ?? 0) > 0;
      }).toList();
      if (continuing.isNotEmpty) {
        result.add(mediaShelf('Continue watching', continuing, kind, width));
      }
      final recommended = c.recommendations
          .where((r) => r['kind'] == kind)
          .map(
            (suggestion) =>
                items.where((r) => r['id'] == suggestion['id']).firstOrNull,
          )
          .whereType<Map<String, dynamic>>()
          .toList();
      if (recommended.isNotEmpty) {
        result.add(
          mediaShelf(
            'Recommended for this TV',
            recommended.take(6).toList(),
            kind,
            width,
          ),
        );
      }
      final saved = items.where((r) => c.isFavourite(kind, r['id'])).toList();
      if (saved.isNotEmpty) {
        result.add(mediaShelf('Favourites', saved, kind, width));
      }
      final recent = [...items]
        ..sort(
          (a, b) =>
              '${b['createdAt'] ?? ''}'.compareTo('${a['createdAt'] ?? ''}'),
        );
      result.add(
        mediaShelf('Recently added', recent.take(8).toList(), kind, width),
      );
    } else {
      result.add(
        mediaShelf(
          kind == 'channels'
              ? 'Watch live'
              : kind == 'replay'
              ? 'Replay programmes'
              : 'Listen now',
          items,
          kind,
          width,
        ),
      );
    }
    return result;
  }

  Widget mediaShelf(
    String title,
    List<Map<String, dynamic>> items,
    String kind,
    double width,
  ) => Column(
    key: ValueKey('shelf-$kind-$title'),
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      SectionTitle(title, note: '${items.length}'),
      cards(items, kind, width),
      if (items.isEmpty)
        const Padding(
          padding: EdgeInsets.all(18),
          child: Text('No available content matches these filters.'),
        ),
    ],
  );

  List<Widget> sections(double width) {
    final rowHeight = ['info-meetings', 'info-queue'].contains(c.page)
        ? 78.0
        : 52.0;
    final list = List<Map<String, dynamic>>.from(
      (c.bundle!['pages'][c.page]?['sections'] as List? ?? [])
          .where((s) => s['enabled'] == true)
          .map((s) => Map<String, dynamic>.from(s)),
    )..sort((a, b) => (a['order'] as int).compareTo(b['order']));
    final result = <Widget>[];
    for (var i = 0; i < list.length;) {
      final section = list[i];
      if (['live-tv', 'videos', 'replay', 'radio'].contains(c.page) &&
          [
            'featured_banner',
            'video_row',
            'live_channel_row',
            'replay_channels',
            'radio_row',
            'video_categories',
          ].contains(section['type'])) {
        i++;
        continue;
      }
      if (!isOperational(section['type'])) {
        result.add(
          Padding(
            padding: const EdgeInsets.only(bottom: 24),
            child: renderSection(section, width),
          ),
        );
        i++;
        continue;
      }
      final group = <Map<String, dynamic>>[];
      while (i < list.length && isOperational(list[i]['type'])) {
        group.add(list[i++]);
      }
      if (width < 750) {
        result.addAll(
          group.map(
            (s) => Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: renderSection(s, width),
            ),
          ),
        );
        continue;
      }
      final minY = group
              .map((s) => s['layout']['y'] as int)
              .reduce((a, b) => a < b ? a : b),
          maxY = group
              .map((s) => (s['layout']['y'] + s['layout']['h']) as int)
              .reduce((a, b) => a > b ? a : b);
      result.add(
        SizedBox(
          height: (maxY - minY) * rowHeight + 20,
          child: Stack(
            children: group.map((s) {
              final l = s['layout'];
              return Positioned(
                left: l['x'] / 12 * width,
                top: (l['y'] - minY) * rowHeight,
                width: l['w'] / 12 * width - 16,
                height: l['h'] * rowHeight - 16,
                child: FocusableScrollPanel(
                  child: renderSection(s, l['w'] / 12 * width - 16),
                ),
              );
            }).toList(),
          ),
        ),
      );
    }
    return result;
  }

  bool isOperational(String type) =>
      type.startsWith('meeting_') || type.startsWith('queue_');
  Widget renderSection(Map<String, dynamic> s, double width) {
    final type = s['type'] as String,
        props = Map<String, dynamic>.from(s['props']);
    if (isOperational(type)) return operation(type, props);
    if (type == 'info_links') {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionTitle('${props['title'] ?? 'Info Hub'}'),
          Wrap(
            spacing: 16,
            runSpacing: 16,
            children: hubPages.entries
                .where((e) => c.bundle!['pages'][e.key] != null)
                .map(
                  (e) => SizedBox(
                    width: width < 600
                        ? width
                        : width >= 1200
                        ? (width - 48) / 4
                        : (width - 32) / 3,
                    child: TvButton(
                      onPressed: () => go(e.key),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(hubIcons[e.key], color: bronze, size: 30),
                          const SizedBox(height: 20),
                          Text(
                            pageName(e.key),
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 12),
                          const Icon(
                            Icons.arrow_forward,
                            size: 20,
                            color: bronze,
                          ),
                        ],
                      ),
                    ),
                  ),
                )
                .toList(),
          ),
        ],
      );
    }
    final source = sourceMap[type] ?? '', filter = '${props['category'] ?? ''}';
    final items = contentItems(
      c.bundle!,
      source,
      category: category.isNotEmpty ? category : filter,
    ).take((props['limit'] ?? 8) as int).toList();
    if (type == 'video_categories') return const SizedBox.shrink();
    if (type == 'featured_banner') {
      if (items.isEmpty) return const SizedBox.shrink();
      final rotation = (props['autoRotateSeconds'] ?? 8) as int,
          r = items[rotation > 0 ? (tick ~/ rotation) % items.length : 0];
      return ClipRRect(
        borderRadius: BorderRadius.circular(22),
        child: SizedBox(
          height: width < 700 ? 340 : 390,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Artwork(url: r['image'], local: c.cachedAsset(r['image'])),
              Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Color(0xee28382e), Color(0x3328382e)],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(36),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      c.ar ? 'أهلاً بكم في مدار' : 'WELCOME TO YOUR WORLD',
                      style: const TextStyle(
                        color: Color(0xffd9cba8),
                        letterSpacing: 2,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 18),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 640),
                      child: Text(
                        itemTitle(r, c.ar),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: width < 700 ? 30 : 44,
                          height: 1.12,
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 560),
                      child: Text(
                        '${c.ar ? r['descriptionAr'] ?? r['description'] : r['description'] ?? ''}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Color(0xffe3e6da),
                          height: 1.5,
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    TvButton(
                      onPressed: () => choose('featured', r),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.play_arrow, color: bronze),
                          const SizedBox(width: 8),
                          Text('${r['ctaText'] ?? 'Explore now'}'),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }
    if (type == 'epg_guide') {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionTitle(
            '${props['title'] ?? 'Programme guide'}',
            note: c.demo ? 'SAMPLE' : 'PUBLISHED',
          ),
          ...items.map((r) {
            final channel = contentItems(
              c.bundle!,
              'channels',
            ).where((x) => x['id'] == r['channelId']).firstOrNull;
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: TvButton(
                onPressed: () {
                  if (channel != null) choose('channels', channel);
                },
                child: Row(
                  children: [
                    SizedBox(
                      width: width < 600 ? 100 : 180,
                      child: Text('${channel?['title'] ?? 'Channel'}'),
                    ),
                    Expanded(child: Text(itemTitle(r, c.ar))),
                    Text(
                      '${DateTime.tryParse(r['eventStart'] ?? '')?.toLocal().toString().substring(11, 16) ?? ''} – ${DateTime.tryParse(r['eventEnd'] ?? '')?.toLocal().toString().substring(11, 16) ?? ''}',
                    ),
                  ],
                ),
              ),
            );
          }),
          if (items.isEmpty) const Text('No published programme schedule.'),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle('${props['title'] ?? source}', note: '${items.length}'),
        cards(
          items,
          source,
          width,
          compact: props['displayStyle'] == 'compact',
        ),
        if (items.isEmpty)
          Padding(
            padding: const EdgeInsets.all(20),
            child: Text(
              c.ar
                  ? 'لا يوجد محتوى منشور حالياً.'
                  : 'No published content in this section.',
            ),
          ),
      ],
    );
  }

  Widget cards(
    List<Map<String, dynamic>> items,
    String source,
    double width, {
    bool compact = false,
  }) {
    final columns = width < 600
            ? 1
            : width < 950
            ? 2
            : width < 1400
            ? 3
            : 4,
        cardWidth = (width - (columns - 1) * 18) / columns;
    final playable = ['channels', 'radio', 'videos', 'replay'].contains(source);
    return Wrap(
      spacing: 18,
      runSpacing: 18,
      children: items.map((r) {
        final progress = c.progressFor(source, r),
            saved = c.isFavourite(source, r['id']);
        final position = (progress?['positionSeconds'] as num? ?? 0).toDouble(),
            duration = (progress?['durationSeconds'] as num? ?? 0).toDouble();
        final ready = source != 'replay' || replayReady(r);
        final image = '${r['image'] ?? ''}';
        return SizedBox(
          width: cardWidth,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TvButton(
                key: ValueKey('card-$source-${r['id']}'),
                label: itemTitle(r, c.ar),
                padding: EdgeInsets.zero,
                onFocusChange: (value) {
                  if (value &&
                      playable &&
                      focusedItems[source]?['id'] != r['id']) {
                    setState(() => focusedItems[source] = r);
                  }
                },
                onPressed: () => choose(source, r),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        height: compact ? 100 : 150,
                        width: double.infinity,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            if (image.isNotEmpty)
                              Artwork(url: image, local: c.cachedAsset(image))
                            else
                              Container(
                                color: const Color(0xffe5e6d8),
                                child: Icon(
                                  source == 'radio'
                                      ? Icons.headphones
                                      : source == 'channels'
                                      ? Icons.live_tv
                                      : Icons.play_circle_outline,
                                  size: 44,
                                  color: bronze,
                                ),
                              ),
                            if (source == 'channels')
                              Positioned(
                                top: 12,
                                left: 12,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 5,
                                  ),
                                  decoration: BoxDecoration(
                                    color: const Color(0xff28382e),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    'CH ${r['number'] ?? ''}',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 12,
                                    ),
                                  ),
                                ),
                              ),
                            if (saved)
                              const Positioned(
                                top: 12,
                                right: 12,
                                child: Icon(Icons.favorite, color: bronze),
                              ),
                          ],
                        ),
                      ),
                      if (duration > 0)
                        LinearProgressIndicator(
                          value: (position / duration).clamp(0, 1),
                          color: bronze,
                          minHeight: 4,
                        ),
                      Padding(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${r['category'] ?? source}'.toUpperCase(),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: bronze,
                                fontSize: 11,
                                letterSpacing: 1,
                              ),
                            ),
                            const SizedBox(height: 9),
                            Text(
                              itemTitle(r, c.ar),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            if (source == 'replay') ...[
                              const SizedBox(height: 9),
                              Text(
                                localBroadcastTime(r['eventStart']),
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                              Text(
                                ready
                                    ? 'Until ${localBroadcastTime(r['endAt'])}'
                                    : 'Unavailable',
                                style: Theme.of(context).textTheme.labelSmall
                                    ?.copyWith(color: bronze),
                              ),
                            ] else if (progress != null) ...[
                              const SizedBox(height: 9),
                              Text(
                                progress['completed'] == true
                                    ? 'Watched'
                                    : '${(position / 60).floor()} min viewed · Resume',
                                style: Theme.of(context).textTheme.labelSmall
                                    ?.copyWith(color: bronze),
                              ),
                            ] else if (!compact) ...[
                              const SizedBox(height: 9),
                              Text(
                                '${r['venue'] ?? r['floor'] ?? r['description'] ?? ''}',
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (playable) ...[
                const SizedBox(height: 7),
                Row(
                  children: [
                    Expanded(
                      child: TvButton(
                        key: ValueKey('details-$source-${r['id']}'),
                        onPressed: () => details(source, r),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 10,
                        ),
                        child: Text(
                          c.ar ? 'التفاصيل' : 'Details',
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                    ),
                    const SizedBox(width: 7),
                    TvButton(
                      key: ValueKey('favourite-$source-${r['id']}'),
                      label: saved ? 'Remove favourite' : 'Save favourite',
                      onPressed: () async {
                        await c.toggleFavourite(source, r['id']);
                        if (mounted) setState(() {});
                      },
                      padding: const EdgeInsets.all(10),
                      child: Icon(
                        saved ? Icons.favorite : Icons.favorite_border,
                        size: 20,
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        );
      }).toList(),
    );
  }

  Widget favouriteCards() {
    final groups = <String, List<Map<String, dynamic>>>{};
    for (final key in c.favourites) {
      final parts = key.split('/');
      if (parts.length != 2) continue;
      final item = contentItems(
        c.bundle!,
        parts[0],
      ).where((r) => r['id'] == parts[1]).firstOrNull;
      if (item != null) {
        (groups[parts[0]] ??= []).add(item);
      }
    }
    return LayoutBuilder(
      builder: (context, constraints) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Viewing history: ${c.historyMode}. Favourites belong to this TV.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          TvButton(
            onPressed: resetPreferences,
            child: const Text('Reset this TV’s preferences'),
          ),
          if (groups.isEmpty)
            const Padding(
              padding: EdgeInsets.all(30),
              child: Text('Your favourites will appear here.'),
            ),
          for (final group in groups.entries) ...[
            SectionTitle(group.key),
            cards(group.value, group.key, constraints.maxWidth),
          ],
        ],
      ),
    );
  }

  Future<void> resetPreferences() async {
    final reset = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Reset this TV’s preferences?'),
        content: const Text(
          'Clear saved favourites, viewing progress and learned interests for this device.',
        ),
        actions: [
          TextButton(
            autofocus: true,
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Reset'),
          ),
        ],
      ),
    );
    if (reset != true || !mounted) return;
    try {
      await c.resetPreferences();
      if (mounted) setState(() {});
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  Widget operation(String type, Map props) {
    final meeting = type.startsWith('meeting'),
        data = c.operations[meeting ? 'meeting' : 'queue'] as Map?;
    if (data == null || data['availability'] == 'unconnected') {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(26),
          child: Column(
            children: [
              const Icon(Icons.cloud_off, color: bronze),
              Text('${props['title']}'),
              const Text('No current operational data. Check the connection.'),
            ],
          ),
        ),
      );
    }
    final values = meeting
        ? {
            'Meetings today': data['todayMeetings'],
            'In progress': data['ongoing'],
            'Upcoming': data['upcoming'],
          }
        : {
            'Served today': data['servedToday'],
            'Waiting': data['waiting'],
            'Active counters': data['activeCounters'],
          };
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(22),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SectionTitle(
              '${props['title']}',
              note: data['availability'] == 'stale'
                  ? 'STALE'
                  : c.demo
                  ? 'SAMPLE'
                  : '${data['availability']}'.toUpperCase(),
            ),
            if (type.endsWith('_summary'))
              Row(
                children: values.entries
                    .map(
                      (e) => Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${e.value ?? '—'}',
                              style: Theme.of(context).textTheme.displaySmall,
                            ),
                            Text(
                              e.key,
                              style: Theme.of(context).textTheme.labelSmall,
                            ),
                          ],
                        ),
                      ),
                    )
                    .toList(),
              ),
            if (type == 'meeting_room_grid' || type == 'queue_counters')
              Wrap(
                spacing: 14,
                runSpacing: 14,
                children:
                    ((data[meeting ? 'rooms' : 'counters'] as List?) ?? [])
                        .map(
                          (r) => Container(
                            width: 150,
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: bronze.withValues(alpha: .06),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Icon(
                                  Icons.circle,
                                  size: 9,
                                  color:
                                      [
                                        'available',
                                        'serving',
                                      ].contains(r['status'])
                                      ? const Color(0xff7f9664)
                                      : bronze,
                                ),
                                const SizedBox(height: 10),
                                Text('${r['name']}'),
                                Text(
                                  '${r['status']}',
                                  style: Theme.of(context).textTheme.labelSmall,
                                ),
                              ],
                            ),
                          ),
                        )
                        .toList(),
              ),
            if (type == 'meeting_schedule')
              ...((data['schedule'] as List?) ?? []).map(
                (r) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 85,
                        child: Text(
                          DateTime.tryParse('${r['time']}')
                                  ?.toLocal()
                                  .toString()
                                  .substring(11, 16) ??
                              '${r['time']}',
                        ),
                      ),
                      Expanded(child: Text('${r['title']}')),
                      Text(
                        '${r['room']}',
                        style: Theme.of(context).textTheme.labelSmall,
                      ),
                    ],
                  ),
                ),
              ),
            if (type == 'queue_calling')
              Wrap(
                spacing: 18,
                runSpacing: 18,
                children: ((data['calls'] as List?) ?? [])
                    .map(
                      (r) => Container(
                        padding: const EdgeInsets.all(18),
                        decoration: BoxDecoration(
                          color: bronze.withValues(alpha: .08),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Column(
                          children: [
                            const Text(
                              'NOW CALLING',
                              style: TextStyle(
                                fontSize: 10,
                                letterSpacing: 2,
                                color: bronze,
                              ),
                            ),
                            const SizedBox(height: 10),
                            Text(
                              '${r['ticket']}',
                              style: Theme.of(context).textTheme.headlineLarge,
                            ),
                            Text('${r['counter']}'),
                          ],
                        ),
                      ),
                    )
                    .toList(),
              ),
          ],
        ),
      ),
    );
  }
}
