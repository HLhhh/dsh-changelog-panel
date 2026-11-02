# dsh-changelog-panel

[简体中文](README_zh.md)

> Primary repo: <https://github.com/HLhhh/dsh-changelog-panel> ·
> Gitee mirror: <https://gitee.com/huang-lin-java/dsh-changelog-panel>

**A bilingual changelog and security-advisory panel for DeepSeek Harness.** Install it and the sidebar
gains one entry: what changed in every release, and which CVE/GHSA records affect your install.

- Version timeline with category-grouped feature cards and keyword search
- A **Security** tab: 13 advisories with severity, affected range, fixed version, and source links
- An installed-version badge that tells you how it compares to the official latest
- Per-panel language switch (zh / en) that neither follows nor changes the rest of the shell

## What it looks like

```
┌──────────────────────────────────────────────────────────────────────┐
│ Changelog & Security   7 versions · 50 records  [Changelog][Security]│
├──────────────┬───────────────────────────────────────────────────────┤
│ Versions     │ 0.2.0-rc.2   latest   2026-09-29                      │
│ ┌──────────┐ │ One-line summary…                                     │
│ │0.2.0-rc.2│ │ ● Agent · 6                                           │
│ │latest·33 │ │   ┌───────────────────────────────────────────────┐   │
│ └──────────┘ │   │ ● Title / summary / related packages          │   │
│ 0.2.0-rc.1   │   └───────────────────────────────────────────────┘   │
│ 0.1.7-rc.2   │ ● Tools · 8   ● Sessions · 5   ● UI · 7 …             │
└──────────────┴───────────────────────────────────────────────────────┘
```

## Install / Update

> Not published to npm yet — install straight from GitHub.

### With the `dsh` CLI

```sh
dsh plugin --profile web add github:HLhhh/dsh-changelog-panel
```

Replace `web` with your profile name (`desktop` for the desktop app).

### With the `plugin_manager` tool (inside an agent)

Call `install_bundle` with `target` set to:

```
github:HLhhh/dsh-changelog-panel
```

### From a local checkout

```sh
git clone https://github.com/HLhhh/dsh-changelog-panel.git
dsh plugin --profile web add /absolute/path/to/dsh-changelog-panel
```

The prebuilt `lib/client.js` is committed, so **no build step is required to install**.
Restart DSH (or let HMR pick it up) and refresh the page.

Uninstall:

```sh
dsh plugin --profile web remove dsh-changelog-panel
```

## Features

### Changelog

- Version timeline on the left, opening on the version **you actually have installed**
- Entries grouped by category: agent, UI, tools, sessions, security, platform, plugins
- Search across titles, summaries, and related package names
- At most 12 release entries rendered per version; older ones are reachable from the timeline

### Security

- 13 advisories and CVE/GHSA records with severity, status, affected range, fixed version, and links
- A "search scope" note stating what was searched and what was not found — no unsupported claims

### Live data

The panel talks to two public endpoints **directly from your browser**; no third-party server is involved:

| Source | Used for |
| --- | --- |
| `registry.npmjs.org/@deepseek-ai/dsh-base` | Version list and publish times |
| `api.github.com/repos/deepseek-ai/deepseek-harness/releases` | Official release notes |

- Refreshes once on the first open of each day, plus a manual refresh button with the last refresh time
- New versions are merged into the timeline but never overwrite the verified built-in dataset
- **Release notes are optional enrichment.** GitHub's unauthenticated API allows 60 requests/hour per IP, so
  quota exhaustion is ordinary (shared NAT makes it likely). The version list still comes from npm and the
  refresh still counts as successful; the panel says "release notes unavailable" instead of reporting an
  error. Only both sources failing is an error, and the previous data is kept when there is any.
- An unknown installed version is shown as unknown ("versions not comparable"); the panel never substitutes
  the version the bundle was built with. The running version is read at runtime (`Info.plist`, the app
  manifest inside `app.asar`, or Electron's `app.getVersion()`).

## Configuration

None. Language is the panel's own state (the 中文 / EN toggle in its header); it follows the shell locale by
default and only affects this panel.

## Compatibility

| Surface | Status |
| --- | --- |
| DeepSeek Harness | `0.2.x` (developed and tested on `0.2.1-rc.5`) |
| Node | `^22.19.0 \|\| >=24.0.0` |
| Platforms | Web (browser and desktop) |
| Dependencies | Only the peer dependency `@deepseek-ai/cordis ~4.0.4`; no host package is bundled |

## Known limitations

- **No npm release yet** — GitHub or a local path only
- The built-in dataset is a point-in-time snapshot; use the manual refresh for current data
- Live notes need `api.github.com`; when it is rate-limited or unreachable the panel keeps working from npm
  (versions only) and shows a localized notice
- Chinese entries are paraphrases, not quotations of the original advisories — consult the linked sources
  for compliance decisions

## Development

```bash
npm run build        # regenerate lib/client.js from src/
npm run data:verify  # validate the dataset
```

`lib/client.js` is generated — edit `src/` and rebuild; do not hand-edit the bundle.

## License

MIT — see [LICENSE](LICENSE).
