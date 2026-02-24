import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)

test('main runtime wires drag-drop image uploads on page overlays', async () => {
  const source = await readFile(new URL('src/main.js', root), 'utf8')

  assert.match(source, /setupPageImageDropTarget\(\{\s*\n\s*pageNumber,\s*\n\s*wrapper,\s*\n\s*overlay\s*\n\s*\}\)/)
  assert.match(source, /function setupPageImageDropTarget\(options\)/)
  assert.match(source, /overlay\.addEventListener\('drop', async \(event\) => \{/)
  assert.match(source, /const imageFiles = getImageFilesFromDataTransfer\(event\.dataTransfer\)/)
  assert.match(source, /setStatusKey\('status\.imageAddFailed', 'error', \{ message: t\('errors\.dropImagesOnly'\) \}\)/)
  assert.match(source, /const dropPosition = getDropPositionWithinOverlay\(event, overlay\)/)
  assert.match(source, /await addImagesToPage\(imageFiles, \{\s*\n\s*pageNumber,\s*\n\s*anchorX: dropPosition\.x,\s*\n\s*anchorY: dropPosition\.y\s*\n\s*\}\)/)
})

test('drag-drop styles include drop-target feedback', async () => {
  const css = await readFile(new URL('src/style.css', root), 'utf8')

  assert.match(css, /\.page-wrapper\.is-drop-target\s*\{/)
  assert.match(css, /\.page-wrapper\.is-drop-target\s+\.page-stage::after\s*\{/)
})

test('translation bundles include drop-only image error text', async () => {
  const en = await readFile(new URL('src/i18n/en.json', root), 'utf8')
  const de = await readFile(new URL('src/i18n/de.json', root), 'utf8')

  assert.match(en, /"dropImagesOnly"/)
  assert.match(de, /"dropImagesOnly"/)
})
