# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A **minimal bug reproduction**, not a product. It demonstrates that a dynamic `import()`
inside an Extension.js content script works under `extension dev` but always fails under
`extension build` (Extension.js 4.1.5). Read `README.md` first — it holds the full
root-cause analysis.

Because it is a repro, keep it minimal. Do not add features, dependencies, abstractions,
or files that are not needed to show the bug or its fix. `src/content/heavy.ts` is a
deliberate stand-in for a real payload; it should stay trivial.

## Commands

```bash
pnpm install
pnpm build   # extension build --browser chrome  -> dist/chrome  (bug reproduces here)
pnpm dev     # extension dev   --browser chrome  (bug does NOT reproduce here)
```

There are no tests, no linter, and no typecheck script. Verification is manual: load
`dist/chrome` as an unpacked extension, open any page, click, and read the console.
`[repro] chunk loaded and executed` + a green banner = working; `ChunkLoadError` = the bug.

**Both modes must be checked.** A change that fixes `build` but breaks `dev` (or vice
versa) is not a fix — the whole point is the divergence between them.

## Layout and the bug

- `src/manifest.json` — MV3 manifest; Extension.js consumes `.ts` paths here directly
  (`content_scripts[].js` points at `content/scripts.ts`) and rewrites them at build time.
- `src/content/scripts.ts` — the content script entry. Extension.js **calls its default
  export** on injection and calls the returned function on unload/HMR; this is an
  Extension.js convention, not a webpack one.
- `src/content/heavy.ts` — the lazily imported chunk.

The failure: production builds leave rspack's default chunk loader in place, which injects
a `<script>` into the host page. That runs in the **main world**, so the chunk's
`self.rspackChunk_<name>.push(...)` never reaches the content script's **isolated world**,
and webpack rejects. `extension dev` avoids this only because `WebExtensionPlugin` (which
owns `__webpack_require__.l`) is installed via `ReloadPlugin`, which returns early when
`mode === 'production'`.

`dist/` and `.extension-js/` are generated and gitignored; never edit them by hand.

## Branches

`main` is the clean reproduction. The workaround — swapping `__webpack_require__.l` for a
native dynamic import (`src/content/installChunkLoader.ts`) — lives on
`origin/workaround/native-esm-chunk-loader` and is intentionally **not** merged: `main`
must keep failing. Add fix experiments as separate branches.
