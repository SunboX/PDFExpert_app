import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)

test('server serves static folders and index fallback', async () => {
  const source = await readFile(new URL('src/server.mjs', root), 'utf8')

  assert.match(source, /app\.use\('\/node_modules'/)
  assert.match(source, /app\.use\('\/src'/)
  assert.match(source, /app\.get\('\*'/)
  assert.match(source, /hasFileExtension/)
  assert.match(source, /res\.status\(404\)\.send\('Not Found'\)/)
})
