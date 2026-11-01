# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Security Assessment Reporter: a client-side builder for penetration-test / security assessment
reports. The entire app is **one file**, `rapportgenerator.html` (markup, CSS and vanilla JS in
one `<script>`), with Bootstrap 5 + Bootstrap Icons vendored in `vendor/`. No build, no backend,
nothing leaves the browser. Live at https://jozeta.github.io/rapportgenerator/rapportgenerator.html.

## Commands

```sh
python3 -m http.server 8000     # http://localhost:8000/rapportgenerator.html (JSON files need http, not file://)
node tests/run.mjs              # all regression cases (Node 22+ and any Chromium browser; BROWSER=/path to choose)
node tests/run.mjs BUG-001 SEC  # filter by case id or tag (smoke, tokens, import, persistence, autosave, security, perf, …)
```

The test runner serves the repo, starts a headless browser with a throwaway profile, reloads the
app before every step and drives it over the DevTools protocol. `tests/page-helpers.js` provides
`window.__t`. Cases in `tests/cases.mjs` use finding IDs from `AUDIT.md`: a failing case means
that bug is back.

## How it works

- **State:** one in-memory `findings` array; **rendering:** `renderAll()` rebuilds the risk
  matrix, summaries, pre-export checklist and finding cards from it.
- **Narrative sections** are `contenteditable` HTML in the DOM, with no separate model.
- **Data files** next to the HTML, loaded with `fetch()`: `library.json` (~270 vulnerability
  templates), `report-defaults.json` (`{ defaultTemplate, templates }` per assessment type),
  optional `settings.json` (firm-wide company, contact, logo, branding colours, classifications,
  watermark).
- **Dynamic tokens** `[COMPANY NAME]`, `[CLIENT NAME]`, `[CONTACT NAME]`, `[CONTACT EMAIL]` are
  converted to spans (`convertLiteralTokensToSpans()`) and kept in sync with the sidebar fields.
- **Persistence:** Export/Import Report JSON (`buildReportPayload()`); identity fields and an
  autosaved draft in `localStorage`.
- **PDF** = `window.print()` with an `@media print` stylesheet; branding = CSS vars `--primary`,
  `--accent`, `--headline-color`.
- Custom Promise-based dialogs `showConfirm()` / `showAlert()`; never native `alert/confirm`.
- Find & Replace edits only `Text` nodes via `TreeWalker`, never raw HTML.

## Rules

- Keep it a single self-contained HTML file with no external runtime dependencies (vendored
  assets only, CDN only as the `file://` fallback).
- For every bug fix, add a case to `tests/cases.mjs` and an entry in `AUDIT.md`.
- `1z.nu` hosts a copy of `rapportgenerator.html`; after releasing a change, update that copy.
- Imported report JSON is rendered as HTML by design (documented limitation). Don't widen what
  imports can execute (no inline scripts or event handlers).
