import 'package:flutter/material.dart';

import 'pdf_viewer.dart';

import 'package:qr_flutter/qr_flutter.dart';

import 'controller.dart';
import 'protocol.dart';
import 'widgets.dart';
import 'player.dart';

Future<void> openMedia(
  BuildContext context,
  TvController controller,
  String kind,
  Map<String, dynamic> item, {
  bool startOver = false,
}) async {
  await Navigator.push(
    context,
    MaterialPageRoute(
      builder: (_) => PlayerScreen(
        controller: controller,
        kind: kind,
        item: item,
        startOver: startOver,
      ),
    ),
  );
}

class ContentDetails extends StatefulWidget {
  final TvController controller;
  final Map<String, dynamic> item;
  final String kind;
  const ContentDetails({
    super.key,
    required this.controller,
    required this.item,
    required this.kind,
  });
  @override
  State<ContentDetails> createState() => _ContentDetailsState();
}

class _ContentDetailsState extends State<ContentDetails> {
  String error = '';
  bool loading = false;
  Future<void> play({bool startOver = false}) async {
    setState(() => loading = true);
    try {
      if (mounted) {
        await openMedia(
          context,
          widget.controller,
          widget.kind,
          widget.item,
          startOver: startOver,
        );
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller, r = widget.item, ar = c.ar;
    final saved = c.isFavourite(widget.kind, r['id']);
    final progress = c.progressFor(widget.kind, r);
    final canResume =
        progress != null &&
        progress['completed'] != true &&
        ((progress['positionSeconds'] as num?) ?? 0) > 0;
    final fields = Map<String, dynamic>.from(r['customFields'] ?? {});
    final definitions = c.bundle?['displayFields']?[widget.kind] as List? ?? [];
    final labels = {
      'referenceNumber': 'Reference',
      'department': 'Department',
      'venue': 'Venue',
      'organizer': 'Organizer',
      'eventStart': 'Starts',
      'eventEnd': 'Ends',
      'requirements': 'Requirements',
      'contact': 'Contact',
      'hours': 'Service hours',
      'floor': 'Floor',
      'building': 'Building',
      'openingHours': 'Opening hours',
      'accessibility': 'Accessibility',
      'instructions': 'Instructions',
      'audience': 'Audience',
      'retentionDays': 'Replay retention (days)',
    };
    return Scaffold(
      appBar: AppBar(title: Text(itemTitle(r, ar))),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(32),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1100),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if ('${r['image'] ?? ''}'.isNotEmpty)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(20),
                    child: SizedBox(
                      width: double.infinity,
                      height: 260,
                      child: Artwork(
                        url: r['image'],
                        local: c.cachedAsset(r['image']),
                      ),
                    ),
                  ),
                const SizedBox(height: 24),
                Text(
                  '${r['category'] ?? widget.kind}'.toUpperCase(),
                  style: const TextStyle(color: bronze, letterSpacing: 2),
                ),
                const SizedBox(height: 12),
                Text(
                  itemTitle(r, ar),
                  style: Theme.of(context).textTheme.headlineLarge,
                ),
                const SizedBox(height: 16),
                Text(
                  '${ar && '${r['descriptionAr'] ?? ''}'.isNotEmpty ? r['descriptionAr'] : r['description'] ?? ''}',
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
                const SizedBox(height: 24),
                Wrap(
                  spacing: 16,
                  runSpacing: 12,
                  children: [
                    if ([
                      'channels',
                      'videos',
                      'radio',
                      'replay',
                    ].contains(widget.kind))
                      TvButton(
                        autofocus: true,
                        onPressed: () => loading ? null : play(),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              widget.kind == 'radio'
                                  ? Icons.headphones
                                  : Icons.play_arrow,
                            ),
                            const SizedBox(width: 10),
                            Text(
                              loading
                                  ? 'Preparing…'
                                  : ar
                                  ? 'تشغيل'
                                  : canResume
                                  ? 'Resume'
                                  : 'Play',
                            ),
                          ],
                        ),
                      ),
                    if (canResume)
                      TvButton(
                        onPressed: () => play(startOver: true),
                        child: Text(ar ? 'البدء من جديد' : 'Start over'),
                      ),
                    TvButton(
                      onPressed: () async {
                        await c.toggleFavourite(widget.kind, r['id']);
                        if (mounted) setState(() {});
                      },
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(saved ? Icons.favorite : Icons.favorite_border),
                          const SizedBox(width: 10),
                          Text(
                            saved
                                ? (ar ? 'إزالة من المفضلة' : 'Remove favourite')
                                : (ar ? 'إضافة إلى المفضلة' : 'Save favourite'),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                if (error.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Text(
                      error,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ),
                const SizedBox(height: 20),
                ...labels.entries
                    .where((e) => r[e.key] != null && '${r[e.key]}'.isNotEmpty)
                    .map((e) => detail(e.value, '${r[e.key]}')),
                ...fields.entries.map((e) {
                  final def = definitions
                      .where((f) => f['key'] == e.key)
                      .firstOrNull;
                  final english = def == null ? e.key : '${def['label']}';
                  final arabic = def == null ? '' : '${def['labelAr'] ?? ''}';
                  return detail(
                    ar && arabic.isNotEmpty ? arabic : english,
                    '${e.value}',
                  );
                }),
                const SizedBox(height: 20),
                Wrap(
                  spacing: 20,
                  runSpacing: 20,
                  children:
                      [
                        'serviceUrl',
                        'registrationUrl',
                        'directionUrl',
                        'attachmentUrl',
                      ].where((key) => '${r[key] ?? ''}'.isNotEmpty).map((key) {
                        final url = '${r[key]}', file = c.cachedAsset(url);
                        if (file != null && key == 'attachmentUrl') {
                          return TvButton(
                            onPressed: () => Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => PdfScreen(file: file),
                              ),
                            ),
                            child: const Text('Open PDF attachment'),
                          );
                        }
                        if (!url.startsWith('https://')) {
                          return const SizedBox.shrink();
                        }
                        return Container(
                          width: 230,
                          padding: const EdgeInsets.all(18),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Column(
                            children: [
                              QrImageView(data: url, size: 170),
                              const SizedBox(height: 10),
                              Text(
                                key == 'registrationUrl'
                                    ? 'Scan to register'
                                    : 'Scan for more information',
                                style: const TextStyle(color: Colors.black),
                              ),
                              Text(
                                Uri.parse(url).host,
                                style: const TextStyle(color: bronze),
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                ),
                const SizedBox(height: 28),
                TvButton(
                  onPressed: () => Navigator.pop(context),
                  child: Text(ar ? 'رجوع' : 'Back'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget detail(String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 11),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 210,
          child: Text(label, style: const TextStyle(color: bronze)),
        ),
        Expanded(child: Text(value)),
      ],
    ),
  );
}
