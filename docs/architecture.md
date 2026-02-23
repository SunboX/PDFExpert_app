# Architecture

## Runtime Modules
- `index.html`: static shell, import map, and script entry
- `src/main.js`: UI state, rendering, InteractJS interactions, and PDF export
- `src/I18n.mjs`: runtime localization loader, locale detection, and DOM translation binding
- `src/i18n/*.json`: translation bundles (`en`, `de`)
- `src/style.css`: layout and interaction styling
- `src/server.mjs`: local Express test server and static file hosting

## Core Libraries
- `pdfjs-dist`: renders uploaded PDFs into canvases for visual editing
- `interactjs`: drag/resize behavior for image overlays
- `pdf-lib`: embeds overlays into a downloadable output PDF

## Data Flow
1. User uploads PDF file.
2. PDF is parsed and rendered page-by-page.
3. User adds image overlays to selected pages.
4. Overlay positions/sizes are tracked in memory.
5. On save, overlays are converted into PDF coordinates and drawn onto pages.
6. New PDF is generated and downloaded.
7. Locale changes update static UI labels and runtime status messages.
