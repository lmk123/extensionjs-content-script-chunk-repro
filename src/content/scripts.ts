// Content script entry. Extension.js calls this default export on injection
// and calls the returned function on unload / HMR.
export default function initial() {
  console.log('[repro] content script ready — importing chunk')

  void import('./heavy')
    .then((module) => module.mount())
    .catch((error) => {
      console.error('[repro] dynamic import() failed:', error)
    })
}
