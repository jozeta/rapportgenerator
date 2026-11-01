# Regression tests

```sh
node tests/run.mjs              # run everything
node tests/run.mjs BUG-001 SEC  # only cases whose id or tag contains one of these strings
node tests/run.mjs stage1       # tags: smoke, tokens, import, persistence, autosave, security, perf, stage1, stage2, …
```

**Requirements:** Node 22 or later, plus any installed Chrome, Chromium, Edge or Brave. Set `BROWSER=/path/to/binary` to choose one. Nothing needs installing: the app itself stays dependency-free, and so do the tests.

**How it works:**
1. `run.mjs` serves the repo root on a random local port.
2. It starts the browser headless with a throwaway profile.
3. Before every step it reloads the app. Storage is cleared on the first step, and on any step marked `fresh: true`.
4. It runs each step inside the page through the Chrome DevTools Protocol.

**Helpers:** `page-helpers.js` is injected before the app script and provides `window.__t`. It has helpers for picking files, answering the in-app dialogs, capturing downloads and counting listeners. It also stubs the native `prompt`/`alert`/`confirm`.

**Expected outcomes:** cases in `cases.mjs` describe the *correct* behavior and use the finding IDs from `AUDIT.md`. A failing case therefore means that bug is still present.
