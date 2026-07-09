# Repository Guidelines

## Project Structure & Module Organization

This repository is a small static cashier reporting app for UMKM use. The main application lives in `index.html`, which contains the markup, Tailwind CDN styling, and browser JavaScript. `README.md` provides the project summary. There is no separate `src/`, `tests/`, or asset directory yet. If the app grows, prefer focused folders such as `assets/` for images/icons and `tests/` for browser checks.

## Build, Test, and Development Commands

No package manager or build step is currently configured.

- `open index.html`: opens the app directly in a browser on macOS.
- `python3 -m http.server 8000`: serves the repository locally at `http://localhost:8000` when browser security or network behavior needs an HTTP origin.
- `git status --short`: checks pending changes before and after edits.

Dependencies load from CDNs, so test with an internet connection unless they are replaced with local assets.

## Coding Style & Naming Conventions

Match the existing single-file style. Use 4-space indentation for HTML, CSS, and JavaScript blocks. Prefer clear `camelCase` names, as in `shiftData`, `currentMode`, and `confirmReset`. Keep UI text in Indonesian unless the surrounding feature already uses English. Avoid broad refactors; make surgical edits that directly support the request.

## Testing Guidelines

There is no automated test framework yet. Verify changes manually in a browser by checking the main tabs: `Awal`, `Akhir`, `Pengeluaran`, and `Laporan`. For state changes, confirm `localStorage` persistence by refreshing. For reporting or screenshot changes, test the generated output on mobile-sized and desktop viewports. If automated tests are added later, place them under `tests/` and document the runner here.

## Commit & Pull Request Guidelines

Recent commits use concise messages such as `Update index.html` and `Update README.md`. Continue with short, imperative summaries, for example `Fix report total calculation` or `Update cashier form labels`. Pull requests should include a brief description, manual test notes, and screenshots for visible UI changes. Link issues when available and call out changes to external services such as Google Apps Script URLs or Drive folder IDs.

## Security & Configuration Tips

`index.html` currently contains Google Drive and Google Script identifiers. Treat service URLs and IDs as configuration-sensitive: do not replace them casually, and document any production changes in the PR description. Avoid committing private credentials or user sales data.
