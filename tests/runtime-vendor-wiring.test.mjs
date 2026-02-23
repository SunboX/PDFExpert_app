import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)

test('index and runtime use vendored frontend dependencies', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8')
  const main = await readFile(new URL('src/main.js', root), 'utf8')

  assert.match(html, /<script src="\/src\/vendor\/interactjs\/interact\.min\.js"><\/script>/)
  assert.doesNotMatch(html, /node_modules/)
  assert.doesNotMatch(html, /type="importmap"/)

  assert.match(main, /\/src\/vendor\/pdf-lib\/pdf-lib\.esm\.min\.js/)
  assert.match(main, /\/src\/vendor\/pdfjs-dist\/build\/pdf\.mjs/)
  assert.match(main, /GlobalWorkerOptions\.workerSrc = '\/src\/vendor\/pdfjs-dist\/build\/pdf\.worker\.min\.mjs'/)
})
