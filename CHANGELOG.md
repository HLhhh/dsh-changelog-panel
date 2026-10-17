# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-10-17

First public release.

### Added

- Sidebar panel "Changelog & Storage" registered on `sidebar.panellist` plus a keyed `main` panel body
- Version timeline with category-grouped feature cards and keyword search
- Security tab with 13 advisories (CVE / GHSA / DSH design notes), including severity, affected range,
  fixed version, and source links
- Installed-version badge comparing the local build to the latest official release
- Daily-first-open auto refresh plus manual refresh with a last-refresh timestamp
- Live data merged from `registry.npmjs.org` and the official GitHub releases, without overwriting the
  verified built-in dataset
- Per-panel language switch (中文 / EN) that follows the shell locale by default
- Storage dashboard reporting what DSH leaves on disk, per-item cost, owning conversation, and what is
  reclaimable (report-only; nothing is deleted automatically)

### Notes

- Install is GitHub-only for now: `dsh plugin --profile web add github:HLhhh/dsh-changelog-panel`
