import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:madar_tv/application.dart';
import 'package:madar_tv/controller.dart';
import 'package:madar_tv/experience.dart';

void main() {
  testWidgets(
    'profile restrictions hide old content before replacement download',
    (tester) async {
      final data = jsonDecode(File('assets/demo.json').readAsStringSync());
      final c = TvController()
        ..demo = true
        ..bundle = Map<String, dynamic>.from(data['bundle']);
      await tester.pumpWidget(MadarApp(controller: c));
      expect(find.byType(TvExperience), findsOneWidget);
      c.config['profile'] = {
        ...c.bundle!['profile'],
        'allowedSections': ['home'],
      };
      c.changed();
      await tester.pump();
      expect(find.byType(TvExperience), findsNothing);
      expect(find.text('Updating this screen’s profile…'), findsOneWidget);
      c.bundle!['pages'] = {'home': c.bundle!['pages']['home']};
      c.changed();
      await tester.pump();
      expect(find.byType(TvExperience), findsOneWidget);
      c.config['profile'] = {
        ...c.config['profile'],
        'id': 'different-audience',
      };
      c.changed();
      await tester.pump();
      expect(find.byType(TvExperience), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      c.dispose();
    },
  );
}
