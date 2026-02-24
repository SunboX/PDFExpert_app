/**
 * @typedef {{
 *   getEditorState: () => object,
 *   setLocale: (locale: string) => object,
 *   loadPdfFromDataUrl: (payload: {pdfDataUrl: string, fileName?: string}) => Promise<object>,
 *   appendPdfDocuments: (payload: {documents: Array<{pdfDataUrl: string, fileName?: string}>}) => Promise<object>,
 *   selectActivePage: (pageNumber: number) => object,
 *   moveActivePage: (direction: 'up' | 'down') => Promise<object>,
 *   addBlankPageAfterActive: () => Promise<object>,
 *   deleteActivePage: () => Promise<object>,
 *   addImageOverlays: (payload: {images: Array<{imageDataUrl: string, fileName?: string}>, pageNumber?: number}) => Promise<object>,
 *   selectImageOverlay: (placementId: string) => object,
 *   updateImageOverlay: (payload: {placementId: string, pageNumber?: number, x?: number, y?: number, width?: number, height?: number}) => object,
 *   rotateSelectedImage: (direction: 'left' | 'right') => Promise<object>,
 *   removeSelectedImage: () => object,
 *   removeImageOverlayById: (placementId: string) => object,
 *   exportEditedPdf: (payload: {download?: boolean}) => Promise<object>
 * }} WebMcpOperations
 */

/**
 * WebMCP integration that registers imperative tool definitions for the PDF editor.
 */
export class WebMcpIntegration {
  /** @type {WebMcpOperations} */
  #operations

  /** @type {any | null} */
  #modelContext

  /** @type {boolean} */
  #isEnabled

  /** @type {boolean} */
  #isRefreshQueued

  /**
   * @param {{operations: WebMcpOperations}} options
   */
  constructor(options) {
    const operations = options?.operations
    this.#assertRequiredOperations(operations)
    this.#operations = operations
    this.#modelContext = null
    this.#isEnabled = false
    this.#isRefreshQueued = false
  }

  /**
   * Indicates if WebMCP registration is active.
   * @returns {boolean}
   */
  get isEnabled() {
    return this.#isEnabled
  }

  /**
   * Initializes tool registration when the browser exposes navigator.modelContext.
   * @returns {boolean}
   */
  initialize() {
    const modelContext = this.#resolveModelContext()
    if (!modelContext) {
      return false
    }
    this.#modelContext = modelContext
    this.#isEnabled = true
    this.#provideContext()
    return true
  }

  /**
   * Schedules a debounced provideContext update.
   * @returns {void}
   */
  refresh() {
    if (!this.#isEnabled) return
    if (this.#isRefreshQueued) return
    this.#isRefreshQueued = true
    queueMicrotask(() => {
      this.#isRefreshQueued = false
      this.#provideContext()
    })
  }

  /**
   * Verifies all required app operation callbacks exist.
   * @param {any} operations
   * @returns {void}
   */
  #assertRequiredOperations(operations) {
    const requiredOperations = [
      'getEditorState',
      'setLocale',
      'loadPdfFromDataUrl',
      'appendPdfDocuments',
      'selectActivePage',
      'moveActivePage',
      'addBlankPageAfterActive',
      'deleteActivePage',
      'addImageOverlays',
      'selectImageOverlay',
      'updateImageOverlay',
      'rotateSelectedImage',
      'removeSelectedImage',
      'removeImageOverlayById',
      'exportEditedPdf'
    ]

    for (const operationName of requiredOperations) {
      if (typeof operations?.[operationName] !== 'function') {
        throw new Error(`Missing required WebMCP operation "${operationName}".`)
      }
    }
  }

  /**
   * Resolves navigator.modelContext when available.
   * @returns {any | null}
   */
  #resolveModelContext() {
    const modelContext = globalThis.navigator?.modelContext
    if (!modelContext) {
      return null
    }
    if (typeof modelContext.provideContext !== 'function') {
      return null
    }
    return modelContext
  }

