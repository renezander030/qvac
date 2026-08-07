import fetchImpl from '#fetch'
import type { FetchFn } from './fetch.js'

// Resolves the runtime fetch. `#fetch` maps to bare-fetch on Bare and to the
// fetch shim elsewhere; both defer a missing-fetch error to first use.
function resolveFetch(): FetchFn {
  return fetchImpl
}

export default resolveFetch
