import express from 'express'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const port = Number(process.env.PORT) || 3000

const app = express()

app.use('/node_modules', express.static(join(projectRoot, 'node_modules')))
app.use('/src', express.static(join(projectRoot, 'src')))
app.use(express.static(projectRoot))

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
