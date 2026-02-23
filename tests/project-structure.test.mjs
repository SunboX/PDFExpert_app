import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'

const root = new URL('../', import.meta.url)

async function exists(path) {
  try {
    await access(new URL(path, root), constants.F_OK)
    return true
  } catch {
    return false
  }
}

test('required top-level files exist', async () => {
  assert.equal(await exists('README.md'), true)
  assert.equal(await exists('AGENTS.md'), true)
  assert.equal(await exists('index.html'), true)
  assert.equal(await exists('package.json'), true)
})

test('documentation files exist in docs/', async () => {
  assert.equal(await exists('docs/getting-started.md'), true)
  assert.equal(await exists('docs/pdf-editing-workflow.md'), true)
  assert.equal(await exists('docs/architecture.md'), true)
  assert.equal(await exists('docs/troubleshooting.md'), true)
})

test('localization files exist in src/i18n/', async () => {
  assert.equal(await exists('src/I18n.mjs'), true)
  assert.equal(await exists('src/i18n/en.json'), true)
  assert.equal(await exists('src/i18n/de.json'), true)
})

test('tests folder contains a readme', async () => {
  assert.equal(await exists('tests/README.md'), true)
})

test('package scripts include start/test and no bundler build scripts', async () => {
  const raw = await readFile(new URL('package.json', root), 'utf8')
  const pkg = JSON.parse(raw)

  assert.equal(typeof pkg.scripts?.start, 'string')
  assert.equal(typeof pkg.scripts?.test, 'string')
  assert.equal('build' in (pkg.scripts || {}), false)
  assert.equal('dev' in (pkg.scripts || {}), false)
  assert.equal('preview' in (pkg.scripts || {}), false)
})

test('interactjs runtime dependency is wired for direct browser import', async () => {
  const raw = await readFile(new URL('package.json', root), 'utf8')
  const pkg = JSON.parse(raw)

  assert.equal(typeof pkg.dependencies?.interactjs, 'string')
  assert.equal(typeof pkg.dependencies?.['@interactjs/interactjs'], 'string')
})
