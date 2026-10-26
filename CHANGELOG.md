# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] — 2026-10-26

### Fixed

- **An install that is not the newest no longer reports itself as up to date.** When the host could not
  read the running version it wrote `dshVersion: "unknown"`, and the panel fell back to the version the
  bundle had been BUILT with. On a second machine running an older DSH that build-machine number was then
  compared against the newest release, so the panel claimed “up to date”. With a plugin context the report
  is now the only authority: an unknown version stays unknown (“versions not comparable”), and the baked
  value is used solely by a standalone render that has no plugin context at all.
- **Version detection covers every desktop platform, and the report says where the number came from.**
  Sources are tried in order — Electron's `app.getVersion()`, the macOS bundle `Info.plist`, then the
  `@deepseek-ai/dsh-base` and app manifests inside `app.asar` — and `host.dshVersionSource` plus
  `host.dshVersionChecked` record what answered and what was tried. The storage dashboard prints that
  provenance, so a wrong badge can be distinguished from a wrong install.

## [0.1.1] — 2026-10-25

### Fixed

- **The installed-version badge no longer goes stale after a DSH upgrade.** The host half now reads the
  running app's version at runtime and writes it into the storage report the panel consumes; detection
  reads the bundle `Info.plist` (`CFBundleShortVersionString`) first, falls back to the `@deepseek-ai/dsh-base`
  manifest inside `app.asar`, and keeps the build-time value only as a fallback for a standalone render.
  Previously the number was baked in at build time, so an upgrade kept reporting the version the bundle
  was built against.
- **Version detection can no longer abort the storage report.** Inside Electron the asar layer treats
  `app.asar` as a directory, so opening it threw; the throw escaped and the whole report was replaced by an
  error envelope. Detection is now non-throwing (it degrades to `unknown`), and a failed scan is written to
  both report copies so the panel cannot keep presenting an older report as current.
- **The “latest” badge marks the newest known version**, not the dataset's authored `highlight` — that flag
  marks the build the dataset was written against, so after an upgrade an old release (e.g. `0.2.0-rc.2`)
  kept wearing “latest”. The installed build now carries its own `installed` badge, and both can appear
  together when you are on the newest release.

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
