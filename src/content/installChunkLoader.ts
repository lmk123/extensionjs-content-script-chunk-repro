// Workaround for the bug this repo reproduces.
//
// `extension build` leaves the content script with rspack's default chunk
// loader, which injects `<script src="chrome-extension://…">` into the host
// page. That script runs in the MAIN world, so the chunk's
// `self.rspackChunk_<name>.push(...)` never reaches the isolated world where
// the content script lives, and webpack rejects with a ChunkLoadError.
//
// Swapping `__webpack_require__.l` for a native dynamic import evaluates the
// chunk as an ES module inside the isolated world, so the push lands on the
// right global. This is the same strategy Extension.js already installs in
// `extension dev` — it is just missing from production builds.
//
// Must run before any `import()`, hence the first import in the entry.

type ChunkLoader = (
  url: string,
  done: (event?: unknown) => void,
  key?: string,
  chunkId?: string | number
) => void

declare const __webpack_require__: {l?: ChunkLoader}

const fallback = __webpack_require__.l

__webpack_require__.l = (url, done, key, chunkId) => {
  // `webpackIgnore` is required, or rspack compiles this back into a chunk request.
  import(/* webpackIgnore: true */ url).then(
    // Calling `done()` with no argument means "loaded": webpack's callback only
    // rejects when the chunk did not install itself.
    () => done(),
    (error: unknown) => {
      if (fallback) fallback(url, done, key, chunkId)
      else done({type: 'missing', target: {src: url}, error})
    }
  )
}
