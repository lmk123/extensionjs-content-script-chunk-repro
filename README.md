# Extension.js: a content script requests a sibling `.css` that does not exist

My project has no stylesheet at all and the build output contains no `.css` either, yet as
soon as the extension runs on a page, the console reports a failed load of
`content_scripts/content-0.css`.

## Environment

- Extension.js 4.1.9
- macOS 26.5.2
- Chrome 152.0.7977.65

## Steps to reproduce

1. `pnpm install && pnpm build`
2. Open `chrome://extensions`, enable developer mode, and load `dist/chrome`.
3. Open any page and look at the console:

   ```
   [repro] content script ready — this project has no CSS at all
   Denying load of chrome-extension://<id>/content_scripts/content-0.css
   ```

   The first line is this repo's own content script; the second one is not from any code I wrote.

I also tried adding a `.css` file and importing it from the content script — the error is still there.
