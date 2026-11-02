# Agent notes

## Collaboration rule (required)

This repository is maintained by one human (`HLhhh`) plus an AI agent.

**Before modifying any tracked file, ask the maintainer which path to use:**

- **Pull request** — branch + PR. Preferred for behaviour changes, version bumps, UI changes, and
  anything that touches the dataset or the live-data transport.
- **Direct push to `main`** — only when the maintainer explicitly asks for it (a docs-only edit or an
  urgent one-liner, for example).

Never infer the path from the size of the change, and never switch paths mid-task without asking.
`main` has no branch protection by the maintainer's decision; this rule replaces it.

A **direct push to `main`** must record the authorization in the commit message as a
`Maintainer-authorized:` trailer naming what was authorized and when — git history is the only audit
trail while protection is off.

## Layout

| Path | What it is |
| --- | --- |
| `src/client/*.mjs` | Browser half, concatenated into ONE scope by the build: `index.mjs` (panel), `fetched.mjs` (refresh state/badge/notes), `live-data.mjs` (fetch + parsers), `storage-panel.mjs` / `storage-client.mjs` (storage dashboard) |
| `src/data/*.mjs` | Curated dataset, inlined by the build: releases, features, advisories, sources, bilingual `text.mjs`, `verify.mjs` |
| `lib/index.js` | Host half: writes the storage report, registers the Agent tools |
| `lib/storage-scan.js`, `lib/storage-tools.js`, `lib/app-version.js` | Hand-written host modules (scan/plan/trash, the three tools, runtime version detection) |
| `lib/client.js` | **Generated** — never hand-edit; run `npm run build` |
| `scripts/build.mjs` | The one build step (concatenate + bake a fallback version) |
| `tests/rate-limit.mjs` | Dependency-free sandbox reproduction of the GitHub-quota behaviour |
| `locale/`, `icon.svg`, `cordis.patch.yml` | Plugin metadata and the Loader row |

## Commands

```sh
npm run build        # regenerate lib/client.js after ANY src/ change
npm test             # sandbox tests (dependency-free)
npm run data:verify  # dataset schema/localization/citation/grounding checks
```

A change to `src/` without a rebuild ships a stale bundle: `lib/client.js` is what the app loads.

## Conventions

- A behaviour change bumps `package.json` and adds a `CHANGELOG.md` entry (Keep a Changelog, SemVer).
- Every user-visible string goes through the panel dictionary with **both** `zh` and `en` entries.
- Client sources share one bundle scope: no `import`, exactly one trailing `export { … }` per file,
  only `react` is seeded, no third-party runtime dependency.
- Comments explain *why*, not *what*; a non-obvious invariant stated in the code must be true (several
  past bugs were comments that no longer matched the code).
- Never commit credentials, local absolute paths, or generated storage reports.

## Invariants that were learned the hard way

- **Live data**: GitHub release notes are optional enrichment. The npm registry alone supplies the
  version list, so a GitHub failure must never be a failed refresh. Classify a 403 with
  `x-ratelimit-remaining`; a **missing** header is not `0` (`Number(null) === 0` caused months of false
  "quota exhausted" claims). Only both sources failing is an error, and the error text must not claim
  data was kept when nothing was.
- **Installed version**: read at runtime (`Info.plist`, `app.asar` manifests, Electron
  `app.getVersion()`). Never substitute the build-time baked value when a report exists — that made an
  older install on another machine report itself as the latest. An unknown version stays unknown.
- **"latest" vs "installed"** are different badges: `latest` is computed from the merged version list,
  `installed` is the running version. The dataset's `highlight` flag means "the build this dataset was
  written against", not "newest".
- **Storage dashboard is read-only.** The browser half has no filesystem authority and no host call
  channel, so reclaim runs through the `storage_cleanup` Agent tool. Do not add delete buttons to the
  panel; a control that looks interactive and does nothing is worse than none.
- **Storage figures** come verbatim from the host scan report; nothing is estimated. A failed scan is
  written to both report copies so the panel cannot present an older report as current.
- **Dataset**: do not fabricate entries or citations. Every claim must be checkable against the source
  package or release it names, and `npm run data:verify` must pass (`DSHCL_STRICT_ZH=1` enforces the
  Chinese corpus).
