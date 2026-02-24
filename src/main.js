import { PDFDocument } from '/src/vendor/pdf-lib/pdf-lib.esm.min.js'
import { GlobalWorkerOptions, getDocument } from '/src/vendor/pdfjs-dist/build/pdf.mjs'
import { AppApiEndpointUtils } from './AppApiEndpointUtils.mjs'
import { I18n } from './I18n.mjs'
import { WebMcpIntegration } from './WebMcpIntegration.mjs'

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
  rotateSelectedLeft: document.querySelector('#rotate-selected-left'),
  rotateSelectedRight: document.querySelector('#rotate-selected-right'),
  removeSelected: document.querySelector('#remove-selected'),
  controls: document.querySelector('.controls'),
  workspace: document.querySelector('#workspace'),
  workspaceEmptyState: document.querySelector('#workspace-empty-state'),
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

let webMcpIntegration = null
let resizeRerenderTimeoutId = null

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

els.rotateSelectedLeft?.addEventListener('click', async () => {
  await rotateSelectedPlacement('left')
})

els.rotateSelectedRight?.addEventListener('click', async () => {
  await rotateSelectedPlacement('right')
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

setupWorkspacePdfDropTarget()
window.addEventListener('resize', handleWindowResize)

function t(key, params = {}) {
  return i18n.t(key, params)
}

/**
 * Schedules a WebMCP context refresh when integration is active.
 * @returns {void}
 */
function refreshWebMcpContext() {
  webMcpIntegration?.refresh()
}

/**
 * Runs an async operation while interaction controls are disabled.
 * @param {() => Promise<void>} operation
 * @param {string} [errorStatusKey]
 * @param {{propagateError?: boolean}} [options]
 * @returns {Promise<any>}
 */
async function runWithBusyState(operation, errorStatusKey = 'status.operationFailed', options = {}) {
  const { propagateError = false } = options
  if (state.isBusy) {
    if (propagateError) {
      throw new Error('Another operation is currently running.')
    }
    return null
  }
  setBusyState(true)
  try {
    return await operation()
  } catch (error) {
    console.error(error)
    setStatusKey(errorStatusKey, 'error', { message: error.message })
    if (propagateError) {
      throw error
    }
    return null
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
  refreshWebMcpContext()
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
  els.rotateSelectedLeft.disabled = true
  els.rotateSelectedRight.disabled = true
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

/**
 * Toggles workspace empty-state styling based on whether a PDF is loaded.
 * @returns {void}
 */
function updateWorkspaceEmptyState() {
  if (!els.workspace || !els.workspaceEmptyState) return
  const hasPdf = Boolean(state.pdfBytes)
  els.workspace.classList.toggle('is-empty', !hasPdf)
  if (hasPdf) {
    els.workspace.classList.remove('is-empty-drop-target')
  }
  syncWorkspaceEmptyHeight()
}

/**
 * Keeps the empty workspace height aligned with the controls panel height.
 * @returns {void}
 */
function syncWorkspaceEmptyHeight() {
  if (!els.workspace || !els.controls) return
  const hasPdf = Boolean(state.pdfBytes)
  if (hasPdf) {
    els.workspace.style.removeProperty('--workspace-empty-min-height')
    return
  }
  const controlsBounds = els.controls.getBoundingClientRect()
  const controlsHeight = Math.ceil(controlsBounds.height)
  if (controlsHeight > 0) {
    els.workspace.style.setProperty('--workspace-empty-min-height', `${controlsHeight}px`)
  }
}

/**
 * Returns rendered page dimensions keyed by page number.
 * @returns {Map<number, {renderedWidth: number, renderedHeight: number}>}
 */
function getRenderedPageMetricsByNumber() {
  const metrics = new Map()
  for (const [pageNumber, pageInfo] of state.pageInfoByNumber.entries()) {
    metrics.set(pageNumber, {
      renderedWidth: pageInfo.renderedWidth,
      renderedHeight: pageInfo.renderedHeight
    })
  }
  return metrics
}

/**
 * Scales placement geometry from previous rendered page sizes to current sizes.
 * @param {Array<object>} placements
 * @param {Map<number, {renderedWidth: number, renderedHeight: number}>} previousPageMetricsByNumber
 * @returns {Array<object>}
 */
function scalePlacementsForUpdatedPageMetrics(placements, previousPageMetricsByNumber) {
  return placements.map((placement) => {
    const previousMetrics = previousPageMetricsByNumber.get(placement.pageNumber)
    const nextMetrics = state.pageInfoByNumber.get(placement.pageNumber)
    if (!previousMetrics || !nextMetrics) {
      return { ...placement }
    }

    const xScale = previousMetrics.renderedWidth > 0 ? nextMetrics.renderedWidth / previousMetrics.renderedWidth : 1
    const yScale = previousMetrics.renderedHeight > 0 ? nextMetrics.renderedHeight / previousMetrics.renderedHeight : 1

    return {
      ...placement,
      x: placement.x * xScale,
      y: placement.y * yScale,
      width: placement.width * xScale,
      height: placement.height * yScale
    }
  })
}

/**
 * Schedules a debounced page re-render after browser window size changes.
 * @returns {void}
 */
function handleWindowResize() {
  if (resizeRerenderTimeoutId) {
    window.clearTimeout(resizeRerenderTimeoutId)
  }
  resizeRerenderTimeoutId = window.setTimeout(() => {
    resizeRerenderTimeoutId = null
    if (state.pdfBytes) {
      void rerenderPagesForCurrentLayout()
      return
    }
    syncWorkspaceEmptyHeight()
  }, 160)
}

/**
 * Re-renders all pages so previews and overlays adapt to the current layout width.
 * @returns {Promise<void>}
 */
async function rerenderPagesForCurrentLayout() {
  if (!state.pdfBytes || !state.pdfProxy || state.isBusy) return
  const previousPageMetricsByNumber = getRenderedPageMetricsByNumber()
  if (!previousPageMetricsByNumber.size) return

  const placements = getPlacementSnapshot()
  await runWithBusyState(async () => {
    await hydratePdfFromState({
      placements,
      activePage: state.activePage,
      previousPageMetricsByNumber
    })
  }, 'status.operationFailed')
}

function updateUiAvailability() {
  const hasPdf = Boolean(state.pdfBytes)
  const hasSelection = Boolean(state.selectedPlacementId)
  els.pdfInput.disabled = state.isBusy
  els.appendPdfInput.disabled = state.isBusy
  els.imageInput.disabled = state.isBusy || !hasPdf
  els.pageSelect.disabled = state.isBusy || !hasPdf
  els.savePdf.disabled = state.isBusy || !hasPdf
  els.rotateSelectedLeft.disabled = state.isBusy || !hasSelection
  els.rotateSelectedRight.disabled = state.isBusy || !hasSelection
  els.removeSelected.disabled = state.isBusy || !hasSelection
  updatePageActionAvailability()
  updateWorkspaceEmptyState()
  refreshWebMcpContext()
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
 * @param {{
 *   placements?: Array<object>,
 *   activePage?: number,
 *   previousPageMetricsByNumber?: Map<number, {renderedWidth: number, renderedHeight: number}>
 * }} [options]
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
  const previousPageMetricsByNumber = options.previousPageMetricsByNumber instanceof Map ? options.previousPageMetricsByNumber : null

  if (state.pdfProxy) {
    state.pdfProxy.destroy()
    state.pdfProxy = null
  }

  // pdf.js may transfer/consume the provided Uint8Array in worker mode, so keep a dedicated copy for rendering.
  const bytesForRendering = state.pdfBytes.slice()
  state.pdfProxy = await getDocument({ data: bytesForRendering }).promise

  clearPlacements()
  clearPages()
  updateWorkspaceEmptyState()
  await renderAllPages(state.pdfProxy)
  const scaledPlacements = previousPageMetricsByNumber
    ? scalePlacementsForUpdatedPageMetrics(placements, previousPageMetricsByNumber)
    : placements
  populatePageSelect(state.pdfProxy.numPages)
  setActivePage(Math.min(Math.max(nextActivePage, 1), state.pdfProxy.numPages))
  restorePlacements(scaledPlacements, previousSelectionId)
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

    setupPageImageDropTarget({
      pageNumber,
      wrapper,
      overlay
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

/**
 * Wires PDF drag-and-drop handling for the empty workspace state.
 * @returns {void}
 */
function setupWorkspacePdfDropTarget() {
  if (!els.workspace || !els.workspaceEmptyState) return
  let dragDepth = 0

  els.workspace.addEventListener('dragenter', (event) => {
    if (state.pdfBytes || !hasFileDropPayload(event.dataTransfer)) return
    event.preventDefault()
    dragDepth += 1
    els.workspace.classList.add('is-empty-drop-target')
  })

  els.workspace.addEventListener('dragover', (event) => {
    if (state.pdfBytes || !hasFileDropPayload(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    els.workspace.classList.add('is-empty-drop-target')
  })

  els.workspace.addEventListener('dragleave', (event) => {
    if (state.pdfBytes || !hasFileDropPayload(event.dataTransfer)) return
    dragDepth = Math.max(dragDepth - 1, 0)
    if (dragDepth === 0) {
      els.workspace.classList.remove('is-empty-drop-target')
    }
  })

  els.workspace.addEventListener('drop', async (event) => {
    if (state.pdfBytes || !hasFileDropPayload(event.dataTransfer)) return
    event.preventDefault()
    dragDepth = 0
    els.workspace.classList.remove('is-empty-drop-target')

    const pdfFiles = getPdfFilesFromDataTransfer(event.dataTransfer)
    if (!pdfFiles.length) {
      setStatusKey('status.pdfLoadFailed', 'error', { message: t('errors.dropPdfOnly') })
      return
    }

    const file = pdfFiles[0]
    await runWithBusyState(async () => {
      setStatusKey('status.pdfLoading', 'info', { file: file.name })
      await loadPdf(file)
      setStatusKey('status.pdfLoaded', 'success', { file: file.name })
    }, 'status.pdfLoadFailed')
  })
}

/**
 * Wires image file drag-and-drop handling for a rendered page.
 * @param {{pageNumber: number, wrapper: HTMLElement, overlay: HTMLElement}} options
 * @returns {void}
 */
function setupPageImageDropTarget(options) {
  const { pageNumber, wrapper, overlay } = options
  let dragDepth = 0

  overlay.addEventListener('dragenter', (event) => {
    if (!hasFileDropPayload(event.dataTransfer)) return
    event.preventDefault()
    dragDepth += 1
    wrapper.classList.add('is-drop-target')
  })

  overlay.addEventListener('dragover', (event) => {
    if (!hasFileDropPayload(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    wrapper.classList.add('is-drop-target')
  })

  overlay.addEventListener('dragleave', (event) => {
    if (!hasFileDropPayload(event.dataTransfer)) return
    dragDepth = Math.max(dragDepth - 1, 0)
    if (dragDepth === 0) {
      wrapper.classList.remove('is-drop-target')
    }
  })

  overlay.addEventListener('drop', async (event) => {
    if (!hasFileDropPayload(event.dataTransfer)) return
    event.preventDefault()
    dragDepth = 0
    wrapper.classList.remove('is-drop-target')
    setActivePage(pageNumber)

    const pdfFiles = getPdfFilesFromDataTransfer(event.dataTransfer)
    if (pdfFiles.length > 0) {
      await runWithBusyState(async () => {
        setStatusKey('status.appendingPdf', 'info', { count: pdfFiles.length })
        const result = await insertPdfFilesAfterPage(pdfFiles, pageNumber)
        setStatusKey('status.pagesInserted', 'success', {
          pages: result.insertedPages,
          files: result.insertedFiles,
          after: pageNumber
        })
      }, 'status.pdfAppendFailed')
      return
    }

    const imageFiles = getImageFilesFromDataTransfer(event.dataTransfer)
    if (!imageFiles.length) {
      setStatusKey('status.imageAddFailed', 'error', { message: t('errors.dropImagesOnly') })
      return
    }

    try {
      const dropPosition = getDropPositionWithinOverlay(event, overlay)
      const result = await addImagesToPage(imageFiles, {
        pageNumber,
        anchorX: dropPosition.x,
        anchorY: dropPosition.y
      })

      if (result.failedCount > 0) {
        setStatusKey(result.addedCount > 0 ? 'status.imagesAddedPartial' : 'status.imageAddFailed', result.addedCount > 0 ? 'info' : 'error', {
          added: result.addedCount,
          failed: result.failedCount,
          message: t('errors.noImagesAdded')
        })
      } else if (result.addedCount === 1) {
        setStatusKey('status.imageAddedOne', 'success', { file: imageFiles[0].name })
      } else {
        setStatusKey('status.imagesAddedMany', 'success', { count: result.addedCount })
      }
    } catch (error) {
      console.error(error)
      setStatusKey('status.imageAddFailed', 'error', { message: error.message })
    }
  })
}

/**
 * Returns true when the current drag payload includes files.
 * @param {DataTransfer | null} dataTransfer
 * @returns {boolean}
 */
function hasFileDropPayload(dataTransfer) {
  if (!dataTransfer) return false
  return Array.from(dataTransfer.types || []).includes('Files')
}

/**
 * Checks whether a dropped file is a PDF.
 * @param {File} file
 * @returns {boolean}
 */
function isPdfFile(file) {
  if (!file) return false
  if (String(file.type || '').toLowerCase() === 'application/pdf') return true
  return /\.pdf$/i.test(String(file.name || ''))
}

/**
 * Checks whether a dropped file is a supported image type.
 * @param {File} file
 * @returns {boolean}
 */
function isImageFile(file) {
  if (!file) return false
  if (String(file.type || '').startsWith('image/')) return true
  return /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/i.test(String(file.name || ''))
}

/**
 * Extracts image files from a drop payload.
 * @param {DataTransfer | null} dataTransfer
 * @returns {File[]}
 */
function getImageFilesFromDataTransfer(dataTransfer) {
  if (!dataTransfer) return []
  return Array.from(dataTransfer.files || []).filter((file) => isImageFile(file))
}

/**
 * Extracts PDF files from a drop payload.
 * @param {DataTransfer | null} dataTransfer
 * @returns {File[]}
 */
function getPdfFilesFromDataTransfer(dataTransfer) {
  if (!dataTransfer) return []
  return Array.from(dataTransfer.files || []).filter((file) => isPdfFile(file))
}

/**
 * Computes drop coordinates inside a page overlay.
 * @param {DragEvent} event
 * @param {HTMLElement} overlay
 * @returns {{x: number, y: number}}
 */
function getDropPositionWithinOverlay(event, overlay) {
  const bounds = overlay.getBoundingClientRect()
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top
  }
}

async function addImageToActivePage(file) {
  await addImageToPage(file, { pageNumber: state.activePage })
}

/**
 * Adds one image overlay to a target page.
 * @param {File} file
 * @param {{pageNumber?: number, anchorX?: number, anchorY?: number}} [options]
 * @returns {Promise<void>}
 */
async function addImageToPage(file, options = {}) {
  if (!state.pdfProxy) {
    throw new Error(t('errors.loadPdfFirst'))
  }

  const requestedPage = Number.isFinite(options.pageNumber) ? Math.trunc(options.pageNumber) : state.activePage
  const pageInfo = state.pageInfoByNumber.get(requestedPage)
  if (!pageInfo) {
    throw new Error(t('errors.activePageMissing'))
  }

  const existingOnPage = countPlacementsOnPage(requestedPage)

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

  const hasAnchor = Number.isFinite(options.anchorX) && Number.isFinite(options.anchorY)
  const baseX = hasAnchor ? options.anchorX - width / 2 : (pageInfo.renderedWidth - width) / 2
  const baseY = hasAnchor ? options.anchorY - height / 2 : (pageInfo.renderedHeight - height) / 2

  const placement = {
    id: `img-${state.nextPlacementId++}`,
    pageNumber: requestedPage,
    dataUrl: normalized.dataUrl,
    x: baseX,
    y: baseY,
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

/**
 * Adds multiple images to a target page.
 * @param {File[]} files
 * @param {{pageNumber?: number, anchorX?: number, anchorY?: number}} [options]
 * @returns {Promise<{addedCount: number, failedCount: number}>}
 */
async function addImagesToPage(files, options = {}) {
  let addedCount = 0
  let failedCount = 0

  for (const file of files) {
    try {
      await addImageToPage(file, options)
      addedCount += 1
    } catch (error) {
      failedCount += 1
      console.error(`Could not add image file "${file.name}".`, error)
    }
  }

  if (addedCount === 0) {
    throw new Error(t('errors.noImagesAdded'))
  }

  return { addedCount, failedCount }
}

async function addImagesToActivePage(files) {
  return addImagesToPage(files, { pageNumber: state.activePage })
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
  return remapPlacementsForPageBlockInsertion(placements, afterPage, 1)
}

/**
 * Remaps placement page numbers when inserting multiple pages.
 * @param {Array<object>} placements
 * @param {number} afterPage
 * @param {number} insertedPageCount
 * @returns {Array<object>}
 */
function remapPlacementsForPageBlockInsertion(placements, afterPage, insertedPageCount) {
  const normalizedInsertCount = Math.max(0, Math.trunc(insertedPageCount))
  if (normalizedInsertCount === 0) {
    return placements.map((placement) => ({ ...placement }))
  }
  return placements.map((placement) => {
    const nextPlacement = { ...placement }
    if (placement.pageNumber > afterPage) {
      nextPlacement.pageNumber = placement.pageNumber + normalizedInsertCount
    }
    return nextPlacement
  })
}

/**
 * Loads source PDF documents and their page indices for insertion.
 * @param {File[]} files
 * @returns {Promise<{sources: Array<{sourcePdfDoc: any, pageIndices: number[]}>, totalPages: number}>}
 */
async function loadPdfInsertionSources(files) {
  const sources = []
  let totalPages = 0
  for (const file of files) {
    const sourceBytes = new Uint8Array(await file.arrayBuffer())
    const sourcePdfDoc = await PDFDocument.load(sourceBytes)
    const pageIndices = sourcePdfDoc.getPageIndices()
    if (!pageIndices.length) continue
    sources.push({
      sourcePdfDoc,
      pageIndices
    })
    totalPages += pageIndices.length
  }
  return { sources, totalPages }
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

/**
 * Inserts all pages from PDF files directly after a target page.
 * @param {File[]} files
 * @param {number} afterPage
 * @returns {Promise<{insertedPages: number, insertedFiles: number}>}
 */
async function insertPdfFilesAfterPage(files, afterPage) {
  if (!state.pdfBytes || !state.pdfProxy) {
    throw new Error(t('errors.loadPdfFirst'))
  }

  const normalizedAfterPage = Math.trunc(afterPage)
  if (!Number.isFinite(normalizedAfterPage) || normalizedAfterPage < 1 || normalizedAfterPage > state.pdfProxy.numPages) {
    throw new Error(`Page ${afterPage} is out of range.`)
  }

  const queue = Array.from(files || [])
  if (!queue.length) {
    return {
      insertedPages: 0,
      insertedFiles: 0
    }
  }

  const { sources, totalPages } = await loadPdfInsertionSources(queue)
  if (!sources.length || totalPages <= 0) {
    return {
      insertedPages: 0,
      insertedFiles: 0
    }
  }

  const placements = remapPlacementsForPageBlockInsertion(getPlacementSnapshot(), normalizedAfterPage, totalPages)
  await withPdfMutation(
    async (pdfDoc) => {
      let insertionIndex = normalizedAfterPage
      for (const source of sources) {
        const copiedPages = await pdfDoc.copyPages(source.sourcePdfDoc, source.pageIndices)
        for (const copiedPage of copiedPages) {
          pdfDoc.insertPage(insertionIndex, copiedPage)
          insertionIndex += 1
        }
      }
    },
    {
      placements,
      activePage: normalizedAfterPage
    }
  )

  return {
    insertedPages: totalPages,
    insertedFiles: sources.length
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
  let aspectRatio = placement.width / placement.height

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
          const current = state.placementsById.get(placement.id)
          if (!current || current.height <= 0) {
            aspectRatio = 1
            return
          }
          aspectRatio = current.width / current.height
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

/**
 * Updates the rendered preview image for a placement.
 * @param {object} placement
 */
function applyPlacementImageSource(placement) {
  const pageInfo = state.pageInfoByNumber.get(placement.pageNumber)
  if (!pageInfo) return
  const image = pageInfo.overlay.querySelector(`[data-id="${placement.id}"] img`)
  if (!image) return
  image.src = placement.dataUrl
}

/**
 * Rotates the currently selected image placement by a quarter turn.
 * @param {'left' | 'right'} direction
 * @returns {Promise<void>}
 */
async function rotateSelectedPlacement(direction) {
  const placementId = state.selectedPlacementId
  if (!placementId) return

  const placement = state.placementsById.get(placementId)
  if (!placement) return

  const quarterTurns = direction === 'left' ? -1 : direction === 'right' ? 1 : 0
  if (quarterTurns === 0) return

  await runWithBusyState(async () => {
    const previousCenterX = placement.x + placement.width / 2
    const previousCenterY = placement.y + placement.height / 2
    const rotated = await rotateImageDataUrlByQuarterTurns(placement.dataUrl, quarterTurns)

    placement.dataUrl = rotated.dataUrl

    if (Math.abs(quarterTurns) % 2 === 1) {
      const previousWidth = placement.width
      const previousHeight = placement.height
      placement.width = previousHeight
      placement.height = previousWidth
      placement.x = previousCenterX - placement.width / 2
      placement.y = previousCenterY - placement.height / 2
    }

    clampPlacementToPage(placement)
    applyPlacementStyle(placement)
    applyPlacementImageSource(placement)

    setStatusKey(direction === 'left' ? 'status.imageRotatedLeft' : 'status.imageRotatedRight', 'success')
  }, 'status.imageRotateFailed')
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

/**
 * Builds the current edited PDF output without triggering a download.
 * @returns {Promise<{bytes: Uint8Array, fileName: string}>}
 */
async function createEditedPdfExport() {
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
  return {
    bytes: outputBytes,
    fileName: buildOutputFileName(state.pdfName)
  }
}

async function saveEditedPdf() {
  const exportedPdf = await createEditedPdfExport()
  downloadBytes(exportedPdf.bytes, exportedPdf.fileName)
  setStatusKey('status.pdfSaved', 'success', { file: exportedPdf.fileName })
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

/**
 * Rotates an image data URL by 90° increments and normalizes the result as PNG.
 * @param {string} dataUrl
 * @param {number} quarterTurns
 * @returns {Promise<{dataUrl: string, width: number, height: number}>}
 */
async function rotateImageDataUrlByQuarterTurns(dataUrl, quarterTurns) {
  const normalizedQuarterTurns = normalizeQuarterTurns(quarterTurns)
  if (normalizedQuarterTurns === 0) {
    return normalizeImageToPng(dataUrl)
  }

  const image = await loadImageFromDataUrl(dataUrl)
  const isQuarterTurn = Math.abs(normalizedQuarterTurns) % 2 === 1
  const canvas = document.createElement('canvas')
  canvas.width = isQuarterTurn ? image.naturalHeight : image.naturalWidth
  canvas.height = isQuarterTurn ? image.naturalWidth : image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error(t('errors.imageLoadFailed'))
  }

  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate((normalizedQuarterTurns * Math.PI) / 2)
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height
  }
}

/**
 * Normalizes a quarter-turn value into the range -1..2.
 * @param {number} quarterTurns
 * @returns {number}
 */
function normalizeQuarterTurns(quarterTurns) {
  if (!Number.isFinite(quarterTurns)) return 0
  const roundedQuarterTurns = Math.trunc(quarterTurns)
  const normalized = ((roundedQuarterTurns % 4) + 4) % 4
  return normalized > 2 ? normalized - 4 : normalized
}

async function dataUrlToArrayBuffer(dataUrl) {
  const response = await fetch(dataUrl)
  return response.arrayBuffer()
}

/**
 * Converts a Blob into a data URL string.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not convert blob to data URL.'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Converts binary data to a typed data URL.
 * @param {Uint8Array} bytes
 * @param {string} mimeType
 * @returns {Promise<string>}
 */
async function bytesToDataUrl(bytes, mimeType) {
  return blobToDataUrl(new Blob([bytes], { type: mimeType }))
}

/**
 * Creates a File object from a data URL.
 * @param {string} dataUrl
 * @param {string} fileName
 * @param {string} fallbackMimeType
 * @returns {Promise<File>}
 */
async function dataUrlToFile(dataUrl, fileName, fallbackMimeType) {
  const response = await fetch(dataUrl)
  if (!response.ok) {
    throw new Error(`Could not read data URL for "${fileName}".`)
  }
  const blob = await response.blob()
  const mimeType = blob.type || fallbackMimeType
  return new File([blob], fileName, { type: mimeType })
}

/**
 * Returns placement data in a stable deterministic order.
 * @returns {Array<object>}
 */
function getSortedPlacementSnapshot() {
  return Array.from(state.placementsById.values())
    .map((placement) => ({
      id: placement.id,
      pageNumber: placement.pageNumber,
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height
    }))
    .sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) {
        return a.pageNumber - b.pageNumber
      }
      return extractPlacementSequence(a.id) - extractPlacementSequence(b.id)
    })
}

/**
 * Builds a serializable state snapshot for WebMCP tools.
 * @returns {object}
 */
function getEditorStateSnapshot() {
  const pageCount = state.pdfProxy?.numPages || 0
  return {
    hasPdf: Boolean(state.pdfBytes),
    pdfName: state.pdfName,
    pageCount,
    activePage: pageCount > 0 ? state.activePage : null,
    selectedPlacementId: state.selectedPlacementId,
    isBusy: state.isBusy,
    locale: i18n.locale,
    placements: getSortedPlacementSnapshot()
  }
}

/**
 * Locates a rendered placement node.
 * @param {string} placementId
 * @returns {HTMLElement | null}
 */
function getPlacementNode(placementId) {
  for (const pageInfo of state.pageInfoByNumber.values()) {
    const node = pageInfo.overlay.querySelector(`[data-id="${placementId}"]`)
    if (node) return node
  }
  return null
}

/**
 * Ensures a placement exists and returns it.
 * @param {string} placementId
 * @returns {object}
 */
function getPlacementByIdOrThrow(placementId) {
  const placement = state.placementsById.get(placementId)
  if (!placement) {
    throw new Error(`Image placement "${placementId}" does not exist.`)
  }
  return placement
}

/**
 * Moves a placement node to another page overlay and updates geometry.
 * @param {string} placementId
 * @param {number} pageNumber
 * @returns {void}
 */
function movePlacementNodeToPage(placementId, pageNumber) {
  const targetPageInfo = state.pageInfoByNumber.get(pageNumber)
  if (!targetPageInfo) {
    throw new Error(`Page ${pageNumber} is not available.`)
  }
  const node = getPlacementNode(placementId)
  if (!node) {
    throw new Error(`Could not find placement node "${placementId}".`)
  }
  targetPageInfo.overlay.append(node)
}

/**
 * Updates placement geometry and page assignment from tool input.
 * @param {{
 *   placementId: string,
 *   pageNumber?: number,
 *   x?: number,
 *   y?: number,
 *   width?: number,
 *   height?: number
 * }} payload
 * @returns {object}
 */
function updatePlacementFromTool(payload) {
  const placement = getPlacementByIdOrThrow(payload.placementId)
  const hasGeometryInput =
    Number.isFinite(payload.x) ||
    Number.isFinite(payload.y) ||
    Number.isFinite(payload.width) ||
    Number.isFinite(payload.height) ||
    Number.isFinite(payload.pageNumber)

  if (!hasGeometryInput) {
    throw new Error('Provide at least one numeric field to update the image overlay.')
  }

  if (Number.isFinite(payload.pageNumber)) {
    const normalizedPageNumber = Math.trunc(payload.pageNumber)
    if (!state.pageInfoByNumber.has(normalizedPageNumber)) {
      throw new Error(`Page ${normalizedPageNumber} is out of range.`)
    }
    if (placement.pageNumber !== normalizedPageNumber) {
      placement.pageNumber = normalizedPageNumber
      movePlacementNodeToPage(payload.placementId, normalizedPageNumber)
    }
  }

  if (Number.isFinite(payload.x)) placement.x = payload.x
  if (Number.isFinite(payload.y)) placement.y = payload.y
  if (Number.isFinite(payload.width)) placement.width = payload.width
  if (Number.isFinite(payload.height)) placement.height = payload.height

  clampPlacementToPage(placement)
  applyPlacementStyle(placement)
  return { ...placement }
}

/**
 * Removes a placement by id regardless of current selection.
 * @param {string} placementId
 * @returns {void}
 */
function removePlacementById(placementId) {
  const previousSelectionId = state.selectedPlacementId
  getPlacementByIdOrThrow(placementId)
  selectPlacement(placementId)
  removeSelectedPlacement()
  if (previousSelectionId && previousSelectionId !== placementId && state.placementsById.has(previousSelectionId)) {
    selectPlacement(previousSelectionId)
  }
}

/**
 * Creates operation callbacks consumed by WebMCP integration.
 * @returns {object}
 */
function createWebMcpOperations() {
  return {
    getEditorState() {
      return getEditorStateSnapshot()
    },
    setLocale(locale) {
      const allowedLocales = new Set(['en', 'de'])
      if (!allowedLocales.has(locale)) {
        throw new Error(`Unsupported locale "${locale}".`)
      }
      i18n.setLocale(locale)
      applyLocaleToUi()
      return {
        locale: i18n.locale,
        editorState: getEditorStateSnapshot()
      }
    },
    async loadPdfFromDataUrl(payload) {
      const normalizedFileName = String(payload.fileName || 'document.pdf').trim() || 'document.pdf'
      const fileName = normalizedFileName.toLowerCase().endsWith('.pdf') ? normalizedFileName : `${normalizedFileName}.pdf`
      const file = await dataUrlToFile(payload.pdfDataUrl, fileName, 'application/pdf')
      await runWithBusyState(
        async () => {
          setStatusKey('status.pdfLoading', 'info', { file: file.name })
          await loadPdf(file)
          setStatusKey('status.pdfLoaded', 'success', { file: file.name })
        },
        'status.pdfLoadFailed',
        { propagateError: true }
      )
      return getEditorStateSnapshot()
    },
    async appendPdfDocuments(payload) {
      const files = await Promise.all(
        payload.documents.map(async (documentEntry, index) => {
          const fallbackName = `append-${index + 1}.pdf`
          const normalizedFileName = String(documentEntry.fileName || fallbackName).trim() || fallbackName
          const fileName = normalizedFileName.toLowerCase().endsWith('.pdf') ? normalizedFileName : `${normalizedFileName}.pdf`
          return dataUrlToFile(documentEntry.pdfDataUrl, fileName, 'application/pdf')
        })
      )

      const result = await runWithBusyState(
        async () => {
          setStatusKey('status.appendingPdf', 'info', { count: files.length })
          const appendResult = await appendPdfFiles(files)
          if (appendResult.appendedPages > 0) {
            setStatusKey('status.pagesAppended', 'success', {
              pages: appendResult.appendedPages,
              files: appendResult.appendedFiles
            })
          } else if (appendResult.loadedBasePdf) {
            setStatusKey('status.pdfLoaded', 'success', { file: state.pdfName })
          }
          return appendResult
        },
        'status.pdfAppendFailed',
        { propagateError: true }
      )

      return {
        ...result,
        editorState: getEditorStateSnapshot()
      }
    },
    selectActivePage(pageNumber) {
      if (!state.pdfProxy) {
        throw new Error(t('errors.loadPdfFirst'))
      }
      const normalizedPageNumber = Math.trunc(pageNumber)
      if (!Number.isFinite(normalizedPageNumber) || normalizedPageNumber < 1 || normalizedPageNumber > state.pdfProxy.numPages) {
        throw new Error(`Page ${pageNumber} is out of range.`)
      }
      setActivePage(normalizedPageNumber)
      return getEditorStateSnapshot()
    },
    async moveActivePage(direction) {
      if (!state.pdfProxy) {
        throw new Error(t('errors.loadPdfFirst'))
      }
      const normalizedDirection = direction === 'up' ? -1 : direction === 'down' ? 1 : 0
      if (normalizedDirection === 0) {
        throw new Error(`Unsupported direction "${direction}".`)
      }
      const previousPage = state.activePage
      await moveActivePage(normalizedDirection)
      if (state.activePage === previousPage) {
        throw new Error(`Page ${previousPage} cannot be moved ${direction}.`)
      }
      return getEditorStateSnapshot()
    },
    async addBlankPageAfterActive() {
      if (!state.pdfProxy) {
        throw new Error(t('errors.loadPdfFirst'))
      }
      const previousPageCount = state.pdfProxy.numPages
      await addBlankPageAfterActive()
      const nextPageCount = state.pdfProxy?.numPages || 0
      if (nextPageCount <= previousPageCount) {
        throw new Error('No blank page was added.')
      }
      return getEditorStateSnapshot()
    },
    async deleteActivePage() {
      if (!state.pdfProxy) {
        throw new Error(t('errors.loadPdfFirst'))
      }
      if (state.pdfProxy.numPages <= 1) {
        throw new Error('At least one page must remain in the PDF.')
      }
      const previousPageCount = state.pdfProxy.numPages
      await deleteActivePage()
      const nextPageCount = state.pdfProxy?.numPages || 0
      if (nextPageCount >= previousPageCount) {
        throw new Error('The active page could not be deleted.')
      }
      return getEditorStateSnapshot()
    },
    async addImageOverlays(payload) {
      if (!state.pdfProxy) {
        throw new Error(t('errors.loadPdfFirst'))
      }
      if (Number.isFinite(payload.pageNumber)) {
        const normalizedPageNumber = Math.trunc(payload.pageNumber)
        if (!state.pageInfoByNumber.has(normalizedPageNumber)) {
          throw new Error(`Page ${payload.pageNumber} is out of range.`)
        }
        setActivePage(normalizedPageNumber)
      }

      const files = await Promise.all(
        payload.images.map(async (imageEntry, index) => {
          const fallbackName = `image-${index + 1}.png`
          const normalizedFileName = String(imageEntry.fileName || fallbackName).trim() || fallbackName
          return dataUrlToFile(imageEntry.imageDataUrl, normalizedFileName, 'image/png')
        })
      )

      const result = await runWithBusyState(
        async () => addImagesToActivePage(files),
        'status.imageAddFailed',
        { propagateError: true }
      )

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

      return {
        ...result,
        editorState: getEditorStateSnapshot()
      }
    },
    selectImageOverlay(placementId) {
      getPlacementByIdOrThrow(placementId)
      selectPlacement(placementId)
      return getEditorStateSnapshot()
    },
    updateImageOverlay(payload) {
      const updatedPlacement = updatePlacementFromTool(payload)
      if (state.selectedPlacementId === payload.placementId) {
        selectPlacement(payload.placementId)
      }
      return {
        placement: updatedPlacement,
        editorState: getEditorStateSnapshot()
      }
    },
    async rotateSelectedImage(direction) {
      if (!state.selectedPlacementId) {
        throw new Error('No image overlay is selected.')
      }
      if (direction !== 'left' && direction !== 'right') {
        throw new Error(`Unsupported direction "${direction}".`)
      }
      const selectedPlacement = state.placementsById.get(state.selectedPlacementId)
      const previousDataUrl = selectedPlacement?.dataUrl || ''
      await rotateSelectedPlacement(direction)
      const nextDataUrl = selectedPlacement?.dataUrl || ''
      if (!nextDataUrl || nextDataUrl === previousDataUrl) {
        throw new Error('Selected image could not be rotated.')
      }
      return getEditorStateSnapshot()
    },
    removeSelectedImage() {
      const selectedPlacementId = state.selectedPlacementId
      if (!selectedPlacementId) {
        throw new Error('No image overlay is selected.')
      }
      removeSelectedPlacement()
      if (state.placementsById.has(selectedPlacementId)) {
        throw new Error('Selected image could not be removed.')
      }
      return getEditorStateSnapshot()
    },
    removeImageOverlayById(placementId) {
      removePlacementById(placementId)
      return getEditorStateSnapshot()
    },
    async exportEditedPdf(payload) {
      const exportedPdf = await createEditedPdfExport()
      const shouldDownload = Boolean(payload?.download)
      if (shouldDownload) {
        downloadBytes(exportedPdf.bytes, exportedPdf.fileName)
      }
      const pdfDataUrl = await bytesToDataUrl(exportedPdf.bytes, 'application/pdf')
      return {
        fileName: exportedPdf.fileName,
        byteLength: exportedPdf.bytes.length,
        pdfDataUrl,
        editorState: getEditorStateSnapshot()
      }
    }
  }
}

/**
 * Initializes WebMCP if supported in the active browser.
 * @returns {void}
 */
function initWebMcp() {
  webMcpIntegration = new WebMcpIntegration({
    operations: createWebMcpOperations()
  })
  const isEnabled = webMcpIntegration.initialize()
  if (!isEnabled) {
    webMcpIntegration = null
  }
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
  initWebMcp()
}

await initApp()
