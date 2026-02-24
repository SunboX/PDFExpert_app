import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)

test('main runtime re-renders pages on window resize and preserves overlay scale', async () => {
  const source = await readFile(new URL('src/main.js', root), 'utf8')

  assert.match(source, /window\.addEventListener\('resize', handleWindowResize\)/)
  assert.match(source, /function handleWindowResize\(\)/)
  assert.match(source, /if \(state\.pdfBytes\) \{\s*\n\s*void rerenderPagesForCurrentLayout\(\)\s*\n\s*return\s*\n\s*\}\s*\n\s*syncWorkspaceEmptyHeight\(\)/)
  assert.match(source, /function rerenderPagesForCurrentLayout\(\)/)
  assert.match(source, /function getRenderedPageMetricsByNumber\(\)/)
  assert.match(source, /function scalePlacementsForUpdatedPageMetrics\(placements, previousPageMetricsByNumber\)/)
  assert.match(source, /function syncWorkspaceEmptyHeight\(\)/)
  assert.match(source, /els\.workspace\.style\.setProperty\('--workspace-empty-min-height', `\$\{controlsHeight\}px`\)/)
  assert.match(
    source,
    /await hydratePdfFromState\(\{\s*\n\s*placements,\s*\n\s*activePage: state\.activePage,\s*\n\s*previousPageMetricsByNumber\s*\n\s*\}\)/
  )
})

test('hydrate pipeline clears empty-state before measuring render width', async () => {
  const source = await readFile(new URL('src/main.js', root), 'utf8')

  assert.match(source, /clearPages\(\)\s*\n\s*updateWorkspaceEmptyState\(\)\s*\n\s*await renderAllPages\(state\.pdfProxy\)/)
})

test('layout keeps controls natural height and empty workspace can still match controls height', async () => {
  const css = await readFile(new URL('src/style.css', root), 'utf8')

  assert.match(css, /\.layout\s*\{[\s\S]*align-items:\s*start;/)
  assert.match(css, /\.workspace\.is-empty\s*\{[\s\S]*--workspace-empty-min-height/)
})
