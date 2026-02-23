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

## Live Hosting (all-inkl)

- Deploy `index.html`, `src/`, and `api/`.
- The live app reads version metadata from `GET /api/app-meta.php`.
- Frontend runtime libraries and fonts are shipped directly from `src/vendor/` and `src/assets/fonts/` (no `/node_modules` web path required).

## Test

```bash
npm test
```
