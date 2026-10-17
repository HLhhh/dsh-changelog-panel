# dsh-changelog-panel

[简体中文](README_zh.md)

**A bilingual changelog, security-advisory, and storage panel for DeepSeek Harness.** Install it and the
sidebar gains one entry: what changed in every release, which CVE/GHSA records affect your install, and how
much disk space DSH itself is holding.

- Version timeline with category-grouped feature cards and keyword search
- A **Security** tab: 13 advisories with severity, affected range, fixed version, and source links
- An installed-version badge that tells you how it compares to the official latest
- Per-panel language switch (zh / en) that neither follows nor changes the rest of the shell
- A companion storage dashboard: what DSH leaves on disk, what each item costs, which conversation owns it,
  and which parts are reclaimable

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
- Rate limiting is reported explicitly instead of failing silently

### Storage dashboard

The same plugin also ships a storage view: what DSH has written to your disk (session logs, attachments,
caches, runtime binaries), how much each item costs, which conversation owns it, and what can be moved to
the OS trash. It **only reports** — it never deletes on your behalf — and categories that must not be
reclaimed say why.

## Configuration

None. Language is the panel's own state (the 中文 / EN toggle in its header); it follows the shell locale by
default and only affects this panel.

## Compatibility

| Surface | Status |
| --- | --- |
| DeepSeek Harness | `0.2.x` (developed and tested on `0.2.1-rc.2`) |
| Node | `^22.19.0 \|\| >=24.0.0` |
| Platforms | Web (browser and desktop) |
| Dependencies | Only the peer dependency `@deepseek-ai/cordis ~4.0.4`; no host package is bundled |

## Known limitations

- **No npm release yet** — GitHub or a local path only
- The built-in dataset is a point-in-time snapshot; use the manual refresh for current data
- Live refresh needs `api.github.com` and `registry.npmjs.org` to be reachable; otherwise only the built-in
  dataset is shown
- Storage figures come verbatim from the scan report; nothing is extrapolated
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
