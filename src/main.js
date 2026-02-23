import interact from 'interactjs'
import { PDFDocument } from 'pdf-lib'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import { I18n } from './I18n.mjs'

GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.min.mjs'

const i18n = new I18n({
  defaultLocale: 'de',
  storageKey: 'pdf_expert_locale',
  bundlesBasePath: '/src/i18n'
})

const els = {
  pdfInput: document.querySelector('#pdf-input'),
  imageInput: document.querySelector('#image-input'),
  pageSelect: document.querySelector('#page-select'),
  localeSelect: document.querySelector('#locale-select'),
  savePdf: document.querySelector('#save-pdf'),
  removeSelected: document.querySelector('#remove-selected'),
  pageList: document.querySelector('#page-list'),
  status: document.querySelector('#status'),
  pdfMeta: document.querySelector('#pdf-meta'),
  appVersion: document.querySelector('[data-app-version]')
}

const state = {
  pdfBytes: null,
  pdfName: 'dokument.pdf',
  pdfProxy: null,
  activePage: 1,
  pageInfoByNumber: new Map(),
  placementsById: new Map(),
  interactablesById: new Map(),
  selectedPlacementId: null,
  nextPlacementId: 1,
  statusSnapshot: {
    key: 'status.ready',
    params: {},
    type: 'info'
  }
}

els.pdfInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  setStatusKey('status.pdfLoading', 'info', { file: file.name })
  els.pdfInput.disabled = true
  try {
    await loadPdf(file)
    setStatusKey('status.pdfLoaded', 'success', { file: file.name })
  } catch (error) {
    console.error(error)
    setStatusKey('status.pdfLoadFailed', 'error', { message: error.message })
  } finally {
    els.pdfInput.disabled = false
    event.target.value = ''
  }
})

els.imageInput.addEventListener('change', async (event) => {
  const files = Array.from(event.target.files || [])
  if (!files.length) return
  try {
    const result = await addImagesToActivePage(files)
    if (result.failedCount > 0) {
      setStatusKey(result.addedCount > 0 ? 'status.imagesAddedPartial' : 'status.imageAddFailed', result.addedCount > 0 ? 'info' : 'error', {
        added: result.addedCount,
        failed: result.failedCount,
        message: t('errors.noImagesAdded')
      })
    } else if (result.addedCount === 1) {
      setStatusKey('status.imageAddedOne', 'success', { file: files[0].name })
    } else {
      setStatusKey('status.imagesAddedMany', 'success', { count: result.addedCount })
    }
  } catch (error) {
    console.error(error)
    setStatusKey('status.imageAddFailed', 'error', { message: error.message })
  } finally {
    event.target.value = ''
  }
})

els.pageSelect.addEventListener('change', (event) => {
  const pageNumber = Number(event.target.value)
  if (!Number.isFinite(pageNumber)) return
  setActivePage(pageNumber)
})

els.localeSelect?.addEventListener('change', (event) => {
  i18n.setLocale(event.target.value)
  applyLocaleToUi()
})

els.savePdf.addEventListener('click', async () => {
  try {
    await saveEditedPdf()
  } catch (error) {
    console.error(error)
    setStatusKey('status.pdfSaveFailed', 'error', { message: error.message })
  }
})

els.removeSelected.addEventListener('click', () => {
  removeSelectedPlacement()
})

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Delete' && event.key !== 'Backspace') return
  const tagName = event.target?.tagName?.toLowerCase() || ''
  if (tagName === 'input' || tagName === 'textarea') return
  removeSelectedPlacement()
})

function t(key, params = {}) {
  return i18n.t(key, params)
}

function setStatus(message, type = 'info') {
  els.status.textContent = message
  els.status.dataset.type = type
}

function setStatusKey(key, type = 'info', params = {}) {
  state.statusSnapshot = { key, type, params }
  setStatus(t(key, params), type)
}

function refreshStatusText() {
  const { key, type, params } = state.statusSnapshot
  setStatus(t(key, params), type)
}

function updatePdfMetaText() {
  if (!state.pdfProxy || !state.pdfName) {
    els.pdfMeta.textContent = t('labels.noPdfLoaded')
    return
  }
  els.pdfMeta.textContent = t('formats.pdfMeta', { file: state.pdfName, pages: state.pdfProxy.numPages })
}

function updatePageLabels() {
  for (const [pageNumber, pageInfo] of state.pageInfoByNumber.entries()) {
    if (!pageInfo.pageLabel) continue
    pageInfo.pageLabel.textContent = t('formats.pageLabel', { page: pageNumber })
  }
}

