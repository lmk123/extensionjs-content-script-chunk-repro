# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A **minimal bug reproduction**, not a product. It demonstrated that a dynamic `import()`
inside an Extension.js content script worked under `extension dev` but always failed under
`extension build`. **Extension.js fixed this in 4.1.9**, which is the version pinned here;
the repro now passes in both modes. Read `README.md` first — it holds the full root-cause
analysis and the before/after status.

Because it is a repro, keep it minimal. Do not add features, dependencies, abstractions,
or files that are not needed to show the bug or its fix. `src/content/heavy.ts` is a
deliberate stand-in for a real payload; it should stay trivial.

## Commands

```bash
pnpm install
pnpm build   # extension build --browser chrome  -> dist/chrome
pnpm dev     # extension dev   --browser chrome
```

There are no tests, no linter, and no typecheck script. Verification is manual: load
`dist/chrome` as an unpacked extension, open any page, and read the console.
`[repro] chunk loaded and executed` + a green banner = working; `ChunkLoadError` = the bug
is back. A `Denying load of .../content-0.css` error is unrelated noise from Extension.js's
runtime and is expected.

**Both modes must be checked** whenever the Extension.js version changes — the original bug
was precisely a divergence between `build` and `dev`.

Chrome 137+ ignores the `--load-extension` command-line flag, so a scripted check needs
`--enable-unsafe-extension-debugging` plus the CDP `Extensions.loadUnpacked` command. Under
`extension dev`, `extension dev --allow-control` + `extension inspect --with-console` reads
the page and its console directly.

## Layout

- `src/manifest.json` — MV3 manifest; Extension.js consumes `.ts` paths here directly
  (`content_scripts[].js` points at `content/scripts.ts`) and rewrites them at build time.
- `src/content/scripts.ts` — the content script entry. Extension.js **calls its default
  export** on injection and calls the returned function on unload/HMR; this is an
  Extension.js convention, not a webpack one.
- `src/content/heavy.ts` — the lazily imported chunk.

`dist/` and `.extension-js/` are generated and gitignored; never edit them by hand.

## The original bug (4.1.5) and its fix (4.1.9)

On 4.1.5 production builds left rspack's default chunk loader in place, which injects a
`<script>` into the host page. That runs in the **main world**, so the chunk's
`self.rspackChunk_<name>.push(...)` never reached the content script's **isolated world**,
and webpack rejected. `extension dev` avoided this only because `WebExtensionPlugin` (which
owns `__webpack_require__.l`) is installed via `ReloadPlugin`, which returned early when
`mode === 'production'`.

4.1.9 emits the fix in the production bundle itself: `__webpack_require__.l` is overridden
with a native `import()` (falling back to `<script>` injection only on failure), the
manifest gains `web_accessible_resources: ["*.js", "content_scripts/*.js"]`, and
`publicPath` is resolved at runtime via `chrome.runtime.getURL('/')`.

## Branches

`main` tracks the current Extension.js release and now passes. The old workaround —
swapping `__webpack_require__.l` for a native dynamic import
(`src/content/installChunkLoader.ts`) — lives on
`origin/workaround/native-esm-chunk-loader`; it is obsolete on 4.1.9 and stays unmerged as
a record of the fix. To reproduce the original failure, pin `extension` to 4.1.5. Add
experiments as separate branches.
