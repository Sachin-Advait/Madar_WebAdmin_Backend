import 'dart:convert';

import 'package:crypto/crypto.dart';

const supportedWidgets = {
  'featured_banner',
  'live_channel_row',
  'video_row',
  'replay_channels',
  'radio_row',
  'meeting_summary',
  'queue_summary',
  'meeting_room_grid',
  'meeting_schedule',
  'queue_calling',
  'queue_counters',
  'announcements',
  'events_row',
  'services_grid',
  'visitor_directory',
  'media_highlights',
  'priority_alerts',
  'epg_guide',
  'video_categories',
  'info_links',
};
const destinations = {
  'home': 'Home',
  'live-tv': 'Live TV',
  'videos': 'Videos',
  'replay': 'Replay',
  'radio': 'Radio',
  'info-hub': 'Info Hub',
};
const hubPages = {
  'info-meetings': 'Meeting Rooms',
  'info-queue': 'Queue Management',
  'info-notices': 'Official Notices',
  'info-events': 'Events & Training',
  'info-services': 'Services & Information',
  'info-visitor': 'Visitor Guide',
  'info-media': 'Media Highlights',
  'info-alerts': 'Priority Alerts',
};
const arabicPages = {
  'home': 'الرئيسية',
  'live-tv': 'البث المباشر',
  'videos': 'الفيديو',
  'replay': 'إعادة المشاهدة',
  'radio': 'الراديو',
  'info-hub': 'مركز المعلومات',
  'info-meetings': 'غرف الاجتماعات',
  'info-queue': 'إدارة الانتظار',
  'info-notices': 'الإعلانات الرسمية',
  'info-events': 'الفعاليات والتدريب',
  'info-services': 'الخدمات والمعلومات',
  'info-visitor': 'دليل الزائر',
  'info-media': 'أبرز الأخبار',
  'info-alerts': 'تنبيهات مهمة',
};
const sourceMap = {
  'featured_banner': 'featured',
  'live_channel_row': 'channels',
  'video_row': 'videos',
  'replay_channels': 'replay',
  'radio_row': 'radio',
  'announcements': 'notices',
  'events_row': 'events',
  'services_grid': 'services',
  'visitor_directory': 'visitor',
  'media_highlights': 'media',
  'priority_alerts': 'alerts',
  'epg_guide': 'programmes',
  'video_categories': 'videos',
};
String digestOf(List<int> bytes) => sha256.convert(bytes).toString();
bool activeItem(Map<String, dynamic> item, [DateTime? at]) {
  final now = at ?? DateTime.now();
  final start = DateTime.tryParse('${item['startAt'] ?? ''}'),
      end = DateTime.tryParse('${item['endAt'] ?? ''}');
  return item['status'] == 'published' &&
      (start == null || !now.isBefore(start)) &&
      (end == null || now.isBefore(end));
}

Map<String, dynamic> validateEnvelope(Map<String, dynamic> envelope) {
  final raw = envelope['bundleText'];
  if (raw is! String || digestOf(utf8.encode(raw)) != envelope['digest']) {
    throw const FormatException('Release checksum mismatch');
  }
  if (!RegExp(r'^[a-f0-9-]{36}$').hasMatch('${envelope['releaseId']}')) {
    throw const FormatException('Invalid release identity');
  }
  final bundle = Map<String, dynamic>.from(jsonDecode(raw) as Map);
  if (bundle['schemaVersion'] != 1 ||
      bundle['releaseId'] != envelope['releaseId'] ||
      bundle['pages'] is! Map ||
      bundle['content'] is! Map) {
    throw const FormatException('Unsupported release');
  }
  for (final page in (bundle['pages'] as Map).values) {
    if (page['sections'] is! List) {
      throw const FormatException('Invalid page layout');
    }
    for (final section in page['sections']) {
      if (!supportedWidgets.contains(section['type'])) {
        throw FormatException('Unsupported widget: ${section['type']}');
      }
      final p = section['layout'];
      if (p is! Map ||
          p['x'] is! int ||
          p['w'] is! int ||
          p['x'] < 0 ||
          p['w'] < 1 ||
          p['x'] + p['w'] > 12) {
        throw const FormatException('Invalid widget placement');
      }
    }
  }
  var total = 0;
  for (final asset in (bundle['assets'] as List? ?? [])) {
    if (!RegExp(r'^[a-f0-9-]+$').hasMatch('${asset['id']}') ||
        asset['url'] != '/api/assets/${asset['id']}' ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch('${asset['digest']}') ||
        asset['bytes'] is! int ||
        asset['bytes'] < 0) {
      throw const FormatException('Invalid asset manifest');
    }
    total += asset['bytes'] as int;
  }
  if (total > 300 * 1024 * 1024) {
    throw const FormatException('Release exceeds 300 MB cache capacity');
  }
  return bundle;
}

List<Map<String, dynamic>> contentItems(
  Map<String, dynamic> bundle,
  String kind, {
  String category = '',
  int limit = 1000,
}) {
  final items =
      ((bundle['content']?[kind] as List?) ?? [])
          .map((r) => Map<String, dynamic>.from(r))
          .where(
            (r) =>
                activeItem(r) &&
                (category.isEmpty || r['category'] == category),
          )
          .toList()
        ..sort((a, b) => (a['sortOrder'] ?? 0).compareTo(b['sortOrder'] ?? 0));
  return items.take(limit < 0 ? 0 : limit).toList();
}

String itemTitle(Map item, bool ar) =>
    ar && '${item['titleAr'] ?? ''}'.isNotEmpty
    ? '${item['titleAr']}'
    : '${item['title'] ?? ''}';
