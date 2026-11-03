import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madar_tv/application.dart';
import 'package:madar_tv/controller.dart';
import 'package:madar_tv/details.dart';
import 'package:madar_tv/widgets.dart';
import 'package:madar_tv/protocol.dart';

TvController controller() {
  final data = jsonDecode(File('assets/demo.json').readAsStringSync());
  return TvController()
    ..demo = true
    ..bundle = Map<String, dynamic>.from(data['bundle'])
    ..operations = Map<String, dynamic>.from(data['operations']);
}

void main() {
  testWidgets(
    'all six destinations and eight Info Hub pages render without exceptions',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(1920, 1080));
      final c = controller();
      await tester.pumpWidget(MadarApp(controller: c));
      await tester.pump(const Duration(milliseconds: 200));
      for (final page in [...destinations.keys, ...hubPages.keys]) {
        c.navigate(page);
        await tester.pump(const Duration(milliseconds: 200));
        expect(tester.takeException(), isNull, reason: page);
        expect(
          find.text(
            page == 'home' ? 'Home' : destinations[page] ?? hubPages[page]!,
          ),
          findsWidgets,
        );
      }
      c.navigate('favourites');
      await tester.pump();
      expect(find.text('Your favourites will appear here.'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
      c.dispose();
      await tester.binding.setSurfaceSize(null);
    },
  );
  testWidgets('remote arrows move focus and Select activates controls', (
    tester,
  ) async {
    var count = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FocusTraversalGroup(
            child: Row(
              children: [
                TvButton(
                  autofocus: true,
                  onPressed: () => count = 1,
                  child: const Text('First'),
                ),
                TvButton(
                  onPressed: () => count = 2,
                  child: const Text('Second'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.select);
    expect(count, 1);
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.select);
    expect(count, 2);
  });
  testWidgets(
    'touch details show custom fields and toggle a device favourite',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(1280, 900));
      final c = controller();
      c.bundle!['displayFields']['services'] = [
        {'key': 'fee', 'label': 'Service fee', 'showOnTv': true},
      ];
      final item = Map<String, dynamic>.from(
        c.bundle!['content']['services'][0],
      );
      item['image'] = '';
      item['customFields'] = {'fee': 25};
      await tester.pumpWidget(
        MaterialApp(
          home: ContentDetails(controller: c, item: item, kind: 'services'),
        ),
      );
      await tester.pump();
      expect(find.text('Service fee'), findsOneWidget);
      await tester.tap(find.text('Save favourite'));
      await tester.pump();
      expect(c.isFavourite('services', item['id']), isTrue);
      expect(find.text('Remove favourite'), findsOneWidget);
      await tester.tap(find.text('Remove favourite'));
      await tester.pump();
      expect(c.isFavourite('services', item['id']), isFalse);
      await tester.pumpWidget(const SizedBox.shrink());
      c.dispose();
      await tester.binding.setSurfaceSize(null);
    },
  );
  testWidgets('RTL and tablet layout remain usable', (tester) async {
    await tester.binding.setSurfaceSize(const Size(800, 600));
    final c = controller();
    c.bundle!['profile']['theme']['language'] = 'ar';
    await tester.pumpWidget(MadarApp(controller: c));
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('الرئيسية'), findsOneWidget);
    expect(tester.takeException(), isNull);
    c.navigate('info-hub');
    await tester.pump();
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    c.dispose();
    await tester.binding.setSurfaceSize(null);
  });
}
