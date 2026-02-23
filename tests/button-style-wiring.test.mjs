import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)

test('primary action button style has higher specificity than generic control button style', async () => {
  const css = await readFile(new URL('src/style.css', root), 'utf8')

  assert.match(css, /\.controls button\s*\{[\s\S]*background:\s*#fff;/)
  assert.match(css, /\.controls button\.primary\s*\{[\s\S]*color:\s*#fff;/)
  assert.match(css, /\.controls button\.primary\s*\{[\s\S]*background:\s*linear-gradient/)
})
