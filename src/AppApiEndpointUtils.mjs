/**
 * Resolves backend endpoint paths for localhost and live hosting.
 */
export class AppApiEndpointUtils {
  /**
   * Returns true when the provided host is a localhost variant.
   * @param {string} [host]
   * @returns {boolean}
   */
  static isLocalHost(host = AppApiEndpointUtils.#resolveCurrentHost()) {
    const normalizedHost = String(host || '')
      .trim()
      .toLowerCase()
    return (
      normalizedHost === 'localhost' ||
      normalizedHost === '127.0.0.1' ||
      normalizedHost === '::1' ||
      normalizedHost.endsWith('.localhost')
    )
  }

  /**
   * Resolves the app metadata endpoint path for the current host.
   * @param {string} [host]
   * @returns {string}
   */
  static resolveAppMetaEndpoint(host = AppApiEndpointUtils.#resolveCurrentHost()) {
    return AppApiEndpointUtils.isLocalHost(host) ? '/api/app-meta' : '/api/app-meta.php'
  }

  /**
   * Resolves the current hostname in browser contexts.
   * @returns {string}
   */
  static #resolveCurrentHost() {
    if (typeof window === 'undefined' || !window?.location) return ''
    return String(window.location.hostname || '')
  }
}
