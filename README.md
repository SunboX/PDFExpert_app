# PDF Expert

Web-based PDF editor focused on image overlays.

## Overview

This repository contains the application layer only:
- UI/editor in `src/`
- Static app shell in `index.html`
- Styling in `src/style.css`
- Browser runtime in `src/main.js`
- Local test server in `src/server.mjs`
- All-inkl compatible PHP backend endpoint in `api/app-meta.php`

Main capabilities:
- Upload and preview multi-page PDFs
- Reorder pages, add blank pages, and delete pages
- Append pages by uploading additional PDF files
- Add as many images as needed on selected pages (single or multi-select), including drag-and-drop directly onto a page
- Move, scale, and rotate images using InteractJS and in-app controls
- Export the edited document as a new PDF
- Runtime localization (`English` / `Deutsch`) with persisted locale preference (`lang` URL override supported)
- WebMCP imperative tool integration for agent-driven workflows across PDF/page/image editing actions

## Documentation

Project documentation lives in `docs/`:
- `docs/getting-started.md`: setup and first run
- `docs/pdf-editing-workflow.md`: upload/edit/export workflow
- `docs/architecture.md`: runtime and data flow overview
- `docs/troubleshooting.md`: common issues and fixes

## Run

```bash
npm install
npm start
```

Open:
- `http://localhost:3000/`

If port `3000` is in use:

```bash
PORT=3100 npm start
```

## Test

```bash
npm test
```

App-level tests are in `tests/`.

## Notes

- Frontend runtime dependencies are vendored into `src/vendor/` to avoid production `/node_modules` requirements.
- Font files are served locally from `src/assets/fonts/`.
- On live hosting (all-inkl), app version metadata is served via `GET /api/app-meta.php`.
- Images are normalized to PNG internally before PDF embedding for stable export.
- Multiple overlay images per page are supported.
- Selected image can be rotated in 90° steps or removed via button or `Delete`/`Backspace`.
