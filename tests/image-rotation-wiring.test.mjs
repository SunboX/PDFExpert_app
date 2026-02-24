import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)

test('index html includes controls to rotate the selected image', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8')

  assert.match(html, /id="rotate-selected-left"/)
  assert.match(html, /id="rotate-selected-right"/)
})

test('main runtime wires selected image rotation and updates image data', async () => {
  const source = await readFile(new URL('src/main.js', root), 'utf8')

  assert.match(source, /rotateSelectedLeft: document\.querySelector\('#rotate-selected-left'\)/)
  assert.match(source, /rotateSelectedRight: document\.querySelector\('#rotate-selected-right'\)/)
  assert.match(source, /els\.rotateSelectedLeft\?\.addEventListener\('click', async \(\) => \{/)
  assert.match(source, /els\.rotateSelectedRight\?\.addEventListener\('click', async \(\) => \{/)
  assert.match(source, /async function rotateSelectedPlacement\(direction\)/)
  assert.match(source, /const quarterTurns = direction === 'left' \? -1 : direction === 'right' \? 1 : 0/)
  assert.match(source, /await rotateImageDataUrlByQuarterTurns\(placement\.dataUrl, quarterTurns\)/)
  assert.match(source, /placement\.dataUrl = rotated\.dataUrl/)
  assert.match(source, /applyPlacementImageSource\(placement\)/)
  assert.match(source, /setStatusKey\(direction === 'left' \? 'status\.imageRotatedLeft' : 'status\.imageRotatedRight', 'success'\)/)
  assert.match(source, /async function rotateImageDataUrlByQuarterTurns\(dataUrl, quarterTurns\)/)
  assert.match(source, /context\.rotate\(\(normalizedQuarterTurns \* Math\.PI\) \/ 2\)/)
  assert.match(source, /function normalizeQuarterTurns\(quarterTurns\)/)
})

test('translation bundles include rotation labels and status texts', async () => {
  const en = await readFile(new URL('src/i18n/en.json', root), 'utf8')
  const de = await readFile(new URL('src/i18n/de.json', root), 'utf8')

  assert.match(en, /"rotateLeft"/)
  assert.match(en, /"rotateRight"/)
  assert.match(en, /"imageRotatedLeft"/)
  assert.match(en, /"imageRotatedRight"/)
  assert.match(en, /"imageRotateFailed"/)

  assert.match(de, /"rotateLeft"/)
  assert.match(de, /"rotateRight"/)
  assert.match(de, /"imageRotatedLeft"/)
  assert.match(de, /"imageRotatedRight"/)
  assert.match(de, /"imageRotateFailed"/)
})
