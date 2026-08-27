# Extension.js: dynamic `import()` in a content script fails in production builds

English | [简体中文](README.zh-CN.md)

Minimal reproduction for **Extension.js 4.1.5**.

A content script that lazy-loads a module with dynamic `import()` works under
`extension dev` and **always fails** under `extension build` — with no build-time
error or warning.

The three source files are `src/manifest.json`, `src/content/scripts.ts` (the entry,
which dynamic-imports on injection) and `src/content/heavy.ts` (the lazily loaded module).

## Reproduce

```bash
pnpm install && pnpm build
```

Load `dist/chrome` as an unpacked extension and open any page.

|         | expected                            | actual (production build)                  |
| ------- | ----------------------------------- | ------------------------------------------ |
| console | `[repro] chunk loaded and executed` | `ChunkLoadError: Loading chunk 11 failed.` |
| page    | green `chunk loaded ✓` banner       | nothing                                    |

`pnpm dev` produces a build where the same import works — which is what makes this
easy to miss.

The `pnpm` scripts are pinned to Chrome, but nothing here is Chrome-specific:
`extension build --browser firefox` emits the same default loader, and the same import
fails the same way in `dist/firefox`.

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

## Why not the documented lazy-import pattern

[Lazy loading](https://extension.js.org/docs/implementation-guide/lazy-loading), Pattern 3
("lazy import in content scripts"), documents this:

```ts
async function loadAnalyzer() {
  const src = chrome.runtime.getURL('content_scripts/analyzer.js')
  return import(src)
}
```

Two things about it do not cover the case above.

**Its stated failure mode is a different one.** The page explains the `runtime.getURL`
step as being about reachability — without `web_accessible_resources` "the import fails
with a network error because the host page cannot fetch extension files that are not
explicitly exposed." Here the chunk *is* in `web_accessible_resources` and *is* fetched
successfully; it just gets evaluated in the main world instead of the isolated one. An
absolute URL does not change that: the loader that appends the `<script>` is the same
either way.

**It presupposes a `content_scripts/analyzer.js` that something emits.** The page does
not say where that file comes from, and an ordinary webpack async chunk is not it — its
name is generated, and it is exactly the artifact that fails to load. The documented way
to emit a standalone script at a known path is the
[`scripts/` special folder](https://extension.js.org/docs/features/special-folders), so
that is what we evaluated. On 4.1.5, production builds:

- **A `scripts/` entry emits an IIFE with no ESM exports.** A three-line
  `scripts/probe.ts` exporting `probe()` builds to a bundle ending in `(()=>{…})();` —
  no `export`, and the function body is tree-shaken away entirely. So
  `import(runtime.getURL('scripts/probe.js'))` yields an empty module namespace; all you
  get is the side effect of having run it. That is consistent with how the folder is
  documented — "executable scripts that you load dynamically", following the content
  script `export default` initialization pattern — but it cannot express "import a module
  and call its export", e.g. `mountUI(shadowRoot) → handle`. It degrades into handing
  values between the two halves through a global.
- **Every `scripts/` entry carries the mount runtime.** The docs are explicit that
  Extension.js "wraps every file inside `scripts/` with a browser content-script mount
  runtime"; in practice that three-line file weighs 6.95KB, and the wrapper calls
  `cleanupKnownRoots()` / `cleanupOrphanRoots()`, which remove `[data-extension-root]`
  nodes from the page.
- **Separate `scripts/` entries do not share chunks.** Putting a second lazy tier in its
  own entry means each entry bundles its own copy of a shared dependency — two React
  instances at runtime, across which `React.lazy`, hooks and context break.
- **It only pushes the bug one level in.** Async chunks *inside* a `scripts/` entry are
  still ordinary webpack chunks and still hit the same loader.

So the documented pattern is not an alternative spelling of the code in this repro. It
covers "inject and run a standalone script", which is a different thing from "lazy-load
part of my module graph" — and the latter is what breaks.

## Workaround

See the open PR in this repo. It swaps `__webpack_require__.l` for a native dynamic
import so the chunk is evaluated as an ES module inside the isolated world — the same
strategy `extension dev` already uses.

Both the bug and the fix were checked on both engines, production builds:

| build                                | Chrome             | Firefox Nightly 156.0a1 |
| ------------------------------------ | ------------------ | ----------------------- |
| `main`                               | ✗ `ChunkLoadError` | ✗ `ChunkLoadError`      |
| `workaround/native-esm-chunk-loader` | ✓                  | ✓                       |

Firefox's error is the same one, down to the wording:

```
ChunkLoadError: Loading chunk 11 failed.
(missing: moz-extension://<uuid>/11.js)
```

Native dynamic `import()` is safe to rely on here. Firefox has supported it in content
scripts since [Firefox 89](https://bugzilla.mozilla.org/show_bug.cgi?id=1536094), and
it is what `webpack-target-webextension` — the plugin Extension.js bundles — documents
as its *default* content-script chunk loader. Under MV3 Firefox additionally requires
the chunk to be listed in `web_accessible_resources`
([bug 1803950](https://bugzilla.mozilla.org/show_bug.cgi?id=1803950)); this manifest
already lists it, and the default loader needs it just as much. The host page's CSP is
not involved — the workaround also succeeds on a page served with
`default-src 'none'; script-src 'self'`.
