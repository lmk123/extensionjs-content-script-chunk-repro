# Extension.js: dynamic `import()` in a content script fails in production builds

Loading a module with `import()` inside a content script works under `extension dev`,
but fails under `extension build`.

## Environment

- Extension.js 4.1.5
- macOS 26.5.2
- Chrome 152.0.7977.65
- Firefox Nightly 156.0a1

## Steps to reproduce

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

## Workaround

See [PR #1](https://github.com/lmk123/extensionjs-content-script-chunk-repro/pull/1).
It swaps `__webpack_require__.l` for a native dynamic import so the chunk is evaluated
as an ES module inside the isolated world — the same strategy `extension dev` already
uses.

Both the bug and the fix were verified on production builds in both engines:

| build                                | Chrome             | Firefox Nightly    |
| ------------------------------------ | ------------------ | ------------------ |
| `main`                               | ✗ `ChunkLoadError` | ✗ `ChunkLoadError` |
| `workaround/native-esm-chunk-loader` | ✓                  | ✓                  |

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
