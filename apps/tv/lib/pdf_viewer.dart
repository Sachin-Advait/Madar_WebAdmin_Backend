import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'widgets.dart';

class PdfScreen extends StatefulWidget {
  final String file;
  const PdfScreen({super.key, required this.file});
  @override
  State<PdfScreen> createState() => _PdfScreenState();
}

class _PdfScreenState extends State<PdfScreen> {
  static const channel = MethodChannel('com.madar.tv/pdf');
  int page = 0, pages = 1;
  Uint8List? bytes;
  bool busy = false;
  String error = '';
  @override
  void initState() {
    super.initState();
    render();
  }

  Future<void> render() async {
    if (busy) return;
    setState(() {
      busy = true;
      error = '';
    });
    try {
      final result = await channel.invokeMapMethod<String, dynamic>('render', {
        'path': widget.file,
        'page': page,
        'width': 1600,
      });
      if (mounted) {
        setState(() {
          bytes = result!['bytes'] as Uint8List;
          pages = result['pages'] as int;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = 'This PDF could not be opened: $e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void turn(int delta) {
    if (busy) return;
    final next = (page + delta).clamp(0, pages - 1);
    if (next != page) {
      page = next;
      render();
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text('Document · ${page + 1} / $pages')),
    body: Column(
      children: [
        Expanded(
          child: Center(
            child: busy
                ? const CircularProgressIndicator()
                : error.isNotEmpty
                ? Text(error)
                : bytes == null
                ? const SizedBox.shrink()
                : InteractiveViewer(
                    minScale: 1,
                    maxScale: 4,
                    child: Image.memory(
                      bytes!,
                      gaplessPlayback: true,
                      fit: BoxFit.contain,
                    ),
                  ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(20),
          child: Wrap(
            spacing: 20,
            runSpacing: 12,
            children: [
              TvButton(
                autofocus: true,
                onPressed: () => turn(-1),
                child: const Text('Previous page'),
              ),
              TvButton(
                onPressed: () => turn(1),
                child: const Text('Next page'),
              ),
              TvButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Close document'),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}