  /**
   * Reads the latest editor state defensively.
   * @returns {object}
   */
  #getEditorStateSafe() {
    const editorState = this.#operations.getEditorState()
    return this.#asObject(editorState)
  }

  /**
   * Registers all tool definitions with navigator.modelContext.provideContext.
   * @returns {void}
   */
  #provideContext() {
    if (!this.#modelContext) return
    const editorState = this.#getEditorStateSafe()
    const tools = this.#buildToolDefinitions(editorState)
    const maybePromise = this.#modelContext.provideContext({ tools })
    if (typeof maybePromise?.catch === 'function') {
      maybePromise.catch((error) => {
        console.error('WebMCP provideContext failed:', error)
      })
    }
  }

  /**
   * Builds all WebMCP tool definitions.
   * @param {object} editorState
   * @returns {Array<object>}
   */
  #buildToolDefinitions(editorState) {
    const pageNumberSchema = this.#buildPageNumberSchema(editorState)
    const placementIdSchema = this.#buildPlacementIdSchema(editorState)

    return [
      {
        name: 'get_editor_state',
        description: 'Get the current PDF editor state, including pages, selection, locale, and image overlays.',
        inputSchema: {
          type: 'object',
          properties: {}
        },
        annotations: {
          readOnlyHint: true
        },
        execute: this.#wrapToolExecution('get_editor_state', async () => this.#operations.getEditorState())
      },
      {
        name: 'set_locale',
        description: 'Set the editor language. Use "en" for English or "de" for German.',
        inputSchema: {
          type: 'object',
          properties: {
            locale: {
              type: 'string',
              enum: ['en', 'de'],
              description: 'Language code for the editor UI.'
            }
          },
          required: ['locale']
        },
        execute: this.#wrapToolExecution('set_locale', async (input) => {
          const args = this.#asObject(input)
          const locale = this.#readRequiredString(args, 'locale')
          return this.#operations.setLocale(locale)
        })
      },
      {
        name: 'load_pdf_document',
        description: 'Load a new base PDF document from a data URL and replace the current document.',
        inputSchema: {
          type: 'object',
          properties: {
            pdfDataUrl: {
              type: 'string',
              description: 'PDF as a data URL string.'
            },
            fileName: {
              type: 'string',
              description: 'Optional file name shown in editor metadata.'
            }
          },
          required: ['pdfDataUrl']
        },
        execute: this.#wrapToolExecution('load_pdf_document', async (input) => {
          const args = this.#asObject(input)
          return this.#operations.loadPdfFromDataUrl({
            pdfDataUrl: this.#readRequiredString(args, 'pdfDataUrl'),
            fileName: this.#readOptionalString(args, 'fileName')
          })
        })
      },
      {
        name: 'append_pdf_documents',
        description: 'Append pages from one or more additional PDF documents to the current document.',
        inputSchema: {
          type: 'object',
          properties: {
            documents: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                properties: {
                  pdfDataUrl: {
                    type: 'string',
                    description: 'PDF as a data URL string.'
                  },
                  fileName: {
                    type: 'string',
                    description: 'Optional source file name.'
                  }
                },
                required: ['pdfDataUrl']
              }
            }
          },
          required: ['documents']
        },
        execute: this.#wrapToolExecution('append_pdf_documents', async (input) => {
          const args = this.#asObject(input)
          const documents = this.#readRequiredArray(args, 'documents').map((documentEntry) => {
            const entry = this.#asObject(documentEntry)
            return {
              pdfDataUrl: this.#readRequiredString(entry, 'pdfDataUrl'),
              fileName: this.#readOptionalString(entry, 'fileName')
            }
          })
          return this.#operations.appendPdfDocuments({ documents })
        })
      },
      {
        name: 'select_active_page',
        description: 'Select the active page for page operations and new image placement.',
        inputSchema: {
          type: 'object',
          properties: {
            pageNumber: pageNumberSchema
          },
          required: ['pageNumber']
        },
        execute: this.#wrapToolExecution('select_active_page', async (input) => {
          const args = this.#asObject(input)
          const pageNumber = this.#readRequiredNumber(args, 'pageNumber')
          return this.#operations.selectActivePage(pageNumber)
        })
      },
      {
        name: 'move_active_page',
        description: 'Move the current active page one position up or down in the document.',
        inputSchema: {
          type: 'object',
          properties: {
            direction: {
              type: 'string',
              enum: ['up', 'down'],
              description: 'Use "up" to move earlier, or "down" to move later.'
            }
          },
          required: ['direction']
        },
        execute: this.#wrapToolExecution('move_active_page', async (input) => {
          const args = this.#asObject(input)
          const direction = this.#readRequiredString(args, 'direction')
          return this.#operations.moveActivePage(direction)
        })
      },
      {
        name: 'add_blank_page_after_active',
        description: 'Insert a blank page directly after the active page.',
        inputSchema: {
          type: 'object',
          properties: {}
        },
        execute: this.#wrapToolExecution('add_blank_page_after_active', async () => this.#operations.addBlankPageAfterActive())
      },
      {
        name: 'delete_active_page',
        description: 'Delete the active page. This requires at least two pages in the document.',
        inputSchema: {
          type: 'object',
          properties: {}
        },
        execute: this.#wrapToolExecution('delete_active_page', async () => this.#operations.deleteActivePage())
      },
      {
        name: 'add_image_overlays',
        description: 'Add one or more image overlays. Optionally choose the page before inserting.',
        inputSchema: {
          type: 'object',
          properties: {
            pageNumber: pageNumberSchema,
            images: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                properties: {
                  imageDataUrl: {
                    type: 'string',
                    description: 'Image as a data URL string.'
                  },
                  fileName: {
                    type: 'string',
                    description: 'Optional image file name.'
                  }
                },
                required: ['imageDataUrl']
              }
            }
          },
          required: ['images']
        },
        execute: this.#wrapToolExecution('add_image_overlays', async (input) => {
          const args = this.#asObject(input)
          const images = this.#readRequiredArray(args, 'images').map((imageEntry) => {
            const entry = this.#asObject(imageEntry)
            return {
              imageDataUrl: this.#readRequiredString(entry, 'imageDataUrl'),
              fileName: this.#readOptionalString(entry, 'fileName')
            }
          })
          const pageNumber = this.#readOptionalNumber(args, 'pageNumber')
          return this.#operations.addImageOverlays({
            pageNumber,
            images
          })
        })
      },
      {
        name: 'select_image_overlay',
        description: 'Select an image overlay by placement id.',
        inputSchema: {
          type: 'object',
          properties: {
            placementId: placementIdSchema
          },
          required: ['placementId']
        },
        execute: this.#wrapToolExecution('select_image_overlay', async (input) => {
          const args = this.#asObject(input)
          const placementId = this.#readRequiredString(args, 'placementId')
          return this.#operations.selectImageOverlay(placementId)
        })
      },
      {
        name: 'update_image_overlay',
        description: 'Update image overlay geometry or move it to another page.',
        inputSchema: {
          type: 'object',
          properties: {
            placementId: placementIdSchema,
            pageNumber: pageNumberSchema,
            x: {
              type: 'number',
              description: 'Horizontal position in rendered page pixels.'
            },
            y: {
              type: 'number',
              description: 'Vertical position in rendered page pixels.'
            },
            width: {
              type: 'number',
              minimum: 30,
              description: 'Overlay width in rendered page pixels.'
            },
            height: {
              type: 'number',
              minimum: 30,
              description: 'Overlay height in rendered page pixels.'
            }
          },
          required: ['placementId']
        },
        execute: this.#wrapToolExecution('update_image_overlay', async (input) => {
          const args = this.#asObject(input)
          return this.#operations.updateImageOverlay({
            placementId: this.#readRequiredString(args, 'placementId'),
            pageNumber: this.#readOptionalNumber(args, 'pageNumber'),
            x: this.#readOptionalNumber(args, 'x'),
            y: this.#readOptionalNumber(args, 'y'),
            width: this.#readOptionalNumber(args, 'width'),
            height: this.#readOptionalNumber(args, 'height')
          })
        })
      },
      {
        name: 'rotate_selected_image',
        description: 'Rotate the currently selected image overlay left or right by 90 degrees.',
        inputSchema: {
          type: 'object',
          properties: {
            direction: {
              type: 'string',
              enum: ['left', 'right'],
              description: 'Rotation direction in quarter turns.'
            }
          },
          required: ['direction']
        },
        execute: this.#wrapToolExecution('rotate_selected_image', async (input) => {
          const args = this.#asObject(input)
          const direction = this.#readRequiredString(args, 'direction')
          return this.#operations.rotateSelectedImage(direction)
        })
      },
      {
        name: 'remove_selected_image',
        description: 'Remove the currently selected image overlay.',
        inputSchema: {
          type: 'object',
          properties: {}
        },
        execute: this.#wrapToolExecution('remove_selected_image', async () => this.#operations.removeSelectedImage())
      },
      {
        name: 'remove_image_overlay_by_id',
        description: 'Remove a specific image overlay by placement id.',
        inputSchema: {
          type: 'object',
          properties: {
            placementId: placementIdSchema
          },
          required: ['placementId']
        },
        execute: this.#wrapToolExecution('remove_image_overlay_by_id', async (input) => {
          const args = this.#asObject(input)
          const placementId = this.#readRequiredString(args, 'placementId')
          return this.#operations.removeImageOverlayById(placementId)
        })
      },
      {
        name: 'export_edited_pdf',
        description: 'Export the edited PDF. Returns a PDF data URL and optionally triggers a browser download.',
        inputSchema: {
          type: 'object',
          properties: {
            download: {
              type: 'boolean',
              description: 'Set true to also trigger a browser download.'
            }
          }
        },
        execute: this.#wrapToolExecution('export_edited_pdf', async (input) => {
          const args = this.#asObject(input)
          return this.#operations.exportEditedPdf({
            download: Boolean(args.download)
          })
        })
      }
    ]
  }

  /**
   * Creates dynamic page-number schema details from current state.
   * @param {object} editorState
   * @returns {object}
   */
  #buildPageNumberSchema(editorState) {
    const pageCount = Number(editorState?.pageCount || 0)
    const schema = {
      type: 'number',
      minimum: 1,
      description: 'Target page number in the current document.'
    }
    if (pageCount > 0) {
      schema.maximum = pageCount
    }
    return schema
  }

  /**
   * Creates dynamic placement-id schema details from current state.
   * @param {object} editorState
   * @returns {object}
   */
  #buildPlacementIdSchema(editorState) {
    const placements = Array.isArray(editorState?.placements) ? editorState.placements : []
    const placementIds = placements
      .map((placement) => String(placement?.id || '').trim())
      .filter(Boolean)

    const schema = {
      type: 'string',
      description: 'Placement id of an existing image overlay.'
    }

    if (placementIds.length > 0) {
      schema.enum = placementIds
    }

    return schema
  }

  /**
   * Wraps tool execution with consistent success/error output handling.
   * @param {string} toolName
   * @param {(input: any) => Promise<any>} executor
   * @returns {(input: any) => Promise<object>}
   */
  #wrapToolExecution(toolName, executor) {
    return async (input) => {
      try {
        const payload = await executor(input)
        return this.#createSuccessResponse(toolName, payload)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`[${toolName}] ${message}`)
      }
    }
  }

  /**
   * Creates a standardized success payload for model responses.
   * @param {string} toolName
   * @param {any} payload
   * @returns {object}
   */
  #createSuccessResponse(toolName, payload) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ok: true,
              tool: toolName,
              data: payload
            },
            null,
            2
          )
        }
      ]
    }
  }

  /**
   * Normalizes any input to a plain object.
   * @param {any} input
   * @returns {Record<string, any>}
   */
  #asObject(input) {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      return /** @type {Record<string, any>} */ (input)
    }
    return {}
  }

  /**
   * Reads a required string field.
   * @param {Record<string, any>} input
   * @param {string} key
   * @returns {string}
   */
  #readRequiredString(input, key) {
    const value = input[key]
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`"${key}" must be a non-empty string.`)
    }
    return value
  }

  /**
   * Reads an optional string field.
   * @param {Record<string, any>} input
   * @param {string} key
   * @returns {string | undefined}
   */
  #readOptionalString(input, key) {
    const value = input[key]
    if (value === undefined || value === null || value === '') {
      return undefined
    }
    if (typeof value !== 'string') {
      throw new Error(`"${key}" must be a string when provided.`)
    }
    return value
  }

  /**
   * Reads a required finite numeric field.
   * @param {Record<string, any>} input
   * @param {string} key
   * @returns {number}
   */
  #readRequiredNumber(input, key) {
    const value = Number(input[key])
    if (!Number.isFinite(value)) {
      throw new Error(`"${key}" must be a valid number.`)
    }
    return value
  }

  /**
   * Reads an optional finite numeric field.
   * @param {Record<string, any>} input
   * @param {string} key
   * @returns {number | undefined}
   */
  #readOptionalNumber(input, key) {
    if (input[key] === undefined || input[key] === null || input[key] === '') {
      return undefined
    }
    const value = Number(input[key])
    if (!Number.isFinite(value)) {
      throw new Error(`"${key}" must be a valid number when provided.`)
    }
    return value
  }

  /**
   * Reads a required array field.
   * @param {Record<string, any>} input
   * @param {string} key
   * @returns {Array<any>}
   */
  #readRequiredArray(input, key) {
    const value = input[key]
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error(`"${key}" must be a non-empty array.`)
    }
    return value
  }
}
