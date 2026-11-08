# Changelog

All notable changes to rapportgenerator are listed here, newest first.

The project has no tagged releases yet, so changes are grouped by date. Entries before November 2026 were reconstructed from the commit history.

## Unreleased

- Swedish reports (FEAT-007). Each report has its own language, English or Swedish, saved in the report file and independent of the interface language. All 11 templates have Swedish headings, default text, writing tips, rating scales and legends (`translations.sv` in `report-defaults.json`). Severities, statuses, finding-card labels, the action planner, the retest table, metadata labels, the Table of Contents title and figure captions ("Figur n:") are printed in the report's language. Switching language asks first and can be undone. `[infoga …]` placeholders are flagged by the Pre-Export Checklist. Dates in messages follow the interface language
- Printed finding scores use the template's rating scale ("Likelihood" in reviews) instead of always "Exploitability"
- Security (SEC-DOM-2): reviewed all 28 `innerHTML` / `insertAdjacentHTML` sinks and marked each with the reason it is safe. Finding description and remediation are now sanitized every time they are rendered, not only on import: HTML committed from an editable field could otherwise be re-rendered with its event handlers. Rolling back a failed import now goes through the sanitizer too. New regression tests: render-time sanitizing, rollback, and an XSS/mXSS corpus against the sanitizer
- Swedish interface. Buttons, menus, tooltips, dialogs, messages and the Pre-Export Checklist are in English or Swedish. The default follows the browser's language; Settings → Interface Language changes it live, and the choice is remembered. The report's own text isn't affected. Tests fail if any interface text lacks a Swedish translation
- Fix UI-010: the Print Watermark tooltip was cut off after "Requires" (unescaped quotes in the attribute)
- Report templates with their own structure. Each template defines its sections, headings, order, default text, rating scale (Exploitability for pentests, Likelihood for reviews) and finding labels. New templates: General Security Review, Vulnerability Assessment, Phishing / Social Engineering and Configuration Review. Code Review was reworked (repositories and commit, review approach, secure development recommendations). Switching template keeps findings and user-added sections, asks first and can be undone. The sidebar control is now "Report Template", grouped by kind. `report-defaults.json` moves to format 2; format 1 files still load
- Animations and transitions respect the system's "Reduce motion" setting
- ESLint (flat config, with the no-unsanitized rule) as a dev-only tool; CI runs `npm run lint`
- `npm test` runs the regression suite (`tests/run.mjs`), and CI runs it that way
- Lint: unsafe DOM sinks are errors (off in the XSS regression tests, which use them on purpose);
  removed unused test helpers

## 2026-11-02

- Add CI workflow, Dependabot config, security policy

## 2026-11-01

- Add audit report and zero-install browser regression suite
- Fix BUG-001/BUG-010: idempotent, DOM-based token conversion with repair
- Fix SEC-002 (library list) and BUG-006: render library entries as text
- Fix BUG-003/BUG-002/BUG-011/BUG-012, add report schema v2 (ARCH-004)
- Fix SEC-001, SEC-005, BUG-015; finish SEC-002
- Fix BUG-007, BUG-008, BUG-009, BUG-013, BUG-014
- Fix PERF-001/PERF-007: delegated drag-and-drop, installed once
- Fix BUG-005, BUG-004, UI-009: IndexedDB autosave with visible status
- AUDIT.md: add implementation status and decisions
- Add FEAT-005 evidence handling; fix PERF-003, PERF-005, PERF-006
- Add UI-001, UI-002, UI-003, UI-004: keyboard dialogs, inline assets, target section, better library search
- Fix UI-006 (phone layout) and UI-008 (descriptive export file names)
- Fix PERF-008 and SEC-004: vendor Bootstrap CSS and icons with SRI
- Add UI-005: undo for destructive actions, Find & Replace preview
- Add ARCH-003 stable finding ids, FEAT-004 retest workflow, FEAT-008 sort
- AUDIT.md: remove local machine paths and scratch-file references
- Ignore macOS, Claude Code and secret files
- Add CLAUDE.md with project guidance for Claude Code
- README: add screenshots

## 2026-08-31

- Initial commit: Security Assessment Reporter
- Add live demo link to README
