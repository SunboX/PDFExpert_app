<!--
SPDX-FileCopyrightText: 2026 André Fiedler

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Getting Started

## Prerequisites
- Node.js 20+
- npm

## Install

```bash
npm install
```

## Start Local Test Server (Express)

```bash
npm start
```

Open [http://localhost:3000/](http://localhost:3000/).

If the port is occupied:

```bash
PORT=3100 npm start
```

## Localization

- Use the language dropdown in the header to switch between `English` and `Deutsch`.
- You can also force locale via URL parameter: `?lang=en` or `?lang=de`.

## WebMCP (Early Preview)

- The app registers imperative WebMCP tools when `navigator.modelContext` is available.
- Use Chrome `146.0.7672.0+` and enable `chrome://flags/#enable-webmcp-testing`.
- After relaunch, tools can be inspected with the "Model Context Tool Inspector" extension.
- In browsers without WebMCP support, the editor works normally and skips tool registration.

## Live Hosting (all-inkl)

- Deploy `index.html`, `src/`, and `api/`.
- The live app reads version metadata from `GET /api/app-meta.php`.
- Frontend runtime libraries and fonts are shipped directly from `src/vendor/` and `src/assets/fonts/` (no `/node_modules` web path required).

## Analytics

- The app loads the centralized cookieless tracker from `https://analytics.andrefiedler.de/tracker.js`.
- The public site key is `pdf_expert_app`.
- Register each deployed browser origin in the Analytics `analytics_sites` table or dashboard before expecting events. The production row should use the deployed app origin and public key `pdf_expert_app`.

```sql
INSERT INTO analytics_sites (name, allowed_origin, public_key, active, created_at)
VALUES ('PDF Expert', 'https://your-pdf-app-origin.example', 'pdf_expert_app', 1, UTC_TIMESTAMP());
```

## Test

```bash
npm test
```
