import { PDFDocument } from '/src/vendor/pdf-lib/pdf-lib.esm.min.js'
import { GlobalWorkerOptions, getDocument } from '/src/vendor/pdfjs-dist/build/pdf.mjs'
import { AppApiEndpointUtils } from './AppApiEndpointUtils.mjs'
import { I18n } from './I18n.mjs'

const interact = globalThis.interact
if (typeof interact !== 'function') {
  throw new Error('InteractJS runtime is not loaded. Ensure /src/vendor/interactjs/interact.min.js is available.')
}

GlobalWorkerOptions.workerSrc = '/src/vendor/pdfjs-dist/build/pdf.worker.min.mjs'

const i18n = new I18n({
  defaultLocale: 'de',
  storageKey: 'pdf_expert_locale',
  bundlesBasePath: '/src/i18n'
})

const els = {
  pdfInput: document.querySelector('#pdf-input'),
  appendPdfInput: document.querySelector('#append-pdf-input'),
  imageInput: document.querySelector('#image-input'),
  pageSelect: document.querySelector('#page-select'),
  localeSelect: document.querySelector('#locale-select'),
  movePageUp: document.querySelector('#move-page-up'),
  movePageDown: document.querySelector('#move-page-down'),
  addBlankPage: document.querySelector('#add-blank-page'),
  deletePage: document.querySelector('#delete-page'),
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
  isBusy: false,
  statusSnapshot: {
    key: 'status.ready',
    params: {},
    type: 'info'
  }
}

els.pdfInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  await runWithBusyState(async () => {
    setStatusKey('status.pdfLoading', 'info', { file: file.name })
    await loadPdf(file)
    setStatusKey('status.pdfLoaded', 'success', { file: file.name })
  }, 'status.pdfLoadFailed')
  event.target.value = ''
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

els.movePageUp?.addEventListener('click', async () => {
  await moveActivePage(-1)
})

els.movePageDown?.addEventListener('click', async () => {
  await moveActivePage(1)
})

els.addBlankPage?.addEventListener('click', async () => {
  await addBlankPageAfterActive()
})

els.deletePage?.addEventListener('click', async () => {
  await deleteActivePage()
})

