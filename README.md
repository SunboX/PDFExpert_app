# PDF Expert

Web-based PDF editor focused on image overlays.

## Overview

This repository contains the application layer only:
- UI/editor in `src/`
- Static app shell in `index.html`
- Styling in `src/style.css`
- Browser runtime in `src/main.js`
- Local test server in `src/server.mjs`

Main capabilities:
- Upload and preview multi-page PDFs
- Add as many images as needed on selected pages (single or multi-select)
- Move and scale images using InteractJS
- Export the edited document as a new PDF
- Runtime localization (`English` / `Deutsch`) with persisted locale preference (`lang` URL override supported)

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

- Images are normalized to PNG internally before PDF embedding for stable export.
- Multiple overlay images per page are supported.
- Selected image can be removed via button or `Delete`/`Backspace`.
