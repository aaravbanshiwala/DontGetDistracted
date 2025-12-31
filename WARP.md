# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project overview

This repository contains a small Chrome/Chromium extension, **"Don't Get Distracted"**, that tracks when the user visits distracting sites (e.g., YouTube Shorts, TikTok, Instagram) and, after a configurable number of consecutive visits, opens an interrupting "get back to work" alert tab.

Key pieces:
- `manifest.json`: Chrome Extension Manifest V3 definition (background service worker, popup, options page, icons, host permissions).
- `background.js`: Service worker that tracks tab activity, classifies URLs into site types, increments a consecutive-visit counter, and triggers the alert.
- `alert.html` / `alert.js`: Full-page interruption UI that shows the alert message and uses dark/light theme.
- `popup.html` / `popup.js`: Browser action popup; mainly provides a button to open the settings/options page and applies theme.
- `settings.html` / `settings.js`: Options page UI allowing users to configure threshold, alert message, tracked sites, and dark mode.
- `styles.css`: Shared styling and light/dark theme variables for all extension pages.

There is currently **no build system, package manager config, or automated test setup**; the extension runs directly from these static assets.

## Extension architecture and data flow

### Manifest and entry points (`manifest.json`)

- Uses **Manifest V3** with a background service worker: `"background": { "service_worker": "background.js" }`.
- Host permissions are granted for specific distracting domains (YouTube Shorts, TikTok, Instagram); URL matching logic in `background.js` works against `host + pathname`, so tracked site patterns are written accordingly.
- The browser action is configured with:
  - `default_popup: "popup.html"`
  - `default_icon` set to files in `icons/`.
- Options page is `settings.html` via `"options_page": "settings.html"`.

### Settings, state, and storage

Two conceptual layers of data are stored in `chrome.storage.local`:

1. **Persistent settings** (key: `settings`), schema:
   - `threshold` (number): how many **consecutive** visits to the same tracked site type before triggering the alert.
   - `alertMessage` (string): message shown on the alert page.
   - `darkMode` (boolean): toggles dark theme across popup, settings, and alert pages.
   - `trackedSites` (array of objects): each `{ pattern, enabled, id }`, where:
     - `pattern`: wildcard string like `"youtube.com/shorts/*"`.
     - `enabled`: boolean toggle for this pattern.
     - `id`: stable identifier (in `settings.js` it’s derived from the pattern itself).

2. **Ephemeral state** (stored as top-level keys, not inside `settings`):
   - `currentCount` (number): consecutive visits for the **current site type**.
   - `lastSiteType` (string or null): identifier of the last matched tracked site.

`background.js` uses helper functions:
- `getStorage(cb)`: reads `settings`, `currentCount`, and `lastSiteType`, merges with defaults, then passes `{ settings, state }` into the callback.
- `saveStorage({ settings, state }, cb)`: persists `settings` and the current `state` to `chrome.storage.local`.

**Important consistency note:**
- Defaults for `settings` are defined separately in both `background.js` and `settings.js` as `DEFAULT_SETTINGS`. If you change default values or add new fields, update **both** files or centralize them to avoid drift.

### URL classification and alert triggering (`background.js`)

Core functions and flow:

- `wildcardToRegExp(pattern)` converts wildcard patterns (with `*`) into regular expressions used to match `host + pathname` strings.
- `getSiteType(url, trackedSites)`:
  - Parses the tab URL with `new URL(url)`.
  - Builds `urlStr = host + pathname`.
  - Iterates all `trackedSites` and, for each enabled site, constructs a regex from `pattern` and tests it against `urlStr`.
  - Returns `site.id` (or the pattern string) for the first match, or `null` if none.
- `handleUrl(url)`:
  - Calls `getStorage` to fetch `settings` and `state`.
  - Computes `siteType = getSiteType(url, settings.trackedSites || [])`.
  - If no `siteType` is found:
    - Resets `state.currentCount` to `0` and `state.lastSiteType` to `null` and saves.
  - If `siteType` matches `state.lastSiteType`:
    - Increments `state.currentCount`.
  - Otherwise:
    - Sets `state.currentCount = 1` and `state.lastSiteType = siteType`.
  - When `state.currentCount >= (settings.threshold || DEFAULT_SETTINGS.threshold)`:
    - Calls `triggerAlert()`.
    - Resets `currentCount` and `lastSiteType` to start a new sequence.
  - Persists the updated state via `saveStorage`.

- `triggerAlert()`:
  - Finds the active tab in the current window.
  - Opens a **new tab** pointing at `alert.html` using `chrome.runtime.getURL("alert.html")`.

Event hooks:
- `chrome.runtime.onInstalled`:
  - On first install, seeds `chrome.storage.local` with `DEFAULT_SETTINGS` and initializes `currentCount` and `lastSiteType`.
- `chrome.tabs.onUpdated`:
  - When a tab’s `status` becomes `"complete"` and `tab.url` is present, calls `handleUrl(tab.url)`.
