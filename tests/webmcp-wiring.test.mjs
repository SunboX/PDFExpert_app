import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)

test('webmcp integration module exists with expected tool definitions', async () => {
  const source = await readFile(new URL('src/WebMcpIntegration.mjs', root), 'utf8')

  assert.match(source, /export class WebMcpIntegration/)
  assert.match(source, /navigator\?\.modelContext/)
  assert.match(source, /provideContext\(\{ tools \}\)/)
  assert.match(source, /name: 'get_editor_state'/)
  assert.match(source, /name: 'load_pdf_document'/)
  assert.match(source, /name: 'append_pdf_documents'/)
  assert.match(source, /name: 'add_image_overlays'/)
  assert.match(source, /name: 'update_image_overlay'/)
  assert.match(source, /name: 'export_edited_pdf'/)
})

test('main runtime wires WebMCP integration and operation callbacks', async () => {
  const source = await readFile(new URL('src/main.js', root), 'utf8')

  assert.match(source, /import \{ WebMcpIntegration \} from '\.\/WebMcpIntegration\.mjs'/)
  assert.match(source, /let webMcpIntegration = null/)
  assert.match(source, /function createWebMcpOperations\(\)/)
  assert.match(source, /function initWebMcp\(\)/)
  assert.match(source, /new WebMcpIntegration\(\{\s*\n\s*operations: createWebMcpOperations\(\)/)
  assert.match(source, /initWebMcp\(\)/)
})
