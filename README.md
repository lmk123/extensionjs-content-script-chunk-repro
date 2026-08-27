# Extension.js: dynamic `import()` in a content script fails in production builds

Minimal reproduction for **Extension.js 4.1.5**.

A content script that lazy-loads a module with dynamic `import()` works under
`extension dev` and **always fails** under `extension build` — with no build-time
error or warning.

The three source files are `src/manifest.json`, `src/content/scripts.ts` (the entry,
which dynamic-imports on click) and `src/content/heavy.ts` (the lazily loaded module).

## Reproduce

```bash
pnpm install && pnpm build
```

Load `dist/chrome` as an unpacked extension, open any page, click anywhere.

|         | expected                            | actual (production build)                  |
| ------- | ----------------------------------- | ------------------------------------------ |
| console | `[repro] chunk loaded and executed` | `ChunkLoadError: Loading chunk 11 failed.` |
| page    | green `chunk loaded ✓` banner       | nothing                                    |

`pnpm dev` produces a build where the same click works — which is what makes this
easy to miss.

## Why

`extension build` leaves the content script with rspack's default chunk loader,
which appends `<script src="chrome-extension://…">` to the host page. That script
runs in the **main world**, so the chunk's `self.rspackChunk_<name>.push(...)` never
reaches the isolated world the content script lives in. `script.onload` fires,
webpack sees the chunk was never installed, and rejects.

The webextension-aware loader that `extension dev` installs comes from
`WebExtensionPlugin` (the bundled `webpack-target-webextension` fork). Its only call
site is `SetupReloadStrategy`, whose only call site is `ReloadPlugin.apply()` — which
returns early when `mode === 'production'`. Nothing else installs it, so production
builds never get it.

That plugin is not HMR-specific: it owns `__webpack_require__.l`, publicPath, and the
service worker's `importScripts` — and it is already constructed with
`hmrConfig: false`.

The chunk is listed in `web_accessible_resources`; that is not the problem.

## Workaround

See the open PR in this repo. It swaps `__webpack_require__.l` for a native dynamic
import so the chunk is evaluated as an ES module inside the isolated world — the same
strategy `extension dev` already uses.
