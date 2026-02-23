import express from 'express'
import { readFile } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const port = Number(process.env.PORT) || 3000

const app = express()

app.use('/src', express.static(join(projectRoot, 'src')))
app.use(express.static(projectRoot))

/**
 * Reads and normalizes a version string from a JSON file that contains a "version" key.
 * @param {string} path
 * @returns {Promise<string>}
 */
async function readVersionFromJsonFile(path) {
  try {
    const raw = await readFile(path, 'utf8')
    const decoded = JSON.parse(raw)
    return String(decoded?.version || '').trim()
  } catch (_error) {
    return ''
  }
}

app.get(['/api/app-meta', '/api/app-meta.php'], async (_req, res) => {
  const packagePath = join(projectRoot, 'package.json')
  const fallbackVersionPath = join(projectRoot, 'api', 'app-version.json')
  const packageVersion = await readVersionFromJsonFile(packagePath)
  const fallbackVersion = packageVersion ? '' : await readVersionFromJsonFile(fallbackVersionPath)

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  res.json({ version: packageVersion || fallbackVersion })
})

app.get('*', (req, res) => {
  const hasFileExtension = /\.[a-z0-9]+$/i.test(req.path)
  if (hasFileExtension) {
    res.status(404).send('Not Found')
    return
  }
  res.sendFile(join(projectRoot, 'index.html'))
})

app.listen(port, () => {
  console.log(`PDF Expert test server listening on http://localhost:${port}`)
})
