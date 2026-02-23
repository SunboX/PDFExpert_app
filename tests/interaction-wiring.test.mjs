import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)

test('image overlay interactions are wired for dedicated drag and resize zones', async () => {
  const source = await readFile(new URL('src/main.js', root), 'utf8')

  assert.match(source, /document\.createElement\('div'\)\s*\n\s*grip\.className = 'placement-grip'/)
  assert.match(source, /draggable\(\{\s*\n\s*ignoreFrom: '\.placement-grip'/)
  assert.match(source, /resizable\(\{\s*\n\s*allowFrom: '\.placement-grip'/)
  assert.match(source, /nextHeight = nextWidth \/ aspectRatio/)
  assert.doesNotMatch(source, /interact\.modifiers\./)
  assert.doesNotMatch(source, /event\.stopPropagation\(\)/)
})

test('overlay and placement styles opt out of browser touch gestures', async () => {
  const css = await readFile(new URL('src/style.css', root), 'utf8')

  assert.match(css, /\.page-overlay\s*\{[\s\S]*touch-action: none;/)
  assert.match(css, /\.placement\s*\{[\s\S]*touch-action: none;/)
  assert.match(css, /\.placement-grip\s*\{[\s\S]*touch-action: none;/)
})
