# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report it privately through GitHub instead: go to the **Security** tab of this repository and click
**Report a vulnerability** ([direct link](https://github.com/jozeta/rapportgenerator/security/advisories/new)).
Include what you found, how to reproduce it, and the impact you expect.

This is a personal project maintained in spare time. You can expect an acknowledgement within a
week. Fixes are released as soon as practical, and you'll be credited in the advisory unless you
prefer otherwise.

## Scope

Imported report JSON is rendered as HTML by design (see Known limitations). Script execution from imported reports or libraries is still a vulnerability and is covered by the `SEC-*` regression tests.

## Supported versions

Only the latest version on the `main` branch receives security fixes.
