# Extension.js: dynamic `import()` in a content script fails in production builds

> **Fixed in Extension.js 4.1.9.** Upgrade and the repro passes — see [Status](#status).
> Everything below describes the bug as it behaved on 4.1.5.

Loading a module with `import()` inside a content script works under `extension dev`,
but fails under `extension build`.

Reported upstream as
[extension-js/extension.js#507](https://github.com/extension-js/extension.js/issues/507).

## Status

| Extension.js | `pnpm dev` | `pnpm build` |
| ------------ | ---------- | ------------ |
| 4.1.5        | ✓          | ✗ `ChunkLoadError` |
| 4.1.9        | ✓          | ✓            |

4.1.9 emits two changes that fix it, both visible in `dist/chrome`:

1. `content-0.js` overrides `__webpack_require__.l` with a native `import()`, falling back
   to the old `<script>` injection only on failure — the same strategy the workaround below
   used, now built in.
2. `manifest.json` gains `web_accessible_resources: ["*.js", "content_scripts/*.js"]`, so
   the isolated world can actually fetch the chunk. `publicPath` is now resolved at runtime
   via `chrome.runtime.getURL('/')`.

The Firefox production build carries the same two changes.

One unrelated console error remains in production builds: the content-script runtime
unconditionally fetches a sibling `.css` file, which this project does not have and which is
not listed in `web_accessible_resources`, so Chrome logs
`Denying load of chrome-extension://<id>/content_scripts/content-0.css`. Harmless.

## Environment

- Extension.js 4.1.5 (bug), 4.1.9 (fixed)
- macOS 26.5.2
- Chrome 152.0.7977.65
- Firefox Nightly 156.0a1

## Steps to reproduce (on 4.1.5)

1. `pnpm install && pnpm build` (emits `dist/chrome`).
2. Open `chrome://extensions`, enable developer mode, and load `dist/chrome` as an
   unpacked extension.
3. Open any page, then look at the console and the page:

   |         | expected                            | actual (production build)                  |
   | ------- | ----------------------------------- | ------------------------------------------ |
   | console | `[repro] chunk loaded and executed` | `ChunkLoadError: Loading chunk 11 failed.` |
   | page    | green `chunk loaded ✓` banner       | nothing                                    |

4. Compare with dev mode: run `pnpm dev` and open any page — **the exact same dynamic
   import works**, the console prints `[repro] chunk loaded and executed` and the green
   banner is there.
5. Same story in Firefox: after `pnpm build:firefox`, load `dist/firefox` in Firefox
   Nightly and the error is identical to Chrome's; `pnpm dev:firefox` works fine.

Note that Chrome 137+ ignores the `--load-extension` command-line flag. To load the build
into a scripted Chrome, pass `--enable-unsafe-extension-debugging` and call the CDP
`Extensions.loadUnpacked` command.

## Workaround (no longer needed on 4.1.9)

See [PR #1](https://github.com/lmk123/extensionjs-content-script-chunk-repro/pull/1).
It swaps `__webpack_require__.l` for a native dynamic import so the chunk is evaluated
as an ES module inside the isolated world — the same strategy `extension dev` already
uses.

Both the bug and the fix were verified on production builds in both engines:

| build                                | Chrome             | Firefox Nightly    |
| ------------------------------------ | ------------------ | ------------------ |
| `main` (4.1.5)                       | ✗ `ChunkLoadError` | ✗ `ChunkLoadError` |
| `workaround/native-esm-chunk-loader` | ✓                  | ✓                  |
| `main` (4.1.9)                       | ✓                  | ✓                  |

## Why not the documented lazy-import pattern

The documented approach —
[Lazy import in content scripts](https://extension.js.org/docs/implementation-guide/lazy-loading#pattern-3-lazy-import-in-content-scripts)
— has two problems:

1. **The execution context does not match.** A script loaded that way is injected into
   the host page as a `<script>` and runs in the **main world**, while the content script
   lives in the **isolated world**; neither side can reach the other.
2. **Chunks are not shared.** Every `scripts/` entry is bundled independently, so a
   shared dependency is duplicated into each one — two React instances at runtime, for
   example.