- `chrome.tabs.onActivated`:
  - When the active tab changes, retrieves the tab and calls `handleUrl(tab.url)`.

Together, these ensure every completed navigation or tab activation on a tracked site increments a consecutive counter per site type and triggers an alert once the threshold is reached.

### Options page / settings UI (`settings.html` + `settings.js`)

`settings.js` is responsible for rendering and persisting the options page:

- `DEFAULT_SETTINGS` mirrors the structure in `background.js` and is used both for defaults and for merging stored values.
- `loadSettings()`:
  - Reads `settings` and `currentCount` from `chrome.storage.local`.
  - Merges with `DEFAULT_SETTINGS`.
  - Populates:
    - Threshold input (`#threshold`).
    - Alert message textarea (`#alertMessage`).
    - Dark mode checkbox (`#darkMode`) and theme (via `applyTheme`).
    - Tracked sites list in `#tracked-sites` using `renderTrackedSites`.
  - Displays the current consecutive count in `#currentCount`.
- `renderTrackedSites(list)`:
  - Clears and re-renders the list of tracked sites, each as a row with:
    - Checkbox to enable/disable.
    - Text input for wildcard pattern.
    - "Remove" button.
  - Row elements use `.site-row`, `.site-enabled`, and `.site-pattern` classes.
- `collectTrackedSites()`:
  - Reads the current DOM rows and returns a normalized array `{ pattern, enabled, id }`.
  - `id` is set equal to `pattern` for stability.
- `saveSettings()`:
  - Reads the current values from the inputs and `collectTrackedSites()`.
  - Writes a new `settings` object into `chrome.storage.local`.
  - Applies dark mode immediately and shows a transient "Saved" status message.
- `addSiteRow()`:
  - Uses `collectTrackedSites()` to get the current list, appends an empty enabled site, and re-renders.

On `DOMContentLoaded`, the script:
- Calls `loadSettings()`.
- Wires up `#save` and `#add-site` buttons.

### Popup and alert UIs (`popup.*`, `alert.*`)

**Popup (`popup.html` + `popup.js`):**
- `loadSettings()` reads `settings` and applies the dark theme to the popup via `applyTheme(settings.darkMode)`.
- On `DOMContentLoaded`, it:
  - Loads settings and theme.
  - Wires the **"Open Settings"** button (`#open-settings`) to:
    - `chrome.runtime.openOptionsPage()` when available (modern browsers).
    - Fallback to `window.open("settings.html")` for older environments.

**Alert (`alert.html` + `alert.js`):**
- `loadAlert()` reads `settings` and:
  - Sets `#alert-message` to `settings.alertMessage` (with a default message fallback).
  - Applies dark mode via `applyTheme(settings.darkMode)`.
- On `DOMContentLoaded`, it:
  - Loads the alert message and theme.
  - Wires the **"I'm getting back to work"** button (`#close-alert`) to `window.close()`.

### Styling and theming (`styles.css`)

- Global CSS variables define core colors for light mode under `:root` and override them in `body.dark` for dark mode.
- `styles.css` is shared by popup, settings, and alert pages so visual adjustments are centralized.
- Layout-specific classes:
  - Popup: `.popup-body`, `.popup-root`, `.popup-header`, `.popup-main`, `.popup-text`.
  - Settings: `.settings-body`, `.settings-root`, `.settings-header`, `.card`, `.field`, `.site-row`, `.settings-footer`, `.status-text`.
  - Alert: `.alert-body`, `.alert-root`, `.alert-card`, `.alert-subtext`.

When modifying UI, prefer reusing these primitives rather than introducing page-specific ad hoc styles.

## Development workflow and commands

There is no Node-based toolchain or test runner configured. Development is currently done by editing the static files and loading the unpacked extension into a Chromium-based browser.

### Load and iterate on the extension in Chrome/Chromium

1. Open `chrome://extensions/` (or the equivalent in your Chromium-based browser).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `dont-get-distracted` project directory.
4. After making code changes, use **Reload** on the extension card and refresh affected tabs.

These manual steps are the primary way to test behavior today.

### Building a distributable ZIP

From the project root (`dont-get-distracted`), you can create a zip suitable for manual installation or store uploads:

```bash
cd /Users/I304584/projects/dont-get-distracted
zip -r dont-get-distracted.zip . -x '*.DS_Store' 'WARP.md'
```

Adjust the exclusion list as needed (e.g., to omit editor configs or other local-only files).

### Linting and tests

- **Linting:** There is no configured linter in this repository (no `package.json`, ESLint config, or similar). If you introduce one, document the commands here (for example, `npm test`, `npm run lint`, etc.).
- **Tests:** There is no automated test suite at present. All verification is via manual interaction with the extension in the browser. If you add tests, prefer a clear file layout (e.g., `tests/`) and update this section with commands for running the full test suite and a single test.
