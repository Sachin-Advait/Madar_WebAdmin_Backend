import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'controller.dart';
import 'experience.dart';
import 'widgets.dart';

// Configuration can tighten access before the replacement bundle is downloaded.
// Never keep rendering an earlier audience's data during that staging window.
bool mayDisplayBundle(TvController controller) {
  final bundle = controller.bundle;
  if (bundle == null) return false;
  final current = controller.config['profile'];
  if (current is! Map) return true;
  final previous = bundle['profile'];
  if (previous is! Map ||
      current['id'] != previous['id'] ||
      current['profileType'] != previous['profileType']) {
    return false;
  }
  final allowed = current['allowedSections'] as List? ?? [];
  return allowed.contains('*') ||
      (bundle['pages'] as Map).keys.every(allowed.contains);
}

class MadarApp extends StatelessWidget {
  final TvController controller;
  const MadarApp({super.key, required this.controller});
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: controller,
    builder: (context, child) {
      final mode = controller.bundle?['profile']?['theme']?['mode'] == 'dark'
          ? Brightness.dark
          : Brightness.light;
      final hex =
          '${controller.bundle?['profile']?['theme']?['accent'] ?? '#6b5837'}'
              .replaceFirst('#', '');
      final accent = Color(int.tryParse('ff$hex', radix: 16) ?? 0xff6b5837);
      return MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'MADAR',
        locale: Locale(controller.ar ? 'ar' : 'en'),
        supportedLocales: const [Locale('en'), Locale('ar')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        theme: ThemeData(
          useMaterial3: true,
          cardTheme: CardThemeData(
            elevation: 0,
            color: mode == Brightness.light
                ? const Color(0xfffffefa)
                : const Color(0xff252d25),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
              side: BorderSide(
                color: mode == Brightness.light
                    ? const Color(0xffe6e2d6)
                    : const Color(0xff394237),
              ),
            ),
          ),
          fontFamily: controller.ar ? 'MadarArabic' : 'MadarSans',
          fontFamilyFallback: const ['MadarArabic'],
          brightness: mode,
          colorScheme: ColorScheme.fromSeed(
            seedColor: accent,
            brightness: mode,
          ),
          scaffoldBackgroundColor: mode == Brightness.light
              ? const Color(0xfff7f5ee)
              : const Color(0xff191f1a),
          dividerColor: mode == Brightness.light
              ? const Color(0xffe6e2d6)
              : const Color(0xff394237),
          textTheme: const TextTheme(
            bodyLarge: TextStyle(fontSize: 18, height: 1.5),
            bodyMedium: TextStyle(fontSize: 16, height: 1.4),
            titleLarge: TextStyle(fontSize: 23, fontWeight: FontWeight.w500),
            titleMedium: TextStyle(fontSize: 19, fontWeight: FontWeight.w500),
          ),
        ),
        home: controller.bundle == null
            ? PairingScreen(controller: controller)
            : mayDisplayBundle(controller)
            ? TvExperience(controller: controller)
            : const Scaffold(
                body: Center(
                  child: Padding(
                    padding: EdgeInsets.all(32),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        CircularProgressIndicator(),
                        SizedBox(height: 24),
                        Text('Updating this screen’s profile…'),
                        SizedBox(height: 12),
                        Text('Waiting for the new content to be verified.'),
                      ],
                    ),
                  ),
                ),
              ),
      );
    },
  );
}

class PairingScreen extends StatefulWidget {
  final TvController controller;
  const PairingScreen({super.key, required this.controller});
  @override
  State<PairingScreen> createState() => _PairingScreenState();
}

class _PairingScreenState extends State<PairingScreen> {
  late final TextEditingController url = TextEditingController(
    text: widget.controller.server,
  );
  final name = TextEditingController(text: 'MADAR TV');
  @override
  void dispose() {
    url.dispose();
    name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 540),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Image.asset(
                    'assets/madar-logo.png',
                    width: 110,
                    height: 110,
                    color: bronze,
                    colorBlendMode: BlendMode.srcIn,
                  ),
                ),
                const SizedBox(height: 35),
                Text(
                  c.paired
                      ? 'Preparing your experience'
                      : 'Welcome to your screen.',
                  style: Theme.of(context).textTheme.headlineLarge,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 18),
                const Text(
                  'Media, communication and information. Connected through MADAR.',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 30),
                if (c.paired) ...[
                  const Center(child: CircularProgressIndicator()),
                  const SizedBox(height: 20),
                  TvButton(
                    onPressed: c.sync,
                    child: const Text('Retry connection'),
                  ),
                ] else if (c.pairing != null) ...[
                  Text(
                    '${c.pairing!['code']}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 48,
                      letterSpacing: 6,
                      color: bronze,
                    ),
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    'In Admin Studio → Screens & Devices, approve this code and assign a display profile. The code expires after 10 minutes.',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 20),
                  TvButton(
                    onPressed: () => c.enroll(url.text, name.text),
                    child: const Text('Request new code'),
                  ),
                ] else ...[
                  TextField(
                    controller: url,
                    autofocus: true,
                    keyboardType: TextInputType.url,
                    decoration: const InputDecoration(
                      labelText: 'MADAR server',
                      hintText: 'https://tv.example.com',
                    ),
                  ),
                  const SizedBox(height: 20),
                  TextField(
                    controller: name,
                    decoration: const InputDecoration(labelText: 'Screen name'),
                  ),
                  const SizedBox(height: 28),
                  TvButton(
                    onPressed: () => c.enroll(url.text, name.text),
                    child: const Center(child: Text('Request pairing')),
                  ),
                  if (const bool.fromEnvironment('MADAR_DEMO')) ...[
                    const SizedBox(height: 14),
                    TvButton(
                      onPressed: c.showDemo,
                      child: const Center(
                        child: Text('Explore sample experience'),
                      ),
                    ),
                  ],
                ],
                if (c.error.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 22),
                    child: Text(
                      c.error,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                      textAlign: TextAlign.center,
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
