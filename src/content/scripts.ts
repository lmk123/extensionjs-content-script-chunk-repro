// Content script entry. Extension.js calls this default export on injection
// and calls the returned function on unload / HMR.
//
// Note what is NOT here: no stylesheet is imported, and the project ships no
// CSS at all. The production bundle still fetches a sibling `content-0.css`.
export default function initial() {
  console.log('[repro] content script ready — this project has no CSS at all')
}
