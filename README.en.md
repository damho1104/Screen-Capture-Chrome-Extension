# Screen Capture Chrome Extension

[한국어 README 보기](README.md)

A Manifest V3 Chrome extension for capturing the current tab in a workflow similar to NAVER Whale's built-in screen capture tools.

## Features

- **Drag area capture**: select a visible viewport area by dragging.
- **Element capture**: select an HTML element and capture the full element, including portions outside the current viewport.
- **Full-page capture**: scroll and stitch the page into a single image.
- **Current-tab preview**: review the captured image in an overlay before saving or retrying.
- **Clipboard copy**: copy the PNG from the preview overlay.
- **PNG download**: save captures with generated filenames.
- **Restricted page guidance**: show a clear message when Chrome blocks capture/injection on restricted pages.

## Tech Stack

- Vite
- TypeScript
- Chrome Extension Manifest V3
- Offscreen document + `OffscreenCanvas` for image processing
- Vitest + jsdom

## Getting Started

Install dependencies:

```bash
npm install
```

Build the extension:

```bash
npm run build
```

Load the extension in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the generated `dist/` directory.

After rebuilding, reload the extension from `chrome://extensions` and reload the target tab before testing again.

## Development

Run a production-style build:

```bash
npm run build
```

Run build watch mode:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

Run TypeScript checks:

```bash
npm run typecheck
```

## Project Structure

```text
src/background/    Service worker orchestration and Chrome API calls
src/content/       Page overlays, selection UX, preview UI, scroll orchestration
src/offscreen/     Image crop/merge processing in an offscreen document
src/popup/         Extension popup UI
src/shared/        Shared types, messages, geometry, filenames, session helpers
manual-test-pages/ Local pages for manual capture testing
```

## Capture Flow

1. The popup asks the background service worker to start a capture mode.
2. The background injects the bundled content script into the active tab when needed.
3. Content overlays handle selection, scrolling, progress UI, and preview rendering.
4. The background captures visible tab bitmaps with `chrome.tabs.captureVisibleTab`.
5. The offscreen document crops or stitches images and returns PNG data URLs.
6. The content preview overlay lets the user copy, save, retry, or close.

## Manual Testing Notes

- Always rebuild and reload the unpacked extension before testing fresh changes.
- Reload the target tab after reloading the extension.
- Test normal pages, long pages, and pages with sticky/fixed elements.
- Chrome internal pages and some restricted URLs cannot be captured by content-script injection.
- Service worker, offscreen document, and page content logs appear in different DevTools contexts.

## Current Permissions

The extension intentionally avoids static host permissions and static content scripts. It relies on `activeTab` plus programmatic injection for the current tab.

```json
["activeTab", "scripting", "downloads", "offscreen", "clipboardWrite"]
```
