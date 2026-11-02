# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] — 2026-11-02

### Fixed

- **A GitHub rate limit no longer reads as a failed refresh.** GitHub's REST API allows 60 unauthenticated
  requests per hour per IP, so exhaustion is ordinary (shared NAT makes it likely). The panel announced
  “GitHub API rate limit reached … auto refresh turned off” — with raw English transport text — although the
  npm registry had answered and the version list was complete. Release notes are now treated as optional
  enrichment: the status stays successful with a short “notes unavailable” hint, the live section shows one
  localized sentence, and versions keep coming from npm. Only both sources failing is an error.
- **Only GitHub can be described as a GitHub rate limit.** The failure text was applied to any 403/429, so a
  refused npm registry request was reported as “GitHub API rate limit reached”. The transport now classifies
  each source separately (`rate-limited` / `http` / `network`) and the UI localizes from that, never by
  parsing the diagnostic string.
- **A failed npm registry is no longer silent.** It used to pass without a hint: the version list was then built
  from GitHub releases alone and could omit versions that have no release. Both sources now report their state
  symmetrically — the registry failure says the list may be incomplete, the notes failure says notes are
  unavailable — and the live section shows one localized notice per degraded source.
- **Only an actually exhausted budget is reported as a quota.** `failureKind` classified every 403 as
  `rate-limited`, so an abuse/secondary limit or a regional block was still described as “60 requests/hour
  used up”. Classification now uses `x-ratelimit-remaining`, and a missing header no longer coerces to `0`
  (`Number(null) === 0`, the original source of the false claim) — those cases render as a refusal instead.
- **A first-run total failure no longer claims to have kept data.** The error line said “keeping the last
  data” even when no cache existed. It now distinguishes “kept the last data” from “nothing to show yet”,
  and the raw transport text moved into the status tooltip instead of being shown as the explanation.
- **The sandbox reproduction ships with the repo**: `tests/rate-limit.mjs` (dependency-free, `npm test`)
  stubs `fetch` and locks in the three cases above.
- Dead producers/readers removed (`state.warnings` mirrors, the redundant `rateLimited` transport flag now
  superseded by `sources`, `live.warning`, `live.rateLimited`), the module's self-documented wiring header was
  corrected, and the status-line `warn` tone with its CSS was dropped because nothing returns it any more.
- The live release list no longer logs a missing-`key` warning for every row.

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