els.appendPdfInput?.addEventListener('change', async (event) => {
  const files = Array.from(event.target.files || [])
  if (!files.length) return
  await runWithBusyState(async () => {
    setStatusKey('status.appendingPdf', 'info', { count: files.length })
    const result = await appendPdfFiles(files)
    if (result.appendedPages > 0) {
      setStatusKey('status.pagesAppended', 'success', {
        pages: result.appendedPages,
        files: result.appendedFiles
      })
    } else if (result.loadedBasePdf) {
      setStatusKey('status.pdfLoaded', 'success', { file: state.pdfName })
    }
  }, 'status.pdfAppendFailed')
  event.target.value = ''
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

/**
 * Runs an async operation while interaction controls are disabled.
 * @param {() => Promise<void>} operation
 * @param {string} [errorStatusKey]
 * @returns {Promise<void>}
 */
async function runWithBusyState(operation, errorStatusKey = 'status.operationFailed') {
  if (state.isBusy) return
  setBusyState(true)
  try {
    await operation()
  } catch (error) {
    console.error(error)
    setStatusKey(errorStatusKey, 'error', { message: error.message })
  } finally {
    setBusyState(false)
  }
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
    const endpoint = AppApiEndpointUtils.resolveAppMetaEndpoint()
    const response = await fetch(endpoint, { cache: 'no-store' })
    if (!response.ok) {
      els.appVersion.textContent = '—'
      return
    }
    const payload = await response.json()
    const version = String(payload?.version || '').trim()
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
  updatePageActionAvailability()
}

/**
 * Enables or disables long-running UI interactions.
 * @param {boolean} isBusy
 */
function setBusyState(isBusy) {
  state.isBusy = Boolean(isBusy)
  updateUiAvailability()
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

/**
 * Extracts the numeric sequence from placement ids in format `img-N`.
 * @param {string} id
 * @returns {number}
 */
function extractPlacementSequence(id) {
  const match = /^img-(\d+)$/.exec(String(id || ''))
  if (!match) return 0
  return Number(match[1]) || 0
}

/**
 * Creates a deep-copy snapshot of all placements.
 * @returns {Array<object>}
 */
function getPlacementSnapshot() {
  return Array.from(state.placementsById.values()).map((placement) => ({ ...placement }))
}

/**
 * Normalizes placement data to avoid mutating original references.
 * @param {Array<object>} placements
 * @returns {Array<object>}
 */
function normalizePlacementSnapshot(placements) {
  return Array.isArray(placements) ? placements.map((placement) => ({ ...placement })) : []
}

/**
 * Restores placement overlay nodes after a page re-render.
 * @param {Array<object>} placements
 * @param {string|null} preferredSelectionId
 */
function restorePlacements(placements, preferredSelectionId = null) {
  let maxSequence = 0

  for (const placement of placements) {
    if (!state.pageInfoByNumber.has(placement.pageNumber)) continue
    clampPlacementToPage(placement)
    state.placementsById.set(placement.id, placement)
    createPlacementElement(placement)
    maxSequence = Math.max(maxSequence, extractPlacementSequence(placement.id))
  }

  state.nextPlacementId = Math.max(1, maxSequence + 1)

  if (preferredSelectionId && state.placementsById.has(preferredSelectionId)) {
    selectPlacement(preferredSelectionId)
    return
  }
  selectPlacement(null)
}

function updatePageActionAvailability() {
  const pageCount = state.pdfProxy?.numPages || 0
  const hasPdf = pageCount > 0
  const canMoveUp = hasPdf && state.activePage > 1
  const canMoveDown = hasPdf && state.activePage < pageCount
  const canDeletePage = hasPdf && pageCount > 1

  els.movePageUp.disabled = state.isBusy || !canMoveUp
  els.movePageDown.disabled = state.isBusy || !canMoveDown
  els.addBlankPage.disabled = state.isBusy || !hasPdf
  els.deletePage.disabled = state.isBusy || !canDeletePage
}

function updateUiAvailability() {
  const hasPdf = Boolean(state.pdfBytes)
  els.pdfInput.disabled = state.isBusy
  els.appendPdfInput.disabled = state.isBusy
  els.imageInput.disabled = state.isBusy || !hasPdf
  els.pageSelect.disabled = state.isBusy || !hasPdf
  els.savePdf.disabled = state.isBusy || !hasPdf
  els.removeSelected.disabled = state.isBusy || !state.selectedPlacementId
  updatePageActionAvailability()
}

async function loadPdf(file) {
  const arrayBuffer = await file.arrayBuffer()
  state.pdfBytes = new Uint8Array(arrayBuffer)
  state.pdfName = file.name
  state.activePage = 1
  await hydratePdfFromState({ placements: [], activePage: 1 })
}

/**
 * Re-renders the current PDF bytes and restores overlay placements.
 * @param {{placements?: Array<object>, activePage?: number}} [options]
 * @returns {Promise<void>}
 */
async function hydratePdfFromState(options = {}) {
  if (!state.pdfBytes) {
    if (state.pdfProxy) {
      state.pdfProxy.destroy()
      state.pdfProxy = null
    }
    clearPlacements()
    clearPages()
    updatePdfMetaText()
    updateUiAvailability()
    return
  }

  const placements = normalizePlacementSnapshot(options.placements || [])
  const nextActivePage = Number(options.activePage || state.activePage || 1)
  const previousSelectionId = state.selectedPlacementId

  if (state.pdfProxy) {
    state.pdfProxy.destroy()
    state.pdfProxy = null
  }

  // pdf.js may transfer/consume the provided Uint8Array in worker mode, so keep a dedicated copy for rendering.
  const bytesForRendering = state.pdfBytes.slice()
  state.pdfProxy = await getDocument({ data: bytesForRendering }).promise

  clearPlacements()
  clearPages()
  await renderAllPages(state.pdfProxy)
  populatePageSelect(state.pdfProxy.numPages)
  setActivePage(Math.min(Math.max(nextActivePage, 1), state.pdfProxy.numPages))
  restorePlacements(placements, previousSelectionId)
  updatePdfMetaText()
  updateUiAvailability()
}

/**
 * Applies a structural PDF mutation and refreshes page previews.
 * @param {(pdfDoc: any) => Promise<void | any> | void | any} mutator
 * @param {{placements?: Array<object>, activePage?: number}} [options]
 * @returns {Promise<void>}
 */
async function withPdfMutation(mutator, options = {}) {
  if (!state.pdfBytes) {
    throw new Error(t('errors.loadPdfFirst'))
  }

  const placements = normalizePlacementSnapshot(options.placements ?? getPlacementSnapshot())
  const pdfDoc = await PDFDocument.load(state.pdfBytes.slice())
  const mutationResult = await mutator(pdfDoc)
  const nextPdfDoc = mutationResult && typeof mutationResult.save === 'function' ? mutationResult : pdfDoc
  state.pdfBytes = new Uint8Array(await nextPdfDoc.save())
  await hydratePdfFromState({
    placements,
    activePage: options.activePage ?? state.activePage
  })
}

/**
 * Creates a new document with pages copied in the provided order.
 * @param {any} sourcePdfDoc
 * @param {number[]} orderedPageIndices
 * @returns {Promise<any>}
 */
async function buildReorderedPdf(sourcePdfDoc, orderedPageIndices) {
  const reorderedPdfDoc = await PDFDocument.create()
  const copiedPages = await reorderedPdfDoc.copyPages(sourcePdfDoc, orderedPageIndices)
  for (const copiedPage of copiedPages) {
    reorderedPdfDoc.addPage(copiedPage)
  }
  return reorderedPdfDoc
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

/**
 * Remaps placement page numbers when moving a page.
 * @param {Array<object>} placements
 * @param {number} fromPage
 * @param {number} toPage
 * @returns {Array<object>}
 */
function remapPlacementsForPageMove(placements, fromPage, toPage) {
  return placements.map((placement) => {
    const nextPlacement = { ...placement }
    if (placement.pageNumber === fromPage) {
      nextPlacement.pageNumber = toPage
      return nextPlacement
    }
    if (fromPage < toPage && placement.pageNumber > fromPage && placement.pageNumber <= toPage) {
      nextPlacement.pageNumber = placement.pageNumber - 1
      return nextPlacement
    }
    if (fromPage > toPage && placement.pageNumber >= toPage && placement.pageNumber < fromPage) {
      nextPlacement.pageNumber = placement.pageNumber + 1
      return nextPlacement
    }
    return nextPlacement
  })
}

/**
 * Remaps placement page numbers when inserting a new page after `afterPage`.
 * @param {Array<object>} placements
 * @param {number} afterPage
 * @returns {Array<object>}
 */
function remapPlacementsForPageInsertion(placements, afterPage) {
  return placements.map((placement) => {
    const nextPlacement = { ...placement }
    if (placement.pageNumber > afterPage) {
      nextPlacement.pageNumber = placement.pageNumber + 1
    }
    return nextPlacement
  })
}

/**
 * Remaps placement page numbers when deleting a page.
 * @param {Array<object>} placements
 * @param {number} deletedPage
 * @returns {Array<object>}
 */
function remapPlacementsForPageDeletion(placements, deletedPage) {
  const nextPlacements = []
  for (const placement of placements) {
    if (placement.pageNumber === deletedPage) continue
    if (placement.pageNumber > deletedPage) {
      nextPlacements.push({ ...placement, pageNumber: placement.pageNumber - 1 })
      continue
    }
    nextPlacements.push({ ...placement })
  }
  return nextPlacements
}

/**
 * Appends all pages of additional PDF files to the current document.
 * If no base PDF is loaded, the first file is loaded as base and remaining files are appended.
 * @param {File[]} files
 * @returns {Promise<{loadedBasePdf: boolean, appendedPages: number, appendedFiles: number}>}
 */
async function appendPdfFiles(files) {
  const queue = Array.from(files || [])
  let loadedBasePdf = false

  if (!queue.length) {
    return {
      loadedBasePdf,
      appendedPages: 0,
      appendedFiles: 0
    }
  }

  if (!state.pdfBytes) {
    const firstPdf = queue.shift()
    if (firstPdf) {
      await loadPdf(firstPdf)
      loadedBasePdf = true
    }
  }

  if (!queue.length) {
    return {
      loadedBasePdf,
      appendedPages: 0,
      appendedFiles: 0
    }
  }

  let appendedPages = 0

  await withPdfMutation(
    async (pdfDoc) => {
      for (const file of queue) {
        const appendBytes = new Uint8Array(await file.arrayBuffer())
        const appendDoc = await PDFDocument.load(appendBytes)
        const copiedPages = await pdfDoc.copyPages(appendDoc, appendDoc.getPageIndices())
        for (const copiedPage of copiedPages) {
          pdfDoc.addPage(copiedPage)
        }
        appendedPages += copiedPages.length
      }
    },
    {
      placements: getPlacementSnapshot(),
      activePage: state.activePage
    }
  )

  return {
    loadedBasePdf,
    appendedPages,
    appendedFiles: queue.length
  }
}

async function moveActivePage(direction) {
  if (!state.pdfProxy) {
    setStatusKey('status.pageMoveFailed', 'error', { message: t('errors.loadPdfFirst') })
    return
  }

  const fromPage = state.activePage
  const toPage = fromPage + direction
  if (toPage < 1 || toPage > state.pdfProxy.numPages) return

  await runWithBusyState(async () => {
    const placements = remapPlacementsForPageMove(getPlacementSnapshot(), fromPage, toPage)
    await withPdfMutation(
      async (pdfDoc) => {
        const pageCount = pdfDoc.getPageCount()
        const reorderedIndices = Array.from({ length: pageCount }, (_value, index) => index)
        const [movedIndex] = reorderedIndices.splice(fromPage - 1, 1)
        reorderedIndices.splice(toPage - 1, 0, movedIndex)
        return buildReorderedPdf(pdfDoc, reorderedIndices)
      },
      {
        placements,
        activePage: toPage
      }
    )
    setStatusKey('status.pageMoved', 'success', { from: fromPage, to: toPage })
  }, 'status.pageMoveFailed')
}

async function addBlankPageAfterActive() {
  if (!state.pdfProxy) {
    setStatusKey('status.pageAddFailed', 'error', { message: t('errors.loadPdfFirst') })
    return
  }

  await runWithBusyState(async () => {
    const insertionPoint = state.activePage
    const placements = remapPlacementsForPageInsertion(getPlacementSnapshot(), insertionPoint)

    await withPdfMutation(
      (pdfDoc) => {
        const referencePage = pdfDoc.getPage(insertionPoint - 1)
        const { width, height } = referencePage ? referencePage.getSize() : { width: 595, height: 842 }
        pdfDoc.insertPage(insertionPoint, [width, height])
      },
      {
        placements,
        activePage: insertionPoint + 1
      }
    )

    setStatusKey('status.pageAdded', 'success', { page: insertionPoint + 1 })
  }, 'status.pageAddFailed')
}

async function deleteActivePage() {
  if (!state.pdfProxy) {
    setStatusKey('status.pageDeleteFailed', 'error', { message: t('errors.loadPdfFirst') })
    return
  }

  if (state.pdfProxy.numPages <= 1) {
    setStatusKey('status.lastPageDeletionBlocked', 'info')
    return
  }

  await runWithBusyState(async () => {
    const deletedPage = state.activePage
    const nextActivePage = Math.max(1, Math.min(deletedPage, state.pdfProxy.numPages - 1))
    const placements = remapPlacementsForPageDeletion(getPlacementSnapshot(), deletedPage)

    await withPdfMutation(
      (pdfDoc) => {
        pdfDoc.removePage(deletedPage - 1)
      },
      {
        placements,
        activePage: nextActivePage
      }
    )

    setStatusKey('status.pageDeleted', 'success', { page: deletedPage })
  }, 'status.pageDeleteFailed')
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
