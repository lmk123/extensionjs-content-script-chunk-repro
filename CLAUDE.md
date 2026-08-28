# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A **minimal bug reproduction**, not a product. It shows that Extension.js's content-script
runtime unconditionally fetches a sibling `<entry>.css` — here
`content_scripts/content-0.css` — even though this project contains no CSS and the build
emits no `.css` file. Read `README.md` first; it holds the root-cause snippet and the
verified before/after behaviour.

Because it is a repro, keep it minimal. Do not add features, dependencies, abstractions, or
files that are not needed to show the bug. In particular **do not add a stylesheet** — the
absence of CSS is the point, and importing one does not silence the request anyway (Extension.js
inlines CSS as a `data:` module and still fetches the missing sibling).

Careful with comments in `src/`: Extension.js scans source text for CSS-ish string literals,
so writing something like an example `import './x.css'` inside a comment makes the build emit
a spurious "CSS asset not found on disk" warning.

## Commands

```bash
pnpm install
pnpm build   # extension build --browser chrome  -> dist/chrome
pnpm dev     # extension dev   --browser chrome
```

There are no tests, no linter, and no typecheck script. Verification is manual: load
`dist/chrome` as an unpacked extension, open any page, and read the console. A
`Denying load of chrome-extension://<id>/content_scripts/content-0.css` error means the bug
is still present; a clean console (apart from this repo's own `[repro] …` log) means it is
fixed.

**Both modes must be checked** whenever the Extension.js version changes. They fail
differently: `dev` reaches the file and gets `ERR_FILE_NOT_FOUND`, `build` is blocked before
that because the production manifest declares no `web_accessible_resources`.

Chrome 137+ ignores the `--load-extension` command-line flag, so a scripted check needs
`--enable-unsafe-extension-debugging` plus the CDP `Extensions.loadUnpacked` command. CDP
reports the blocked production request as `chrome-extension://invalid/` — to see the real
path, add `content_scripts/*.css` to `web_accessible_resources` in the *built* manifest and
re-run. `extension dev` launches its own Chrome on `--remote-debugging-port=9222`, so a dev-mode
check can just attach to that.

## Layout

- `src/manifest.json` — MV3 manifest; Extension.js consumes `.ts` paths here directly
  (`content_scripts[].js` points at `content/scripts.ts`) and rewrites them at build time.
- `src/content/scripts.ts` — the content script entry, and the only source file. Extension.js
  **calls its default export** on injection and calls the returned function on unload/HMR;
  this is an Extension.js convention, not a webpack one.

`dist/` and `.extension-js/` are generated and gitignored; never edit them by hand. Note that
`extension dev` writes into `dist/chrome` too, overwriting the production build.

## History

This repo previously reproduced a different bug — a dynamic `import()` in a content script
failing under `extension build`
([extension-js/extension.js#507](https://github.com/extension-js/extension.js/issues/507),
fixed in 4.1.9). That repro and its workaround branch are still in the git history: see the
tag `repro/chunk-load-error` and the branch `origin/workaround/native-esm-chunk-loader`. The
`.css` request documented here was the leftover "unrelated noise" noted in that repro's README.