function applyLocaleToUi() {
  i18n.applyTranslations(document)
  if (els.localeSelect) {
    els.localeSelect.value = i18n.locale
  }
  updatePdfMetaText()
  if (state.pdfProxy) {
    populatePageSelect(state.pdfProxy.numPages)
    setActivePage(state.activePage)
  }
  updatePageLabels()
  refreshStatusText()
}

async function updateAppVersionText() {
  if (!els.appVersion) return
  try {
    const response = await fetch('/package.json', { cache: 'no-store' })
    if (!response.ok) {
      els.appVersion.textContent = '—'
      return
    }
    const pkg = await response.json()
    const version = String(pkg?.version || '').trim()
    els.appVersion.textContent = version || '—'
  } catch (_error) {
    els.appVersion.textContent = '—'
  }
}

function setActivePage(pageNumber) {
  if (!state.pageInfoByNumber.has(pageNumber)) return
  state.activePage = pageNumber
  els.pageSelect.value = String(pageNumber)
  for (const [currentPage, pageInfo] of state.pageInfoByNumber.entries()) {
    pageInfo.wrapper.classList.toggle('is-active', currentPage === pageNumber)
  }
}

function clearPlacements() {
  for (const interactable of state.interactablesById.values()) {
    interactable.unset()
  }
  state.interactablesById.clear()
  state.placementsById.clear()
  state.selectedPlacementId = null
  state.nextPlacementId = 1
  els.removeSelected.disabled = true
}

function clearPages() {
  els.pageList.innerHTML = ''
  state.pageInfoByNumber.clear()
}

function updateUiAvailability() {
  const hasPdf = Boolean(state.pdfBytes)
  els.imageInput.disabled = !hasPdf
  els.pageSelect.disabled = !hasPdf
  els.savePdf.disabled = !hasPdf
  els.removeSelected.disabled = !state.selectedPlacementId
}

async function loadPdf(file) {
  const arrayBuffer = await file.arrayBuffer()
  state.pdfBytes = new Uint8Array(arrayBuffer)
  const bytesForRendering = state.pdfBytes.slice()
  state.pdfName = file.name

  if (state.pdfProxy) {
    state.pdfProxy.destroy()
    state.pdfProxy = null
  }

  // pdf.js may transfer/consume the provided Uint8Array in worker mode, so keep a dedicated copy for rendering.
  state.pdfProxy = await getDocument({ data: bytesForRendering }).promise
  clearPlacements()
  clearPages()
  await renderAllPages(state.pdfProxy)
  populatePageSelect(state.pdfProxy.numPages)
  setActivePage(1)
  updatePdfMetaText()
  updateUiAvailability()
}

function populatePageSelect(pageCount) {
  els.pageSelect.innerHTML = ''
  for (let page = 1; page <= pageCount; page += 1) {
    const option = document.createElement('option')
    option.value = String(page)
    option.textContent = t('formats.pageOption', { page })
    els.pageSelect.append(option)
  }
}

async function renderAllPages(pdfProxy) {
  const listWidth = Math.max(320, els.pageList.clientWidth - 24)

  for (let pageNumber = 1; pageNumber <= pdfProxy.numPages; pageNumber += 1) {
    const page = await pdfProxy.getPage(pageNumber)
    const viewportAtOne = page.getViewport({ scale: 1 })
    const targetWidth = Math.min(940, listWidth)
    const scale = targetWidth / viewportAtOne.width
    const viewport = page.getViewport({ scale })

    const wrapper = document.createElement('article')
    wrapper.className = 'page-wrapper'
    wrapper.dataset.page = String(pageNumber)

    const pageLabel = document.createElement('div')
    pageLabel.className = 'page-label'
    pageLabel.textContent = t('formats.pageLabel', { page: pageNumber })

    const stage = document.createElement('div')
    stage.className = 'page-stage'

    const canvas = document.createElement('canvas')
    canvas.className = 'pdf-canvas'
    await renderPageToCanvas(page, canvas, viewport)

    const overlay = document.createElement('div')
    overlay.className = 'page-overlay'
    overlay.style.width = `${viewport.width}px`
    overlay.style.height = `${viewport.height}px`

    overlay.addEventListener('pointerdown', (event) => {
      setActivePage(pageNumber)
      if (event.target === overlay) {
        selectPlacement(null)
      }
    })

    stage.addEventListener('pointerdown', () => {
      setActivePage(pageNumber)
    })

    stage.append(canvas, overlay)
    wrapper.append(pageLabel, stage)
    els.pageList.append(wrapper)

    state.pageInfoByNumber.set(pageNumber, {
      wrapper,
      overlay,
      pageLabel,
      renderedWidth: viewport.width,
      renderedHeight: viewport.height,
      pdfWidth: viewportAtOne.width,
      pdfHeight: viewportAtOne.height
    })
  }
}

