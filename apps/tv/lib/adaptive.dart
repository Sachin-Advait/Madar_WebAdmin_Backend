import 'package:flutter/material.dart';

import 'widgets.dart';

bool portraitLayout(BoxConstraints constraints, String? orientation) =>
    orientation == 'portrait' ||
    (orientation != 'landscape' &&
        constraints.maxHeight > constraints.maxWidth);

const defaultHubGroups = [
  {
    'id': 'glance',
    'title': 'At a glance',
    'titleAr': 'نظرة سريعة',
    'pages': ['info-meetings', 'info-queue'],
  },
  {
    'id': 'updates',
    'title': 'Updates',
    'titleAr': 'المستجدات',
    'pages': ['info-notices', 'info-alerts'],
  },
  {
    'id': 'services',
    'title': 'Services',
    'titleAr': 'الخدمات',
    'pages': ['info-services', 'info-visitor'],
  },
  {
    'id': 'explore',
    'title': 'Explore',
    'titleAr': 'استكشف',
    'pages': ['info-events', 'info-media'],
  },
];

const destinationIcons = {
  'home': Icons.home_outlined,
  'live-tv': Icons.live_tv,
  'videos': Icons.play_circle_outline,
  'replay': Icons.history,
  'radio': Icons.radio_outlined,
  'info-hub': Icons.dashboard_outlined,
  'favourites': Icons.favorite_border,
};

class AdaptiveTvShell extends StatelessWidget {
  final String orientation, currentPage;
  final List<String> destinations;
  final String Function(String) title;
  final void Function(String) navigate;
  final Widget body, footer;
  const AdaptiveTvShell({
    super.key,
    required this.orientation,
    required this.currentPage,
    required this.destinations,
    required this.title,
    required this.navigate,
    required this.body,
    required this.footer,
  });

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final portrait = portraitLayout(constraints, orientation);
      Widget logo() => Padding(
        padding: const EdgeInsets.all(12),
        child: Image.asset(
          'assets/madar-logo.png',
          width: 54,
          height: 54,
          color: bronze,
          colorBlendMode: BlendMode.srcIn,
        ),
      );
      Widget button(String page) => Padding(
        padding: EdgeInsets.all(portrait ? 4 : 5),
        child: TvButton(
          key: ValueKey('nav-$page'),
          label: title(page),
          autofocus: page == 'home',
          selected:
              currentPage == page ||
              page == 'info-hub' && currentPage.startsWith('info-'),
          onPressed: () => navigate(page),
          padding: EdgeInsets.symmetric(
            horizontal: portrait ? 6 : 16,
            vertical: 12,
          ),
          child: portrait
              ? SizedBox(
                  width: 82,
                  child: Column(
                    children: [
                      Icon(destinationIcons[page], size: 26),
                      const SizedBox(height: 7),
                      Text(
                        title(page),
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12),
                      ),
                    ],
                  ),
                )
              : Text(title(page)),
        ),
      );
      final pages = [...destinations, 'favourites'];
      final navigation = portrait
          ? SizedBox(
              key: const ValueKey('side-navigation'),
              width: 112,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  border: BorderDirectional(
                    end: BorderSide(color: Theme.of(context).dividerColor),
                  ),
                ),
                child: SingleChildScrollView(
                  child: Column(children: [logo(), ...pages.map(button)]),
                ),
              ),
            )
          : Container(
              key: const ValueKey('top-navigation'),
              decoration: BoxDecoration(
                border: Border(
                  bottom: BorderSide(color: Theme.of(context).dividerColor),
                ),
              ),
              child: Row(
                children: [
                  logo(),
                  Expanded(
                    child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(children: pages.map(button).toList()),
                    ),
                  ),
                ],
              ),
            );
      return Column(
        children: [
          if (!portrait) navigation,
          Expanded(
            child: portrait
                ? Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      navigation,
                      Expanded(child: body),
                    ],
                  )
                : body,
          ),
          footer,
        ],
      );
    },
  );
}
