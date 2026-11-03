import 'package:flutter/material.dart';

import 'application.dart';
import 'controller.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final controller = TvController();
  final original = FlutterError.onError;
  FlutterError.onError = (details) {
    controller.renderFailed = true;
    original?.call(details);
  };
  runApp(MadarApp(controller: controller));
  controller.start();
}