async function renderPageToCanvas(page, canvas, viewport) {
  const context = canvas.getContext('2d', { alpha: false })
  const outputScale = window.devicePixelRatio || 1

  canvas.width = Math.floor(viewport.width * outputScale)
  canvas.height = Math.floor(viewport.height * outputScale)
  canvas.style.width = `${viewport.width}px`
  canvas.style.height = `${viewport.height}px`

  const renderTask = page.render({
    canvasContext: context,
    viewport,
    transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0]
  })
  await renderTask.promise
}

async function addImageToActivePage(file) {
  if (!state.pdfProxy) {
    throw new Error(t('errors.loadPdfFirst'))
  }

  const pageInfo = state.pageInfoByNumber.get(state.activePage)
  if (!pageInfo) {
    throw new Error(t('errors.activePageMissing'))
  }

  const existingOnPage = countPlacementsOnPage(state.activePage)

  const rawDataUrl = await fileToDataUrl(file)
  const normalized = await normalizeImageToPng(rawDataUrl)
  const maxWidth = pageInfo.renderedWidth * 0.35
  const maxHeight = pageInfo.renderedHeight * 0.35

  let width = Math.min(maxWidth, normalized.width)
  let height = width * (normalized.height / normalized.width)
  if (height > maxHeight) {
    height = maxHeight
    width = height * (normalized.width / normalized.height)
  }

  const placement = {
    id: `img-${state.nextPlacementId++}`,
    pageNumber: state.activePage,
    dataUrl: normalized.dataUrl,
    x: (pageInfo.renderedWidth - width) / 2,
    y: (pageInfo.renderedHeight - height) / 2,
    width,
    height
  }

  // Offset new images slightly so repeated uploads stay visible instead of fully overlapping.
  const offsetStep = 18
  const offset = Math.min(existingOnPage, 12) * offsetStep
  placement.x += offset
  placement.y += offset
  clampPlacementToPage(placement)

  state.placementsById.set(placement.id, placement)
  createPlacementElement(placement)
  selectPlacement(placement.id)
}

async function addImagesToActivePage(files) {
  if (!state.pdfProxy) {
    throw new Error(t('errors.loadPdfFirst'))
  }

  let addedCount = 0
  let failedCount = 0

  for (const file of files) {
    try {
      await addImageToActivePage(file)
      addedCount += 1
    } catch (error) {
      failedCount += 1
      console.error(`Bild konnte nicht hinzugefügt werden: ${file.name}`, error)
    }
  }

  if (addedCount === 0) {
    throw new Error(t('errors.noImagesAdded'))
  }

  return { addedCount, failedCount }
}

function countPlacementsOnPage(pageNumber) {
  let count = 0
  for (const placement of state.placementsById.values()) {
    if (placement.pageNumber === pageNumber) {
      count += 1
    }
  }
  return count
}

function createPlacementElement(placement) {
  const pageInfo = state.pageInfoByNumber.get(placement.pageNumber)
  if (!pageInfo) return
  const aspectRatio = placement.width / placement.height

  const node = document.createElement('div')
  node.className = 'placement'
  node.dataset.id = placement.id

  const image = document.createElement('img')
  image.src = placement.dataUrl
  image.alt = 'Überlagertes Bild'
  image.draggable = false

  const grip = document.createElement('div')
  grip.className = 'placement-grip'
  grip.setAttribute('role', 'button')
  grip.setAttribute('aria-label', 'Bild skalieren')

  node.append(image, grip)
  pageInfo.overlay.append(node)
  applyPlacementStyle(placement)

  node.addEventListener('pointerdown', (event) => {
    selectPlacement(placement.id)
  })

  const interactable = interact(node)
    .draggable({
      ignoreFrom: '.placement-grip',
      listeners: {
        start() {
          selectPlacement(placement.id)
        },
        move(event) {
          const current = state.placementsById.get(placement.id)
          if (!current) return
          current.x += event.dx
          current.y += event.dy
          clampPlacementToPage(current)
          applyPlacementStyle(current)
        }
      }
    })
    .resizable({
      allowFrom: '.placement-grip',
      edges: {
        right: '.placement-grip',
        bottom: '.placement-grip'
      },
      listeners: {
        start() {
          selectPlacement(placement.id)
        },
        move(event) {
          const current = state.placementsById.get(placement.id)
          if (!current) return
          let nextWidth = Math.max(event.rect.width, 30)
          let nextHeight = nextWidth / aspectRatio
          if (nextHeight < 30) {
            nextHeight = 30
            nextWidth = nextHeight * aspectRatio
          }
          current.width = nextWidth
          current.height = nextHeight
          clampPlacementToPage(current)
          applyPlacementStyle(current)
        }
      }
    })

  state.interactablesById.set(placement.id, interactable)
}

