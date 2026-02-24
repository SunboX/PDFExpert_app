# Architecture

## Runtime Modules
- `index.html`: static shell and script entry
- `src/main.js`: UI state, rendering, InteractJS interactions, and PDF export
- `src/WebMcpIntegration.mjs`: WebMCP imperative tool registration and schema wiring for agent calls
- `src/AppApiEndpointUtils.mjs`: resolves metadata endpoint paths for localhost vs. live hosting
- `src/I18n.mjs`: runtime localization loader, locale detection, and DOM translation binding
- `src/i18n/*.json`: translation bundles (`en`, `de`)
- `src/style.css`: layout and interaction styling
- `src/server.mjs`: local Express test server and static file hosting
- `api/app-meta.php`: all-inkl compatible PHP metadata endpoint for live hosting

## Core Libraries
- `src/vendor/pdfjs-dist/build/pdf.mjs`: renders uploaded PDFs into canvases for visual editing
- `src/vendor/interactjs/interact.min.js`: drag/resize behavior for image overlays
- `src/vendor/pdf-lib/pdf-lib.esm.min.js`: embeds overlays into a downloadable output PDF
- `src/assets/fonts/*.woff2`: locally hosted UI fonts (same-domain loading)
- `navigator.modelContext` (when available): browser WebMCP tool surface for in-page agent actions

## Data Flow
1. User uploads PDF file.
2. PDF is parsed and rendered page-by-page.
3. Optional page operations mutate PDF bytes in memory (`move`, `insert`, `delete`, `append`).
4. User adds image overlays to selected pages and can rotate selected overlays in 90° steps.
5. Overlay positions/sizes are tracked in memory and remapped on page structure changes.
6. On save, overlays are converted into PDF coordinates and drawn onto pages.
7. New PDF is generated and downloaded.
8. Locale changes update static UI labels and runtime status messages.
9. If WebMCP is available in the browser, imperative tools map agent calls to the same app operations.
