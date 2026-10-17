// RELEASES — published release rail for the changelog panel.
//
// Every date below is a real publish timestamp from the npm registry `time` map
// for @deepseek-ai/dsh-base, read on 2026-10-07 from
// https://registry.npmjs.org/@deepseek-ai%2Fdsh-base (see sources.mjs `src-npm-dsh-base`).
// No per-release feature attribution is claimed: the panel's FEATURES rows all
// carry the version of the installed tree (0.2.0-rc.2), the only build this
// dataset can prove from package READMEs and manifests.
//
// Order: newest first. `highlight: true` marks the build installed here.
// Plain ESM, no imports, no I/O — this module is inlined into lib/client.js.

export const RELEASES = Object.freeze([
  {
    version: '0.2.1-alpha.1',
    channel: 'alpha',
    date: '2026-10-03',
    title: L('Newest published artifact', '最新的已发布构建产物'),
    summary:
      L(
        'The newest artifact on npm for @deepseek-ai/dsh-base, published 2026-10-03 04:45 UTC and tagged `alpha`. It is listed so the rail shows what follows the installed build; nothing in this panel is rendered from it.',
        '@deepseek-ai/dsh-base 在 npm 上最新的构建产物，于 2026-10-03 04:45 UTC 发布，标记为 `alpha`。列出它是为了让版本栏显示已安装构建之后的版本；本面板没有任何内容取自它。',
      ),
    highlight: false,
  },
  {
    version: '0.2.0-rc.2',
    channel: 'rc',
    date: '2026-09-29',
    title: L('Installed build: 0.2.0-rc.2', '已安装构建：0.2.0-rc.2'),
    summary:
      L(
        'The build this panel is rendered from. Published 2026-09-29 09:48 UTC for @deepseek-ai/dsh-base (and tagged `next`/`latest` for @deepseek-ai/dsh); the extracted install carries 288 @deepseek-ai packages, 279 of them at exactly 0.2.0-rc.2.',
        '本面板所渲染的构建。@deepseek-ai/dsh-base 于 2026-09-29 09:48 UTC 发布（@deepseek-ai/dsh 标记为 `next`/`latest`）；提取出的安装中共有 288 个 @deepseek-ai 包，其中 279 个恰好是 0.2.0-rc.2。',
      ),
    highlight: true,
  },
  {
    version: '0.2.0-rc.1',
    channel: 'rc',
    date: '2026-09-28',
    title: L('0.2.0 release candidate 1', '0.2.0 候选版本 1'),
    summary:
      L(
        'Release candidate published 2026-09-28 12:27 UTC for @deepseek-ai/dsh-base, superseded one day later by 0.2.0-rc.2, the build installed here.',
        '@deepseek-ai/dsh-base 的候选版本，于 2026-09-28 12:27 UTC 发布；一天后被本机安装的 0.2.0-rc.2 取代。',
      ),
    highlight: false,
  },
  {
    version: '0.1.7-rc.2',
    channel: 'rc',
    date: '2026-09-24',
    title: L('Last 0.1.x release candidate', '0.1.x 系列最后一个候选版本'),
    summary:
      L(
        'Published 2026-09-24 14:10 UTC. Two public CVEs (CVE-2026-101078, CVE-2026-101132) name affected ranges ending at 0.1.7-rc.2, which is why those records report "no" for the installed 0.2.0-rc.2 build.',
        '于 2026-09-24 14:10 UTC 发布。两个公开 CVE（CVE-2026-101078、CVE-2026-101132）列出的受影响范围止于 0.1.7-rc.2，因此这两条记录对已安装的 0.2.0-rc.2 构建给出 “no”（不受影响）。',
      ),
    highlight: false,
  },
  {
    version: '0.1.5-rc.3',
    channel: 'rc',
    date: '2026-09-22',
    title: L('0.1.5 line, third candidate', '0.1.5 系列第三个候选版本'),
    summary:
      L(
        'Published 2026-09-22 05:48 UTC. CVE-2026-101131 names affected versions 0.1.5-rc.0 through 0.1.5-rc.3, so this tag is the last one inside that published range.',
        '于 2026-09-22 05:48 UTC 发布。CVE-2026-101131 列出的受影响版本为 0.1.5-rc.0 至 0.1.5-rc.3，因此该标签是这一已发布范围内的最后一个。',
      ),
    highlight: false,
  },
  {
    version: '0.1.0-rc.2',
    channel: 'rc',
    date: '2026-08-13',
    title: L('Early 0.1.0 release candidate', '0.1.0 早期候选版本'),
    summary:
      L(
        'Published 2026-08-13 09:41 UTC. CVE-2026-101102 names affected versions 0.1.0-rc.0 through 0.1.0-rc.7, which covers this tag.',
        '于 2026-08-13 09:41 UTC 发布。CVE-2026-101102 列出的受影响版本为 0.1.0-rc.0 至 0.1.0-rc.7，涵盖该标签。',
      ),
    highlight: false,
  },
  {
    version: '0.0.1-rc.1',
    channel: 'rc',
    date: '2026-08-10',
    title: L('First published artifact', '首个已发布的构建产物'),
    summary:
      L(
        'The first @deepseek-ai/dsh-base artifact on npm, published 2026-08-10 19:37 UTC; the registry entry for @deepseek-ai/dsh followed about three minutes later. Start of the published version history this rail covers.',
        'npm 上第一个 @deepseek-ai/dsh-base 构建产物，于 2026-08-10 19:37 UTC 发布；@deepseek-ai/dsh 的注册表条目约三分钟后出现。这是本版本栏覆盖的已发布版本历史的起点。',
      ),
    highlight: false,
  },
])
