import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'

const root = new URL('../', import.meta.url)

test('fonts are loaded from local domain and not from google fonts', async () => {
  const css = await readFile(new URL('src/style.css', root), 'utf8')

  assert.doesNotMatch(css, /fonts\.googleapis\.com/)
  assert.doesNotMatch(css, /\/node_modules\//)
  assert.match(css, /\/src\/assets\/fonts\/space-grotesk-latin-400-normal\.woff2/)
  assert.match(css, /\/src\/assets\/fonts\/space-grotesk-latin-500-normal\.woff2/)
  assert.match(css, /\/src\/assets\/fonts\/space-grotesk-latin-700-normal\.woff2/)
  assert.match(css, /\/src\/assets\/fonts\/ibm-plex-mono-latin-400-normal\.woff2/)
  assert.match(css, /\/src\/assets\/fonts\/ibm-plex-mono-latin-600-normal\.woff2/)
})

test('font files are vendored into src/assets/fonts', async () => {
  const requiredFontFiles = [
    'src/assets/fonts/space-grotesk-latin-400-normal.woff2',
    'src/assets/fonts/space-grotesk-latin-500-normal.woff2',
    'src/assets/fonts/space-grotesk-latin-700-normal.woff2',
    'src/assets/fonts/ibm-plex-mono-latin-400-normal.woff2',
    'src/assets/fonts/ibm-plex-mono-latin-600-normal.woff2'
  ]

  for (const fontPath of requiredFontFiles) {
    await access(new URL(fontPath, root), constants.F_OK)
  }
})
