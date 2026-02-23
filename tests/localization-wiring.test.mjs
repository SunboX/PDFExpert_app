import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)

test('index html provides locale selector and i18n hooks', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8')

  assert.match(html, /data-locale-select/)
  assert.match(html, /data-i18n="app\.title"/)
  assert.match(html, /data-i18n="app\.subtitle"/)
  assert.match(html, /data-i18n-aria-label="app\.languageLabel"/)
})

test('index html footer includes github and mastodon links', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8')

  assert.match(html, /class="page-footer"/)
  assert.match(html, /data-i18n="footer\.title"/)
  assert.match(html, /data-i18n="footer\.responsible"/)
  assert.match(html, /data-i18n="footer\.contact"/)
  assert.match(html, /data-i18n="footer\.version"/)
  assert.match(html, /data-app-version/)
  assert.match(html, /href="https:\/\/github\.com\/SunboX\/PDFExpert_app"/)
  assert.match(html, /href="https:\/\/mastodon\.social\/@sonnenkiste"/)
  assert.match(html, /data-i18n-aria-label="footer\.githubAria"/)
  assert.match(html, /data-i18n-aria-label="footer\.mastodonAria"/)
})

test('main runtime initializes i18n and applies translations', async () => {
  const source = await readFile(new URL('src/main.js', root), 'utf8')

  assert.match(source, /import \{ I18n \} from '\.\/I18n\.mjs'/)
  assert.match(source, /await i18n\.init\(\)/)
  assert.match(source, /applyLocaleToUi\(\)/)
  assert.match(source, /els\.localeSelect\?\.addEventListener\('change'/)
  assert.match(source, /document\.querySelector\('\[data-app-version\]'\)/)
  assert.match(source, /await updateAppVersionText\(\)/)
  assert.match(source, /fetch\('\/package\.json'/)
  assert.match(source, /setStatusKey\('status\.ready', 'info'\)/)
})

test('translation bundles include footer keys', async () => {
  const en = await readFile(new URL('src/i18n/en.json', root), 'utf8')
  const de = await readFile(new URL('src/i18n/de.json', root), 'utf8')

  assert.match(en, /"footer"/)
  assert.match(en, /"responsible"/)
  assert.match(en, /"contact"/)
  assert.match(en, /"version"/)
  assert.match(en, /"githubAria"/)
  assert.match(en, /"mastodonAria"/)

  assert.match(de, /"footer"/)
  assert.match(de, /"responsible"/)
  assert.match(de, /"contact"/)
  assert.match(de, /"version"/)
  assert.match(de, /"githubAria"/)
  assert.match(de, /"mastodonAria"/)
})