function clampPlacementToPage(placement) {
  const pageInfo = state.pageInfoByNumber.get(placement.pageNumber)
  if (!pageInfo) return

  placement.width = Math.min(Math.max(placement.width, 30), pageInfo.renderedWidth)
  placement.height = Math.min(Math.max(placement.height, 30), pageInfo.renderedHeight)

  const maxX = Math.max(pageInfo.renderedWidth - placement.width, 0)
  const maxY = Math.max(pageInfo.renderedHeight - placement.height, 0)

  placement.x = Math.min(Math.max(placement.x, 0), maxX)
  placement.y = Math.min(Math.max(placement.y, 0), maxY)
}

function applyPlacementStyle(placement) {
  const pageInfo = state.pageInfoByNumber.get(placement.pageNumber)
  if (!pageInfo) return
  const node = pageInfo.overlay.querySelector(`[data-id="${placement.id}"]`)
  if (!node) return
  node.style.width = `${placement.width}px`
  node.style.height = `${placement.height}px`
  node.style.transform = `translate(${placement.x}px, ${placement.y}px)`
}

function selectPlacement(placementId) {
  state.selectedPlacementId = placementId
  for (const pageInfo of state.pageInfoByNumber.values()) {
    for (const element of pageInfo.overlay.querySelectorAll('.placement')) {
      element.classList.toggle('is-selected', element.dataset.id === placementId)
    }
  }
  updateUiAvailability()
}

function removeSelectedPlacement() {
  const placementId = state.selectedPlacementId
  if (!placementId) return

  const placement = state.placementsById.get(placementId)
  if (!placement) return

  const pageInfo = state.pageInfoByNumber.get(placement.pageNumber)
  const node = pageInfo?.overlay.querySelector(`[data-id="${placementId}"]`)
  if (node) {
    node.remove()
  }

  const interactable = state.interactablesById.get(placementId)
  if (interactable) {
    interactable.unset()
    state.interactablesById.delete(placementId)
  }

  state.placementsById.delete(placementId)
  selectPlacement(null)
  setStatusKey('status.imageRemoved', 'info')
}

async function saveEditedPdf() {
  if (!state.pdfBytes) {
    throw new Error(t('errors.loadPdfFirst'))
  }

  const pdfDoc = await PDFDocument.load(state.pdfBytes.slice())
  const imageCache = new Map()

  for (const placement of state.placementsById.values()) {
    const pageIndex = placement.pageNumber - 1
    const page = pdfDoc.getPage(pageIndex)
    if (!page) continue

    const pageInfo = state.pageInfoByNumber.get(placement.pageNumber)
    if (!pageInfo) continue

    const xScale = page.getWidth() / pageInfo.renderedWidth
    const yScale = page.getHeight() / pageInfo.renderedHeight

    const x = placement.x * xScale
    const width = placement.width * xScale
    const height = placement.height * yScale
    const y = page.getHeight() - placement.y * yScale - height

    const embeddedImage = await getEmbeddedImage(pdfDoc, imageCache, placement.dataUrl)
    page.drawImage(embeddedImage, { x, y, width, height })
  }

  const outputBytes = await pdfDoc.save()
  const outputFileName = buildOutputFileName(state.pdfName)
  downloadBytes(outputBytes, outputFileName)
  setStatusKey('status.pdfSaved', 'success', { file: outputFileName })
}

async function getEmbeddedImage(pdfDoc, imageCache, dataUrl) {
  if (imageCache.has(dataUrl)) {
    return imageCache.get(dataUrl)
  }

  const imageBytes = new Uint8Array(await dataUrlToArrayBuffer(dataUrl))
  const embedded = await pdfDoc.embedPng(imageBytes)
  imageCache.set(dataUrl, embedded)
  return embedded
}

function buildOutputFileName(inputName) {
  const baseName = inputName.replace(/\.pdf$/i, '')
  return `${baseName || 'dokument'}-bearbeitet.pdf`
}

function downloadBytes(bytes, fileName) {
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error(t('errors.fileReadFailed')))
    reader.readAsDataURL(file)
  })
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(t('errors.imageLoadFailed')))
    image.src = dataUrl
  })
}

async function normalizeImageToPng(dataUrl) {
  const image = await loadImageFromDataUrl(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: image.naturalWidth,
    height: image.naturalHeight
  }
}

async function dataUrlToArrayBuffer(dataUrl) {
  const response = await fetch(dataUrl)
  return response.arrayBuffer()
}

async function initApp() {
  try {
    await i18n.init()
    applyLocaleToUi()
  } catch (error) {
    console.error(error)
    setStatus('Localization could not be initialized.', 'error')
  }
  await updateAppVersionText()
  updatePdfMetaText()
  updateUiAvailability()
  setStatusKey('status.ready', 'info')
}

await initApp()
