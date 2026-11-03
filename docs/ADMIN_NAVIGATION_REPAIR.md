# React admin navigation repair

Updated 3 November 2026. The prior responsive CSS hid the sidebar at narrow widths without a replacement, including embedded previews. This repair applies to both the production React admin and its standalone preview.

- All sections: an always-visible selector with all 38 destinations grouped by purpose.
- Compact screens (900px and below): a labelled menu button opens the complete navigation drawer. Escape, Close or the backdrop closes it; focus returns to the menu button.
- Desktop: sidebar links and collapse/expand controls remain available.
- Bookmarks: validated hash routes retain the selected page on refresh and support browser history. Unknown routes return to Overview.
- Sidebar links preserve normal Ctrl/Cmd-click behaviour.

The 38 destinations comprise 1 workspace overview, 7 TV experience screens, 12 content management screens, 9 master lists, 5 content operations screens and 4 administration screens. The same API-connected page components are used in the production app; the standalone HTML uses the existing sample-data adapter.

Validation: 4 navigation tests passed, TypeScript strict checking passed, production and standalone builds passed. Tests cover all links and selector options, current-page accessibility, route round trips and malformed/unknown routes. Run `npm run test:admin`; it is also included in the CI platform job. These are additional to the 105 baseline backend, Redis and Flutter tests documented in VERIFICATION.md.

Open the updated preview and use All sections at the top, or the menu icon on a narrow display. No local server or installation is needed for the standalone file.
