<!--
SPDX-FileCopyrightText: 2026 André Fiedler

SPDX-License-Identifier: CC-BY-SA-4.0
-->

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
- Load the first PDF either via file picker or by dragging it into the empty workspace
- Reorder pages, add blank pages, and delete pages
- Append pages by uploading additional PDF files
- Insert pages after a specific page by dropping one or more PDF files onto that page preview
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

## License

This project is available under two licensing options.

### 1. Open-source license

GNU Affero General Public License v3.0 or later (`AGPL-3.0-or-later`).

You may use, modify, and distribute the original software under the AGPL. If you modify the software and make it available to users over a network, the AGPL requires that those users can access the corresponding source code of the modified version.

### 2. Commercial/proprietary license

For use in closed-source, proprietary, or otherwise AGPL-incompatible products, a separate commercial license is required.

Commercial licensing contact: https://github.com/SunboX

### Attribution / notices

Copyright (C) 2026 André Fiedler.

Copyright, license, attribution, and source-origin notices must be preserved as required by the AGPL and the notice files in this repository.

Documentation and other non-code project text are licensed under Creative Commons Attribution-ShareAlike 4.0 (`CC-BY-SA-4.0`) unless otherwise marked. Vendored third-party JavaScript bundles and font files keep their original third-party licenses and notices.

See `LICENSE.md`, `COMMERCIAL-LICENSE.md`, `NOTICE.md`, `CONTRIBUTING.md`, `.reuse/dep5`, and `LICENSES/` for the full licensing metadata.

## Notes

- Frontend runtime dependencies are vendored into `src/vendor/` to avoid production `/node_modules` requirements.
- Font files are served locally from `src/assets/fonts/`.
- On live hosting (all-inkl), app version metadata is served via `GET /api/app-meta.php`.
- Images are normalized to PNG internally before PDF embedding for stable export.
- Multiple overlay images per page are supported.
- Selected image can be rotated in 90° steps or removed via button or `Delete`/`Backspace`.
