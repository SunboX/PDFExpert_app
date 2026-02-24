import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)

test('main runtime wires drag-drop image uploads on page overlays', async () => {
  const source = await readFile(new URL('src/main.js', root), 'utf8')

  assert.match(source, /setupPageImageDropTarget\(\{\s*\n\s*pageNumber,\s*\n\s*wrapper,\s*\n\s*overlay\s*\n\s*\}\)/)
  assert.match(source, /function setupPageImageDropTarget\(options\)/)
  assert.match(source, /overlay\.addEventListener\('drop', async \(event\) => \{/)
  assert.match(source, /const pdfFiles = getPdfFilesFromDataTransfer\(event\.dataTransfer\)/)
  assert.match(source, /const result = await insertPdfFilesAfterPage\(pdfFiles, pageNumber\)/)
  assert.match(source, /setStatusKey\('status\.pagesInserted', 'success', \{/)
  assert.match(source, /const imageFiles = getImageFilesFromDataTransfer\(event\.dataTransfer\)/)
  assert.match(source, /setStatusKey\('status\.imageAddFailed', 'error', \{ message: t\('errors\.dropImagesOnly'\) \}\)/)
  assert.match(source, /const dropPosition = getDropPositionWithinOverlay\(event, overlay\)/)
  assert.match(source, /await addImagesToPage\(imageFiles, \{\s*\n\s*pageNumber,\s*\n\s*anchorX: dropPosition\.x,\s*\n\s*anchorY: dropPosition\.y\s*\n\s*\}\)/)
})

test('main runtime wires drag-drop loading for the initial workspace PDF', async () => {
  const source = await readFile(new URL('src/main.js', root), 'utf8')

  assert.match(source, /setupWorkspacePdfDropTarget\(\)/)
  assert.match(source, /function setupWorkspacePdfDropTarget\(\)/)
  assert.match(source, /els\.workspace\.addEventListener\('dragover', \(event\) => \{[\s\S]*event\.dataTransfer\.dropEffect = 'copy'/)
  assert.doesNotMatch(source, /event\.dataTransfer\.dropEffect = hasPdfFiles \? 'copy' : 'none'/)
  assert.match(source, /els\.workspace\.addEventListener\('drop', async \(event\) => \{/)
  assert.match(source, /const pdfFiles = getPdfFilesFromDataTransfer\(event\.dataTransfer\)/)
  assert.match(source, /setStatusKey\('status\.pdfLoadFailed', 'error', \{ message: t\('errors\.dropPdfOnly'\) \}\)/)
  assert.match(source, /await loadPdf\(file\)/)
})

test('drag-drop styles include drop-target feedback', async () => {
  const css = await readFile(new URL('src/style.css', root), 'utf8')

  assert.match(css, /\.page-wrapper\.is-drop-target\s*\{/)
  assert.match(css, /\.page-wrapper\.is-drop-target\s+\.page-stage::after\s*\{/)
  assert.match(css, /\.workspace\.is-empty\s+\.workspace-empty-state\s*\{/)
  assert.match(css, /\.workspace\.is-empty-drop-target\s+\.workspace-empty-state\s*\{/)
})

test('translation bundles include drop-only image error text', async () => {
  const en = await readFile(new URL('src/i18n/en.json', root), 'utf8')
  const de = await readFile(new URL('src/i18n/de.json', root), 'utf8')

  assert.match(en, /"workspaceDropPdfPrompt"/)
  assert.match(de, /"workspaceDropPdfPrompt"/)
  assert.match(en, /"dropPdfOnly"/)
  assert.match(de, /"dropPdfOnly"/)
  assert.match(en, /"pagesInserted"/)
  assert.match(de, /"pagesInserted"/)
  assert.match(en, /"dropImagesOnly"/)
  assert.match(de, /"dropImagesOnly"/)
})
