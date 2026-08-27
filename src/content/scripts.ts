// Content script entry. Extension.js calls this default export on injection
// and calls the returned function on unload / HMR.
export default function initial() {
  const onClick = () => {
    void import('./heavy')
      .then((module) => module.mount())
      .catch((error) => {
        console.error('[repro] dynamic import() failed:', error)
      })
  }

  document.addEventListener('click', onClick)
  console.log('[repro] content script ready — click anywhere on the page')

  return () => document.removeEventListener('click', onClick)
}
