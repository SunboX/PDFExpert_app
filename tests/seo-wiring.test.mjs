// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const canonicalUrl = 'https://pdf-expert.app/'

test('index html exposes crawlable SEO metadata without noindex', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8')

  assert.match(html, /<title>PDF Expert - Browser PDF Image Editor<\/title>/)
  assert.match(html, /name="description"[\s\S]*content="Load a PDF, place images, resize them, reorder pages, and download a new PDF directly in your browser\."/)
  assert.match(html, new RegExp(`<link rel="canonical" href="${canonicalUrl}" />`))
  assert.doesNotMatch(html, /noindex/i)
})

test('robots txt allows public pages and advertises the sitemap', async () => {
  const robots = await readFile(new URL('robots.txt', root), 'utf8')

  assert.match(robots, /User-agent: \*/)
  assert.match(robots, /Allow: \//)
  assert.doesNotMatch(robots, /Disallow: \//)
  assert.match(robots, new RegExp(`Sitemap: ${canonicalUrl}sitemap.xml`))
})

test('sitemap includes the canonical public app URL', async () => {
  const sitemap = await readFile(new URL('sitemap.xml', root), 'utf8')

  assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/)
  assert.match(sitemap, new RegExp(`<loc>${canonicalUrl}</loc>`))
})

test('getting started docs include search indexing checklist actions', async () => {
  const docs = await readFile(new URL('docs/getting-started.md', root), 'utf8')

  assert.match(docs, /Production SEO/)
  assert.match(docs, /https:\/\/pdf-expert\.app\/robots\.txt/)
  assert.match(docs, /https:\/\/pdf-expert\.app\/sitemap\.xml/)
  assert.match(docs, /Google Search Console/)
})
