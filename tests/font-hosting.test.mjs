import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)

test('fonts are loaded from local domain and not from google fonts', async () => {
  const css = await readFile(new URL('src/style.css', root), 'utf8')

  assert.doesNotMatch(css, /fonts\.googleapis\.com/)
  assert.match(css, /@fontsource\/space-grotesk\/400\.css/)
  assert.match(css, /@fontsource\/space-grotesk\/500\.css/)
  assert.match(css, /@fontsource\/space-grotesk\/700\.css/)
  assert.match(css, /@fontsource\/ibm-plex-mono\/400\.css/)
  assert.match(css, /@fontsource\/ibm-plex-mono\/600\.css/)
})

test('font packages are present in runtime dependencies', async () => {
  const raw = await readFile(new URL('package.json', root), 'utf8')
  const pkg = JSON.parse(raw)

  assert.equal(typeof pkg.dependencies?.['@fontsource/space-grotesk'], 'string')
  assert.equal(typeof pkg.dependencies?.['@fontsource/ibm-plex-mono'], 'string')
})
