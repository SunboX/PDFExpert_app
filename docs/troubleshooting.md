# Troubleshooting

## Server Does Not Start (EADDRINUSE)
Port 3000 is already in use.

Use a different port:

```bash
PORT=3100 npm start
```

## PDF Does Not Load
- Check file is a valid PDF.
- Try another PDF to isolate file-specific issues.
- Open browser devtools and inspect console errors.

## Console Error: "Failed to load module script" (MIME type "text/html")
If you see an error like:

`Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html"`

do the following:

```bash
npm install
npm start
```

Reason:
- A module path was unresolved and the server fallback returned `index.html`.
- Verify `src/vendor/` is deployed, especially:
  - `/src/vendor/interactjs/interact.min.js`
  - `/src/vendor/pdf-lib/pdf-lib.esm.min.js`
  - `/src/vendor/pdfjs-dist/build/pdf.mjs`
  - `/src/vendor/pdfjs-dist/build/pdf.worker.min.mjs`

## 404 Errors For `/node_modules/...` On Live Host

This app should not request browser assets from `/node_modules/` in production.

- Hard refresh and clear cache once after deployment.
- Confirm the deployed `index.html` no longer contains an import map with `/node_modules` paths.
- Confirm deployed `src/style.css` contains local font URLs under `/src/assets/fonts/`.
- Confirm the backend metadata endpoint works:
  - `GET /api/app-meta.php` should return JSON with a `version` field.

Note:
- Repeated `Unchecked runtime.lastError ... extension port ...` logs usually come from a browser extension and are not from this app.

## Image Cannot Be Added
- Ensure a PDF is loaded first.
- Ensure image format is supported by the browser.
- Retry with PNG or JPEG.

## Export Fails
- Confirm source PDF was loaded successfully.
- Remove very large overlays and retry.
- Check browser console for exact error details.

## Slow Rendering On Large PDFs
- Use a smaller test PDF during editing.
- Split very large documents before editing when possible.
