import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)

test('index html includes page management controls', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8')

  assert.match(html, /id="move-page-up"/)
  assert.match(html, /id="move-page-down"/)
  assert.match(html, /id="add-blank-page"/)
  assert.match(html, /id="delete-page"/)
  assert.match(html, /id="append-pdf-input"/)
  assert.match(html, /id="append-pdf-input"[^>]*accept="application\/pdf"/)
  assert.match(html, /id="append-pdf-input"[^>]*multiple/)
})

test('main runtime supports page reorder, insert, delete, and append mutations', async () => {
  const source = await readFile(new URL('src/main.js', root), 'utf8')

  assert.match(source, /async function moveActivePage\(direction\)/)
  assert.match(source, /async function addBlankPageAfterActive\(\)/)
  assert.match(source, /async function deleteActivePage\(\)/)
  assert.match(source, /async function appendPdfFiles\(files\)/)
  assert.match(source, /pdfDoc\.movePage\(/)
  assert.match(source, /pdfDoc\.insertPage\(/)
  assert.match(source, /pdfDoc\.removePage\(/)
  assert.match(source, /pdfDoc\.copyPages\(/)
  assert.match(source, /remapPlacementsForPageMove/)
  assert.match(source, /remapPlacementsForPageInsertion/)
  assert.match(source, /remapPlacementsForPageDeletion/)
})
