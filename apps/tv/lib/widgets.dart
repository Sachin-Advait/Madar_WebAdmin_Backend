import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';

const bronze = Color(0xff6b5837);

class FocusableScrollPanel extends StatefulWidget {
  final Widget child;
  const FocusableScrollPanel({super.key, required this.child});
  @override
  State<FocusableScrollPanel> createState() => _FocusableScrollPanelState();
}

class _FocusableScrollPanelState extends State<FocusableScrollPanel> {
  final scroll = ScrollController();
  bool focused = false;
  @override
  void dispose() {
    scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Focus(
    onFocusChange: (value) {
      setState(() => focused = value);
      if (value) {
        Scrollable.ensureVisible(
          context,
          alignment: .3,
          duration: const Duration(milliseconds: 150),
        );
      }
    },
    onKeyEvent: (_, event) {
      if (event is! KeyDownEvent || !scroll.hasClients) {
        return KeyEventResult.ignored;
      }
      final down = event.logicalKey == LogicalKeyboardKey.arrowDown,
          up = event.logicalKey == LogicalKeyboardKey.arrowUp;
      if ((down && scroll.position.extentAfter > 1) ||
          (up && scroll.position.extentBefore > 1)) {
        scroll.animateTo(
          (scroll.offset + (down ? 80 : -80)).clamp(
            0,
            scroll.position.maxScrollExtent,
          ),
          duration: const Duration(milliseconds: 100),
          curve: Curves.easeOut,
        );
        return KeyEventResult.handled;
      }
      return KeyEventResult.ignored;
    },
    child: Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        border: Border.all(
          color: focused
              ? Theme.of(context).colorScheme.primary
              : Colors.transparent,
          width: 3,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Scrollbar(
        controller: scroll,
        thumbVisibility: true,
        child: SingleChildScrollView(controller: scroll, child: widget.child),
      ),
    ),
  );
}

class TvButton extends StatefulWidget {
  final Widget child;
  final VoidCallback onPressed;
  final bool selected, autofocus;
  final String? label;
  final ValueChanged<bool>? onFocusChange;
  final EdgeInsets padding;
  const TvButton({
    super.key,
    required this.child,
    required this.onPressed,
    this.selected = false,
    this.autofocus = false,
    this.label,
    this.onFocusChange,
    this.padding = const EdgeInsets.all(16),
  });
  @override
  State<TvButton> createState() => _TvButtonState();
}

class _TvButtonState extends State<TvButton> {
  bool focused = false;
  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    label: widget.label,
    child: FocusableActionDetector(
      autofocus: widget.autofocus,
      onFocusChange: widget.onFocusChange,
      shortcuts: const {
        SingleActivator(LogicalKeyboardKey.select): ActivateIntent(),
        SingleActivator(LogicalKeyboardKey.enter): ActivateIntent(),
        SingleActivator(LogicalKeyboardKey.space): ActivateIntent(),
      },
      actions: {
        ActivateIntent: CallbackAction<ActivateIntent>(
          onInvoke: (_) {
            widget.onPressed();
            return null;
          },
        ),
      },
      onShowFocusHighlight: (value) {
        setState(() => focused = value);
        if (value) {
          Scrollable.ensureVisible(
            context,
            duration: const Duration(milliseconds: 150),
            alignment: .35,
          );
        }
      },
      child: GestureDetector(
        onTap: widget.onPressed,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          padding: widget.padding,
          decoration: BoxDecoration(
            color: focused
                ? bronze.withValues(alpha: .16)
                : widget.selected
                ? bronze.withValues(alpha: .1)
                : Theme.of(context).colorScheme.surface,
            border: Border.all(
              color: focused
                  ? bronze
                  : widget.selected
                  ? bronze.withValues(alpha: .5)
                  : Theme.of(context).dividerColor,
              width: focused ? 3 : 1,
            ),
            borderRadius: BorderRadius.circular(14),
            boxShadow: focused
                ? [
                    BoxShadow(
                      color: bronze.withValues(alpha: .1),
                      blurRadius: 16,
                    ),
                  ]
                : [],
          ),
          child: widget.child,
        ),
      ),
    ),
  );
}

class Artwork extends StatelessWidget {
  final String? url, local;
  final double? height;
  final BoxFit fit;
  final Alignment alignment;
  const Artwork({
    super.key,
    this.url,
    this.local,
    this.height,
    this.fit = BoxFit.cover,
    this.alignment = Alignment.center,
  });
  @override
  Widget build(BuildContext context) {
    Widget fallback() => Container(
      height: height,
      color: const Color(0xffded8c6),
      child: const Center(
        child: Icon(Icons.landscape_outlined, size: 54, color: bronze),
      ),
    );
    if (local != null) {
      return Image.file(
        File(local!),
        height: height,
        fit: fit,
        alignment: alignment,
        errorBuilder: (_, _, _) => fallback(),
      );
    }
    if (url != null && url!.startsWith('/art/')) {
      return SvgPicture.asset(
        'assets/art/${url!.split('/').last}',
        height: height,
        fit: fit,
        alignment: alignment,
        placeholderBuilder: (_) => fallback(),
      );
    }
    return fallback();
  }
}

class SectionTitle extends StatelessWidget {
  final String text;
  final String? note;
  const SectionTitle(this.text, {super.key, this.note});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 16, bottom: 18),
    child: Row(
      children: [
        Expanded(
          child: Text(text, style: Theme.of(context).textTheme.titleLarge),
        ),
        if (note != null)
          Text(
            note!,
            style: Theme.of(context).textTheme.labelMedium
                ?.copyWith(color: bronze),
          ),
      ],
    ),
  );
}
