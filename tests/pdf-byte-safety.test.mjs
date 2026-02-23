import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)

test('pdf bytes are copied for rendering and save to avoid worker transfer side effects', async () => {
  const source = await readFile(new URL('src/main.js', root), 'utf8')

  assert.match(source, /const bytesForRendering = state\.pdfBytes\.slice\(\)/)
  assert.match(source, /getDocument\(\{ data: bytesForRendering \}\)\.promise/)
  assert.match(source, /PDFDocument\.load\(state\.pdfBytes\.slice\(\)\)/)
})
