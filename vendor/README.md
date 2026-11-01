# Vendored third-party files

These are local copies of the stylesheets and the icon font that `rapportgenerator.html` used to load from jsDelivr on every visit. Keeping them local means the app works offline (common on air-gapped test networks) and doesn't depend on a CDN at run time. See PERF-008 and SEC-004 in `AUDIT.md`.

If the files are missing (for example, when only the HTML file was copied somewhere), the page falls back to the same files on jsDelivr. Both paths are checked against the integrity hashes below, so a modified copy is refused either way.

| File | Version | Source | sha384 |
|---|---|---|---|
| `bootstrap-5.3.0/bootstrap.min.css` | Bootstrap 5.3.0 | https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css | `9ndCyUaIbzAi2FUVXJi0CjmCapSmO7SnpJef0486qhLnuZ2cdeRhO02iuK6FUUVM` |
| `bootstrap-icons-1.11.3/bootstrap-icons.min.css` | Bootstrap Icons 1.11.3 | https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css | `XGjxtQfXaH2tnPFa9x+ruJTuLE3Aa6LhHSWRr1XeTyhezb4abCG4ccI5AkVDxqC+` |
| `bootstrap-icons-1.11.3/fonts/bootstrap-icons.woff2` | Bootstrap Icons 1.11.3 | …/font/fonts/bootstrap-icons.woff2 | `QV+/zNG6sFIQ/qAWRxaR4sjpF37wr046d3pTS5QlogmJfbmyeiWip4YIIGmdK4pa` |
| `bootstrap-icons-1.11.3/fonts/bootstrap-icons.woff` | Bootstrap Icons 1.11.3 | …/font/fonts/bootstrap-icons.woff | `jiOBsoZ7OEMAq7BXRR05+D5H/5Lna7TAlXVGHhkfH68p5P1eKJTeI4KCIOfBzG/O` |

**How they were checked (2026-11-01):**
- The Bootstrap CSS hash equals the official SRI hash Bootstrap publishes for 5.3.0.
- All four files' sha256 hashes equal those listed by the jsDelivr package API (`data.jsdelivr.com/v1/packages/npm/<package>@<version>?structure=flat`).

**Licenses:** Bootstrap and Bootstrap Icons are both MIT-licensed, © The Bootstrap Authors.
- https://github.com/twbs/bootstrap/blob/v5.3.0/LICENSE
- https://github.com/twbs/icons/blob/v1.11.3/LICENSE

**To upgrade:**
1. Download the new versions.
2. Recompute the hashes with `openssl dgst -sha384 -binary FILE | openssl base64 -A`.
3. Update the `<link>` tags (local `href`, CDN fallback URL and `integrity`) in `rapportgenerator.html`, and this table.
