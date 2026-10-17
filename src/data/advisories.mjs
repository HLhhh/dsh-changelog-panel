// ADVISORIES + ADVISORY_COVERAGE — only records that were read from a primary
// source on 2026-10-07. Nothing here is invented: every id, range, score and
// date is quoted from the NVD 2.0 API, the MITRE cveawg API, the OSV API, or the
// published GitHub artifact named in `references`. Entries whose facts could not
// be read are absent and their absence is stated in ADVISORY_COVERAGE.
//
// Plain ESM, no imports, no I/O — this module is inlined into lib/client.js.

export const ADVISORIES = Object.freeze([
  {
    id: 'CVE-2026-82533',
    status: 'fixed',
    severity: 'critical',
    title: L('Auth bypass in the local agent-control HTTP API', '本地 agent-control HTTP API 的认证绕过'),
    summary:
      L(
        'DeepSeek Harness before 0.1.2-alpha.1 accepted a client-supplied loopback Host header instead of validating the actual TCP connection origin, so a confined tool-executed process could reach the loopback agent-control API, escape its own sandbox, escalate to unconfined execution and disable the approval prompt; with the port exposed through a tunnel, SSH forward or reverse proxy a remote attacker could create sessions, run commands and exfiltrate stored transcripts without credentials. NVD scores it CVSS v3.1 9.6 (critical) and CVSS v4.0 9.4 (critical). The installed 0.2.0-rc.2 is above the fixed version 0.1.2-alpha.1, so this build contains the fix.',
        '0.1.2-alpha.1 之前的 DeepSeek Harness 接受客户端提供的 loopback Host 头，而不校验实际的 TCP 连接来源，因此受限的工具执行进程可以访问 loopback 上的 agent-control API，逃逸自身沙箱、提权到不受限执行并关闭审批提示；当端口通过隧道、SSH 转发或反向代理暴露时，远程攻击者无需凭据即可创建会话、运行命令并窃取已存储的对话记录。NVD 给出的评分为 CVSS v3.1 9.6（critical）与 CVSS v4.0 9.4（critical）。已安装的 0.2.0-rc.2 高于修复版本 0.1.2-alpha.1，因此本构建包含该修复。',
      ),
    affected: [
      L(
        'DeepSeek Harness < 0.1.2-alpha.1 (NVD range: version 0, lessThan 0.1.2-alpha.1)',
        'DeepSeek Harness < 0.1.2-alpha.1（NVD 范围：version 0，lessThan 0.1.2-alpha.1）',
      ),
      L(
        'installed here: 0.2.0-rc.2 — above the fixed version',
        '本机安装：0.2.0-rc.2 —— 高于修复版本',
      ),
    ],
    fixedIn: '0.1.2-alpha.1',
    published: '2026-09-08',
    references: [
      {
        label: L('NVD record CVE-2026-82533', 'NVD 记录 CVE-2026-82533'),
        url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-82533',
      },
      {
        label: L('MITRE cveawg record (assigner: VulnCheck)', 'MITRE cveawg 记录（分配机构：VulnCheck）'),
        url: 'https://cveawg.mitre.org/api/cve/CVE-2026-82533',
      },
      {
        label: L('Fix commit 3e24087 (NVD reference)', '修复提交 3e24087（NVD 引用）'),
        url: 'https://github.com/deepseek-ai/deepseek-harness/commit/3e24087bfaeabe40b58ba2f7b936895b8f93fe27',
      },
      {
        label: L('Release dsh-v0.1.2-alpha.1 (NVD reference)', '发布 dsh-v0.1.2-alpha.1（NVD 引用）'),
        url: 'https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-alpha.1',
      },
      {
        label: L('Ox Security analysis of CVE-2026-82533 (NVD reference)', 'Ox Security 对 CVE-2026-82533 的分析（NVD 引用）'),
        url: 'https://www.ox.security/blog/cve-2026-82533-deepseek-harness-ai-agent-sandbox-escape/',
      },
      {
        label: L('VulnCheck advisory (NVD reference)', 'VulnCheck 安全公告（NVD 引用）'),
        url: 'https://www.vulncheck.com/advisories/deepseek-harness-alpha-1-authentication-bypass-via-host-header-spoofing',
      },
      {
        label: L('Related public report: unauthenticated RCE via the dsh web UI control plane', '相关公开报告：经 dsh Web UI 控制面的未认证远程代码执行'),
        url: 'https://github.com/deepseek-ai/deepseek-harness/discussions/853',
      },
    ],
    packages: ['@deepseek-ai/dsh', '@deepseek-ai/dsh-base'],
    source:
      'NVD 2.0 API record for CVE-2026-82533 and the MITRE cveawg record, both fetched 2026-10-07; fix commit and release tag are NVD references whose pages were confirmed reachable.',
    verified: '2026-10-07',
    appliesToInstalled: 'no',
  },
  {
    id: 'CVE-2026-101078',
    status: 'not-affected',
    severity: 'medium',
    title: L('Landlock backend isolation flaw (Linux)', 'Landlock 后端隔离缺陷（Linux）'),
    summary:
      L(
        'The Landlock backend in packages/sandbox/sandbox-local/src/profiles.ts allowed improper isolation or compartmentalization; the attack must be carried out locally. The CNA lists exactly 0.1.7-rc.0, 0.1.7-rc.1 and 0.1.7-rc.2 as affected, every one of them before the installed 0.2.0-rc.2, and publishes no fixed version; NVD scores it CVSS v3.1 6.3 (medium). NVD notes the vendor was contacted and did not respond, so this record is unconfirmed by DeepSeek.',
        'packages/sandbox/sandbox-local/src/profiles.ts 中的 Landlock 后端导致隔离或 compartmentalization 不当；该攻击必须在本地进行。CNA 明确列出受影响版本为 0.1.7-rc.0、0.1.7-rc.1 与 0.1.7-rc.2，均早于本机安装的 0.2.0-rc.2，且未发布修复版本；NVD 给出的评分为 CVSS v3.1 6.3（medium）。NVD 注明已联系厂商但未获回应，因此该记录未得到 DeepSeek 确认。',
      ),
    affected: [
      L(
        '0.1.7-rc.0, 0.1.7-rc.1, 0.1.7-rc.2 (CNA-enumerated)',
        '0.1.7-rc.0、0.1.7-rc.1、0.1.7-rc.2（CNA 列明）',
      ),
      L(
        'installed here: 0.2.0-rc.2 — outside the published range',
        '本机安装：0.2.0-rc.2 —— 不在已发布范围内',
      ),
    ],
    fixedIn: null,
    published: '2026-09-28',
    references: [
      {
        label: L('NVD record CVE-2026-101078', 'NVD 记录 CVE-2026-101078'),
        url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-101078',
      },
      {
        label: L('MITRE cveawg record (assigner: VulDB)', 'MITRE cveawg 记录（分配机构：VulDB）'),
        url: 'https://cveawg.mitre.org/api/cve/CVE-2026-101078',
      },
    ],
    packages: ['@deepseek-ai/dsh-sandbox-local'],
    source:
      'MITRE cveawg and NVD 2.0 API records for CVE-2026-101078, fetched 2026-10-07; affected version list and CVSS taken verbatim.',
    verified: '2026-10-07',
    appliesToInstalled: 'no',
  },
  {
    id: 'CVE-2026-101102',
    status: 'not-affected',
    severity: 'medium',
    title: L('Code Mode Sandbox run_code confinement issue', 'Code Mode Sandbox run_code 的隔离问题'),
    summary:
      L(
        'The run_code function of the Code Mode Sandbox component results in a sandbox issue and the attack can be executed remotely; the CNA quotes the vendor\u2019s own notes that the worker is "containment, not a security boundary". The CNA lists 0.1.0-rc.0 through 0.1.0-rc.7 as affected, all before the installed 0.2.0-rc.2, with no fixed version published; NVD scores it CVSS v3.1 6.3 (medium) and notes the vendor did not respond.',
        'Code Mode Sandbox 组件的 run_code 函数会导致沙箱问题，且该攻击可远程执行；CNA 引用了厂商自己的说明，称该 worker 是 “containment, not a security boundary”。CNA 列出的受影响版本为 0.1.0-rc.0 至 0.1.0-rc.7，均早于本机安装的 0.2.0-rc.2，且未发布修复版本；NVD 给出的评分为 CVSS v3.1 6.3（medium），并注明厂商未回应。',
      ),
    affected: [
      L(
        '0.1.0-rc.0 … 0.1.0-rc.7 (CNA-enumerated)',
        '0.1.0-rc.0 … 0.1.0-rc.7（CNA 列明）',
      ),
      L(
        'installed here: 0.2.0-rc.2 — outside the published range',
        '本机安装：0.2.0-rc.2 —— 不在已发布范围内',
      ),
    ],
    fixedIn: null,
    published: '2026-09-28',
    references: [
      {
        label: L('NVD record CVE-2026-101102', 'NVD 记录 CVE-2026-101102'),
        url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-101102',
      },
      {
        label: L('MITRE cveawg record (assigner: VulDB)', 'MITRE cveawg 记录（分配机构：VulDB）'),
        url: 'https://cveawg.mitre.org/api/cve/CVE-2026-101102',
      },
    ],
    packages: ['@deepseek-ai/dsh'],
    source:
      'MITRE cveawg and NVD 2.0 API records for CVE-2026-101102, fetched 2026-10-07; description, affected list and CVSS taken verbatim.',
    verified: '2026-10-07',
    appliesToInstalled: 'no',
  },
  {
    id: 'CVE-2026-101131',
    status: 'not-affected',
    severity: 'low',
    title: L('Untrusted E2B_API_KEY input in a security decision', '安全决策中依赖不可信的 E2B_API_KEY 输入'),
    summary:
      L(
        'In packages/e2b/e2b/src/index.ts the handling of the argument E2B_API_KEY relies on untrusted input in a security decision, requiring local access. The CNA lists 0.1.5-rc.0 through 0.1.5-rc.3 as affected, all before the installed 0.2.0-rc.2, with no fixed version published; NVD scores it CVSS v3.1 3.3 (low) and notes the vendor did not respond. No package under the e2b path exists in the extracted 0.2.0-rc.2 tree, so the component named by the CNA is not part of this install.',
        '在 packages/e2b/e2b/src/index.ts 中，对参数 E2B_API_KEY 的处理在安全决策中依赖不可信输入，需要本地访问。CNA 列出的受影响版本为 0.1.5-rc.0 至 0.1.5-rc.3，均早于本机安装的 0.2.0-rc.2，且未发布修复版本；NVD 给出的评分为 CVSS v3.1 3.3（low），并注明厂商未回应。提取出的 0.2.0-rc.2 包树中不存在 e2b 路径下的任何包，因此 CNA 指出的组件不属于本次安装。',
      ),
    affected: [
      L(
        '0.1.5-rc.0 … 0.1.5-rc.3 (CNA-enumerated)',
        '0.1.5-rc.0 … 0.1.5-rc.3（CNA 列明）',
      ),
      L(
        'installed here: 0.2.0-rc.2 — outside the published range',
        '本机安装：0.2.0-rc.2 —— 不在已发布范围内',
      ),
    ],
    fixedIn: null,
    published: '2026-09-28',
    references: [
      {
        label: L('NVD record CVE-2026-101131', 'NVD 记录 CVE-2026-101131'),
        url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-101131',
      },
      {
        label: L('MITRE cveawg record (assigner: VulDB)', 'MITRE cveawg 记录（分配机构：VulDB）'),
        url: 'https://cveawg.mitre.org/api/cve/CVE-2026-101131',
      },
    ],
    packages: ['@deepseek-ai/dsh'],
    source:
      'MITRE cveawg and NVD 2.0 API records for CVE-2026-101131, fetched 2026-10-07; absence of an e2b package confirmed against the 288-package extracted tree.',
    verified: '2026-10-07',
    appliesToInstalled: 'no',
  },
  {
    id: 'CVE-2026-101132',
    status: 'not-affected',
    severity: 'low',
    title: L('Path traversal in the bundle-patch profile loader', 'bundle 补丁配置档加载器中的路径穿越'),
    summary:
      L(
        'The loadProfile function of packages/boot/app-boot/src/profile.ts traverses paths via the dsh.bundle.patch argument, in the Bundle Patch Handler component; the attack can be performed remotely but requires high complexity and user interaction. The CNA lists 0.1.7-rc.0 through 0.1.7-rc.2 as affected, all before the installed 0.2.0-rc.2, with no fixed version published; NVD scores it CVSS v3.1 3.1 (low) and notes the vendor did not respond.',
        'Bundle Patch Handler 组件中 packages/boot/app-boot/src/profile.ts 的 loadProfile 函数会通过 dsh.bundle.patch 参数进行路径穿越；该攻击可远程执行，但需要较高复杂度与用户交互。CNA 列出的受影响版本为 0.1.7-rc.0 至 0.1.7-rc.2，均早于本机安装的 0.2.0-rc.2，且未发布修复版本；NVD 给出的评分为 CVSS v3.1 3.1（low），并注明厂商未回应。',
      ),
    affected: [
      L(
        '0.1.7-rc.0, 0.1.7-rc.1, 0.1.7-rc.2 (CNA-enumerated)',
        '0.1.7-rc.0、0.1.7-rc.1、0.1.7-rc.2（CNA 列明）',
      ),
      L(
        'installed here: 0.2.0-rc.2 — outside the published range',
        '本机安装：0.2.0-rc.2 —— 不在已发布范围内',
      ),
    ],
    fixedIn: null,
    published: '2026-09-28',
    references: [
      {
        label: L('NVD record CVE-2026-101132', 'NVD 记录 CVE-2026-101132'),
        url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-101132',
      },
      {
        label: L('MITRE cveawg record (assigner: VulDB)', 'MITRE cveawg 记录（分配机构：VulDB）'),
        url: 'https://cveawg.mitre.org/api/cve/CVE-2026-101132',
      },
      {
        label: L('Upstream discussion #3354 (NVD reference)', '上游讨论 #3354（NVD 引用）'),
        url: 'https://github.com/deepseek-ai/deepseek-harness/discussions/3354',
      },
    ],
    packages: ['@deepseek-ai/dsh-app-boot'],
    source:
      'MITRE cveawg and NVD 2.0 API records for CVE-2026-101132, fetched 2026-10-07; affected list, CVSS and the discussions/3354 reference come from those records.',
    verified: '2026-10-07',
    appliesToInstalled: 'no',
  },
  {
    id: 'GHSA-6qxp-vccf-f47h',
    status: 'affected',
    severity: 'high',
    title: L('MCP SDK OAuth client could leak its credentials', 'MCP SDK 的 OAuth 客户端可能泄露凭据'),
    summary:
      L(
        'In @modelcontextprotocol/client 2.0.0 the OAuth client let the MCP server decide which authorization server received the client\u2019s credentials, so a malicious or compromised server could name its own authorization server and receive a stored refresh_token/client_secret, or a configured client_secret, with no user interaction. The installed tree pins exactly 2.0.0 through @deepseek-ai/dsh-mcp-client and the advisory fixes the range at 2.2.0. Per the advisory, exposure requires the SDK\u2019s OAuth client over HTTP (authProvider, withOAuth() or direct auth()/fetchToken() calls) against a server you do not fully trust; no MCP server is enabled by default.',
        '在 @modelcontextprotocol/client 2.0.0 中，OAuth 客户端让 MCP 服务器决定由哪个授权服务器接收客户端的凭据，因此恶意或被入侵的服务器可以指定自己的授权服务器，在无需用户交互的情况下取得已存储的 refresh_token/client_secret，或已配置的 client_secret。安装树通过 @deepseek-ai/dsh-mcp-client 精确锁定在 2.0.0，而该公告把修复版本定为 2.2.0。按照公告，只有当针对并不完全信任的服务器使用 SDK 的 HTTP OAuth 客户端（authProvider、withOAuth() 或直接调用 auth()/fetchToken()）时才存在暴露；默认不启用任何 MCP 服务器。',
      ),
    affected: [
      L(
        '@modelcontextprotocol/client >= 2.0.0 < 2.2.0',
        '@modelcontextprotocol/client >= 2.0.0 < 2.2.0',
      ),
      L(
        'installed here: 2.0.0 (via @deepseek-ai/dsh-mcp-client 0.2.0-rc.2)',
        '本机安装：2.0.0（经由 @deepseek-ai/dsh-mcp-client 0.2.0-rc.2）',
      ),
    ],
    fixedIn: '2.2.0',
    published: '2026-10-06',
    references: [
      {
        label: L('OSV record GHSA-6qxp-vccf-f47h / CVE-2026-104850', 'OSV 记录 GHSA-6qxp-vccf-f47h / CVE-2026-104850'),
        url: 'https://api.osv.dev/v1/vulns/GHSA-6qxp-vccf-f47h',
      },
      {
        label: L('GitHub Security Advisory in modelcontextprotocol/typescript-sdk', 'modelcontextprotocol/typescript-sdk 中的 GitHub 安全公告'),
        url: 'https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-6qxp-vccf-f47h',
      },
      {
        label: L('Fixed release v2.2.0 of the TypeScript SDK', 'TypeScript SDK 的修复发布 v2.2.0'),
        url: 'https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/v2.2.0',
      },
    ],
    packages: ['@modelcontextprotocol/client', '@deepseek-ai/dsh-mcp-client'],
    source:
      'OSV record GHSA-6qxp-vccf-f47h read 2026-10-07; installed version read from node_modules/@modelcontextprotocol/client/package.json and the dependent range from node_modules/@deepseek-ai/dsh-mcp-client/package.json.',
    verified: '2026-10-07',
    appliesToInstalled: 'yes',
  },
  {
    id: 'GHSA-ch52-4w7c-c8xp',
    status: 'affected',
    severity: 'high',
    title: L('http-cache-semantics disclosed cached responses', 'http-cache-semantics 泄露了已缓存响应'),
    summary:
      L(
        'http-cache-semantics through 4.2.0 fails to validate security-zeroed cache entries when processing client max-stale directives, letting an unauthenticated attacker request the same URL with a large max-stale value and retrieve another user\u2019s cached response, including Set-Cookie session credentials, from a shared cache. The installed tree pins exactly 4.2.0 (the advisory\u2019s last_affected version) through cacheable-request and got, which @deepseek-ai/dsh-otel depends on; the record publishes no fixed version as of 2026-10-07.',
        'http-cache-semantics 至 4.2.0 在处理客户端 max-stale 指令时未正确校验已做安全清零的缓存条目，使未认证攻击者可以用很大的 max-stale 值请求同一 URL，从而从共享缓存中取得其他用户的缓存响应，包括 Set-Cookie 会话凭据。安装树通过 cacheable-request 和 got 精确锁定在 4.2.0（即该公告的 last_affected 版本），而 @deepseek-ai/dsh-otel 依赖 got；截至 2026-10-07，该记录未发布修复版本。',
      ),
    affected: [
      L(
        'http-cache-semantics <= 4.2.0 (OSV: introduced 0, last_affected 4.2.0)',
        'http-cache-semantics <= 4.2.0（OSV：introduced 0，last_affected 4.2.0）',
      ),
      L(
        'installed here: 4.2.0 (via cacheable-request <- got <- @deepseek-ai/dsh-otel 0.2.0-rc.2)',
        '本机安装：4.2.0（经由 cacheable-request <- got <- @deepseek-ai/dsh-otel 0.2.0-rc.2）',
      ),
    ],
    fixedIn: null,
    published: '2026-09-18',
    references: [
      {
        label: L('OSV record GHSA-ch52-4w7c-c8xp / CVE-2026-93748', 'OSV 记录 GHSA-ch52-4w7c-c8xp / CVE-2026-93748'),
        url: 'https://api.osv.dev/v1/vulns/GHSA-ch52-4w7c-c8xp',
      },
      {
        label: L('NVD record CVE-2026-93748', 'NVD 记录 CVE-2026-93748'),
        url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-93748',
      },
      {
        label: L('Upstream issue in kornelski/http-cache-semantics', 'kornelski/http-cache-semantics 中的上游议题'),
        url: 'https://github.com/kornelski/http-cache-semantics/issues/56',
      },
    ],
    packages: ['http-cache-semantics', 'cacheable-request', 'got', '@deepseek-ai/dsh-otel'],
    source:
      'OSV record GHSA-ch52-4w7c-c8xp and the NVD record for CVE-2026-93748, both read 2026-10-07; installed versions and the dependency chain read from the installed package manifests.',
    verified: '2026-10-07',
    appliesToInstalled: 'yes',
  },
  {
    id: 'DSH-SANDBOX-POLICY',
    status: 'fixed',
    severity: 'info',
    title: L('One sandbox policy for bash, files and terminals', 'bash、文件与终端的统一沙箱策略'),
    summary:
      L(
        'Hardening design fact of the installed build: a single file-effect policy is applied to every confined bash, filesystem and terminal call. Deployments choose the default mode and fallback workspace root, each session can switch modes independently and the choice survives restart, and all enforcing capabilities use the same mode and workspace for a call.',
        '已安装构建的加固设计事实：对每次受限的 bash、文件系统与终端调用都应用同一份文件影响策略。部署方选择默认模式与后备工作区根目录，每个会话可独立切换模式且该选择在重启后保留，所有执行能力在一次调用中使用同一模式与工作区。',
      ),
    affected: [L('all confined bash, filesystem and terminal calls in 0.2.0-rc.2', '0.2.0-rc.2 中所有受限的 bash、文件系统与终端调用')],
    fixedIn: '0.2.0-rc.2',
    published: null,
    references: [
      {
        label: L('sandbox-policy README (packages/sandbox/sandbox-policy)', 'sandbox-policy README（packages/sandbox/sandbox-policy）'),
        url: 'https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sandbox/sandbox-policy/README.md',
      },
    ],
    packages: ['@deepseek-ai/dsh-sandbox-policy', '@deepseek-ai/dsh-sandbox-local'],
    source:
      'Installed package README @deepseek-ai/dsh-sandbox-policy 0.2.0-rc.2 (packages/sandbox/sandbox-policy/README.md).',
    verified: '2026-10-07',
    appliesToInstalled: 'no',
  },
  {
    id: 'DSH-FS-SANDBOX',
    status: 'fixed',
    severity: 'info',
    title: L('Model writes are confined to the workspace', '模型写入被限制在工作区内'),
    summary:
      L(
        'Hardening design fact of the installed build: in workspace-write mode model writes and edits are permitted only inside the session workspace or a platform temporary root, read-only rejects every mutation, and denials return FS_SANDBOX_DENIED with the active mode and a same-turn escalation hint. danger-full-access is the documented opt-out.',
        '已安装构建的加固设计事实：在 workspace-write 模式下，模型的文件写入与编辑只允许在会话工作区或平台临时根目录内进行，read-only 拒绝任何改动，拒绝时返回 FS_SANDBOX_DENIED 并附上当前模式与同一轮次内的提权提示。danger-full-access 是文档化的退出选项。',
      ),
    affected: [L('model-visible file mutations in 0.2.0-rc.2', '0.2.0-rc.2 中模型可见的文件改动')],
    fixedIn: '0.2.0-rc.2',
    published: null,
    references: [
      {
        label: L('fs-sandbox README (packages/fs/fs-sandbox)', 'fs-sandbox README（packages/fs/fs-sandbox）'),
        url: 'https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/fs/fs-sandbox/README.md',
      },
    ],
    packages: ['@deepseek-ai/dsh-fs-sandbox'],
    source: 'Installed package README @deepseek-ai/dsh-fs-sandbox 0.2.0-rc.2 (packages/fs/fs-sandbox/README.md).',
    verified: '2026-10-07',
    appliesToInstalled: 'no',
  },
  {
    id: 'DSH-APPROVAL-FAILCLOSED',
    status: 'fixed',
    severity: 'info',
    title: L('Approvals fail closed and are audited', '审批失败即关闭并留有审计'),
    summary:
      L(
        'Hardening design fact of the installed build: a sensitive tool action waits for a one-shot decision, the ask policy routes each request to the deployment\u2019s answerers while never rejects without prompting, and missing or failed answerers return unavailable so the action fails closed. Approval applies to that request only and every request and outcome is recorded in the session audit log.',
        '已安装构建的加固设计事实：敏感工具操作会等待一次性决定；ask 策略把每个请求交给部署方的应答者，而 never 直接拒绝而不提示；应答者缺失或失败会返回 unavailable，因此该操作失败即关闭。审批只对本次请求有效，且每个请求与结果都记录在会话审计日志中。',
      ),
    affected: [L('approval-gated tool actions in 0.2.0-rc.2', '0.2.0-rc.2 中受审批约束的工具操作')],
    fixedIn: '0.2.0-rc.2',
    published: null,
    references: [
      {
        label: L('user-approval README (packages/interaction/user-approval)', 'user-approval README（packages/interaction/user-approval）'),
        url: 'https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/interaction/user-approval/README.md',
      },
    ],
    packages: ['@deepseek-ai/dsh-user-approval'],
    source:
      'Installed package README @deepseek-ai/dsh-user-approval 0.2.0-rc.2 (packages/interaction/user-approval/README.md).',
    verified: '2026-10-07',
    appliesToInstalled: 'no',
  },
  {
    id: 'DSH-READ-BEFORE-EDIT',
    status: 'fixed',
    severity: 'info',
    title: L('Read-before-edit rejects stale mutations', '先读后写会拒绝过期改动'),
    summary:
      L(
        'Hardening design fact of the installed build: filesystem tools require a successful read before overwriting or editing a file, and a mutation is rejected when the file changed since that read, with an instruction to re-read and retry. Reading a missing path authorizes guarded creation, so concurrent creation stays protected.',
        '已安装构建的加固设计事实：文件系统工具要求在覆盖或编辑文件前先成功读取；若文件自那次读取后已变更，则拒绝该改动并提示重新读取后重试。读取不存在的路径会授权受保护的创建，因此并发创建仍受保护。',
      ),
    affected: [L('guarded write and edit operations in 0.2.0-rc.2', '0.2.0-rc.2 中受保护的写入与编辑操作')],
    fixedIn: '0.2.0-rc.2',
    published: null,
    references: [
      {
        label: L('fs-observation-policy README (packages/fs/fs-observation-policy)', 'fs-observation-policy README（packages/fs/fs-observation-policy）'),
        url: 'https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/fs/fs-observation-policy/README.md',
      },
    ],
    packages: ['@deepseek-ai/dsh-fs-observation-policy'],
    source:
      'Installed package README @deepseek-ai/dsh-fs-observation-policy 0.2.0-rc.2 (packages/fs/fs-observation-policy/README.md).',
    verified: '2026-10-07',
    appliesToInstalled: 'no',
  },
  {
    id: 'DSH-ATOMIC-WRITE',
    status: 'fixed',
    severity: 'info',
    title: L('Atomic writes resist symlink and partial writes', '原子写入抵御符号链接与半写'),
    summary:
      L(
        'Hardening design fact of the installed build: file replacement never exposes partial content and never follows a symlinked temporary path, a writer lock serialises read-modify-write cycles across processes so concurrent writers cannot clobber each other with stale state, and each replacement uses caller-selected permission bits on a fresh inode, which can only narrow an existing file\u2019s permissions.',
        '已安装构建的加固设计事实：文件替换绝不暴露部分内容，也绝不跟随符号链接的临时路径；写入锁跨进程串行化读-改-写周期，因此并发写入者不会用过期状态相互覆盖；每次替换都在新的 inode 上使用调用方选择的权限位，这只会收窄既有文件的权限。',
      ),
    affected: [L('file replacement performed through @deepseek-ai/dsh-atomic-write in 0.2.0-rc.2', '0.2.0-rc.2 中通过 @deepseek-ai/dsh-atomic-write 进行的文件替换')],
    fixedIn: '0.2.0-rc.2',
    published: null,
    references: [
      {
        label: L('atomic-write README (packages/util/atomic-write)', 'atomic-write README（packages/util/atomic-write）'),
        url: 'https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/util/atomic-write/README.md',
      },
    ],
    packages: ['@deepseek-ai/dsh-atomic-write'],
    source:
      'Installed package README @deepseek-ai/dsh-atomic-write 0.2.0-rc.2 (packages/util/atomic-write/README.md).',
    verified: '2026-10-07',
    appliesToInstalled: 'no',
  },
  {
    id: 'DSH-SSRF-GUARD',
    status: 'fixed',
    severity: 'info',
    title: L('web_fetch refuses non-public destinations', 'web_fetch 拒绝非公网目标'),
    summary:
      L(
        'Hardening design fact of the installed build: the anonymous HTTP(S) fetch backend validates the URL, resolves public addresses only, pins the connection, restricts redirects to the same origin, caps bytes and characters, sends no credentials, and rejects non-public destinations, binary data and unsupported content types.',
        '已安装构建的加固设计事实：匿名 HTTP(S) 抓取后端会校验 URL、只解析公网地址、固定连接、把重定向限制在同源、限制字节与字符数、不发送凭据，并拒绝非公网目标、二进制数据与不支持的内容类型。',
      ),
    affected: [L('model-facing web_fetch calls in 0.2.0-rc.2', '0.2.0-rc.2 中面向模型的 web_fetch 调用')],
    fixedIn: '0.2.0-rc.2',
    published: null,
    references: [
      {
        label: L('web-fetch-http README (packages/web/web-fetch-http)', 'web-fetch-http README（packages/web/web-fetch-http）'),
        url: 'https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/web/web-fetch-http/README.md',
      },
    ],
    packages: ['@deepseek-ai/dsh-web-fetch-http', '@deepseek-ai/dsh-tool-web'],
    source:
      'Installed package README @deepseek-ai/dsh-web-fetch-http 0.2.0-rc.2 (packages/web/web-fetch-http/README.md).',
    verified: '2026-10-07',
    appliesToInstalled: 'no',
  },
])

export const ADVISORY_COVERAGE = Object.freeze({
  installedVersion: '0.2.0-rc.2',
  checkedAt: '2026-10-07',
  summary:
    L(
      'Searched NVD (keyword and per-CVE), the MITRE cveawg API, the OSV API by package name for all 288 installed @deepseek-ai packages and by version for all 500 installed packages, and the GitHub repository security-advisory surfaces. Found five published CVEs for the DeepSeek Harness product (one fixed in 0.1.2-alpha.1, four whose enumerated ranges all end at or before 0.1.7-rc.2, i.e. before the installed 0.2.0-rc.2) and two dependency advisories whose affected ranges do contain versions pinned in this install. Found no CVE or GitHub advisory whose affected range includes 0.2.0-rc.2 of any first-party package, and no vendor-published security advisory for the project at all.',
      '检索了 NVD（关键词与逐 CVE）、MITRE cveawg API、按包名对全部 288 个已安装 @deepseek-ai 包以及按版本对全部 500 个已安装包查询 OSV API，以及 GitHub 仓库的安全公告入口。结果发现 DeepSeek Harness 产品有 5 个已发布 CVE（其中 1 个在 0.1.2-alpha.1 修复，另外 4 个的列明范围都止于 0.1.7-rc.2 或更早，即早于已安装的 0.2.0-rc.2），以及 2 个受影响范围确实涵盖本次安装所锁定版本的依赖公告。未发现任何 CVE 或 GitHub 公告的受影响范围包含任何一方包的 0.2.0-rc.2，也未发现该项目有任何厂商发布的安全公告。',
    ),
  searched: [
    {
      sourceId: 'src-nvd-search-harness',
      query: L('NVD 2.0 API, keywordSearch=deepseek-harness', 'NVD 2.0 API，关键词参数 keywordSearch=deepseek-harness'),
      result:
        L(
          '4 records, all VulDB-assigned, all published 2026-09-28, every affected version list ending at 0.1.7-rc.2 or earlier.',
          '4 条记录，全部由 VulDB 分配，均发布于 2026-09-28，每个受影响版本列表都止于 0.1.7-rc.2 或更早。',
        ),
    },
    {
      sourceId: 'src-nvd-search-deepseek',
      query: L('NVD 2.0 API, keywordSearch=deepseek (broad sweep)', 'NVD 2.0 API，keywordSearch=deepseek（大范围扫描）'),
      result:
        L(
          '16 records; besides the 4 above, only CVE-2026-82533 concerns DeepSeek Harness. The rest concern DeepSeek model artifacts (R1/V3.2), other vendors\u2019 agents (CodeWhale, Reasonix Studio), a WordPress plugin and a third-party DeepSeek MCP server, none of which ship in this install.',
          '16 条记录；除上述 4 条外，只有 CVE-2026-82533 与 DeepSeek Harness 有关。其余涉及 DeepSeek 模型产物（R1/V3.2）、其他厂商的智能体（CodeWhale、Reasonix Studio）、一个 WordPress 插件以及一个第三方 DeepSeek MCP 服务器，这些都不在本次安装中。',
        ),
    },
    {
      sourceId: 'src-nvd-82533',
      query: L('NVD 2.0 API, cveId=CVE-2026-82533', 'NVD 2.0 API，参数 cveId=CVE-2026-82533'),
      result:
        L(
          '1 record: authentication bypass in the local agent-control API, affected < 0.1.2-alpha.1, CVSS v3.1 9.6 critical, with a fix commit and release tag. Installed 0.2.0-rc.2 is above the fix.',
          '1 条记录：本地 agent-control API 的认证绕过，受影响 < 0.1.2-alpha.1，CVSS v3.1 9.6 critical，并附有修复提交与发布标签。已安装的 0.2.0-rc.2 高于该修复。',
        ),
    },
    {
      sourceId: 'src-mitre-cveawg-101078',
      query: L('MITRE cveawg API, all four VulDB-assigned deepseek-harness CVEs', 'MITRE cveawg API，全部 4 个由 VulDB 分配的 deepseek-harness CVE'),
      result:
        L(
          'All four PUBLISHED, dates 2026-09-28, with enumerated affected version lists and no fixed version; each record states the vendor was contacted and did not respond.',
          '4 条均为 PUBLISHED，日期 2026-09-28，列明受影响版本且未给出修复版本；每条记录都说明已联系厂商但未获回应。',
        ),
    },
    {
      sourceId: 'src-osv-querybatch',
      query: L('OSV API querybatch, package name only, all 288 installed @deepseek-ai packages', 'OSV API querybatch，仅按包名，全部 288 个已安装 @deepseek-ai 包'),
      result:
        L(
          'Zero advisories of any kind for every first-party package, with no version constraint applied.',
          '每一个一方包都为零公告，且未施加任何版本约束。',
        ),
    },
    {
      sourceId: 'src-osv-querybatch',
      query: L('OSV API querybatch, package + installed version, all 500 installed packages', 'OSV API querybatch，按包 + 已安装版本，全部 500 个已安装包'),
      result:
        L(
          'Exactly 2 vulnerable matches: @modelcontextprotocol/client 2.0.0 and http-cache-semantics 4.2.0, both recorded in ADVISORIES.',
          '恰好 2 个脆弱匹配：@modelcontextprotocol/client 2.0.0 与 http-cache-semantics 4.2.0，均已记入 ADVISORIES。',
        ),
    },
    {
      sourceId: 'src-gh-advisories-api',
      query: L('GitHub security-advisories API for deepseek-ai/deepseek-harness', 'deepseek-ai/deepseek-harness 的 GitHub 安全公告 API'),
      result: L('Empty list — the repository publishes no GitHub Security Advisories.', '返回空列表 —— 该仓库未发布任何 GitHub 安全公告。'),
    },
    {
      sourceId: 'src-gh-advisories-page',
      query: L('GitHub security advisory page for the repository', '该仓库的 GitHub 安全公告页面'),
      result: L('Reachable, and contains no GHSA identifier, consistent with the empty API list.', '可访问，且不含任何 GHSA 标识，与空列表的 API 结果一致。'),
    },
    {
      sourceId: 'src-npm-dsh-base',
      query: L('npm registry dist-tags and time map for @deepseek-ai/dsh-base and @deepseek-ai/dsh', '@deepseek-ai/dsh-base 与 @deepseek-ai/dsh 的 npm 注册表 dist-tags 与 time 映射'),
      result:
        L(
          'Release dates used by RELEASES: first artifact 2026-08-10, 0.1.7-rc.2 on 2026-09-24, 0.2.0-rc.1 on 2026-09-28, 0.2.0-rc.2 on 2026-09-29, 0.2.1-alpha.1 on 2026-10-03.',
          'RELEASES 使用的发布日期：首个产物 2026-08-10，0.1.7-rc.2 于 2026-09-24，0.2.0-rc.1 于 2026-09-28，0.2.0-rc.2 于 2026-09-29，0.2.1-alpha.1 于 2026-10-03。',
        ),
    },
  ],
  notFound: [
    L(
      'No CVE, GHSA or OSV advisory whose affected range includes 0.2.0-rc.2 of any @deepseek-ai package: the OSV name query returns nothing for all 288 first-party packages and the repository has no published GitHub Security Advisories.',
      '没有任何 CVE、GHSA 或 OSV 公告的受影响范围包含任何 @deepseek-ai 包的 0.2.0-rc.2：按包名的 OSV 查询对全部 288 个一方包都没有返回结果，且该仓库没有发布任何 GitHub 安全公告。',
    ),
    L(
      'No npm-ecosystem advisory for any @deepseek-ai package: the five DeepSeek Harness CVEs are product-level records naming no npm package at all.',
      '没有任何针对 @deepseek-ai 包的 npm 生态公告：这 5 个 DeepSeek Harness CVE 是产品级记录，完全没有指明任何 npm 包。',
    ),
    L(
      'No vendor security bulletin, SECURITY.md advisory page or DeepSeek-published fix version: no such page was found, and the four VulDB-assigned records state the vendor did not respond.',
      '没有厂商安全公告、SECURITY.md 公告页面或 DeepSeek 发布的修复版本：未找到此类页面，且 4 条由 VulDB 分配的记录都说明厂商未回应。',
    ),
    L(
      'No third-party dependency advisories beyond the two recorded here: every other installed version is outside every published affected range as of 2026-10-07.',
      '除本文记录的 2 条外，没有其他第三方依赖公告：截至 2026-10-07，其余所有已安装版本都在所有已发布受影响范围之外。',
    ),
    L(
      'No exploit code, proof-of-concept or CVSS score was taken from anywhere but the records cited; no score was computed or inferred.',
      '漏洞利用代码、概念验证或 CVSS 评分均只取自所引用的记录；没有任何评分是计算或推断出来的。',
    ),
  ],
  limitations: [
    L(
      'CVE-2026-101078 names the Linux Landlock backend (packages/sandbox/sandbox-local/src/profiles.ts). This install runs on macOS and dsh-sandbox-local selects its platform runner automatically; whether the macOS runner shares the flaw was NOT verified and is not claimed.',
      'CVE-2026-101078 指的是 Linux 上的 Landlock 后端（packages/sandbox/sandbox-local/src/profiles.ts）。本次安装运行在 macOS 上，dsh-sandbox-local 会自动选择平台运行器；macOS 运行器是否同样存在该缺陷未经核实，本文也不作此主张。',
    ),
    L(
      'The two dependency records are range hits, not proof of exploitability here: the MCP advisory needs the SDK\u2019s OAuth-over-HTTP path against an untrusted server (no MCP server is enabled by default), and no fixed version of http-cache-semantics is published yet.',
      '这两条依赖记录是范围命中，并不证明在本机可利用：MCP 公告需要针对不可信服务器使用 SDK 的 HTTP OAuth 路径（默认不启用任何 MCP 服务器），而 http-cache-semantics 目前尚未发布修复版本。',
    ),
    L(
      'Documented residual risk that is not a vulnerability record: dsh-credentials-local keeps secrets readable only by the OS user, but agent tool processes run as that same user, so the store cannot isolate secrets from the agent.',
      '属于文档化的残余风险，不是漏洞记录：dsh-credentials-local 让密钥只对操作系统用户可读，但智能体工具进程以同一用户运行，因此该存储无法把密钥与智能体隔离。',
    ),
    L(
      'Documented residual risk that is not a vulnerability record: interactive terminal tabs run with the execution environment\u2019s system-user permissions, independently of agent permissions.',
      '属于文档化的残余风险，不是漏洞记录：交互式终端标签以执行环境的系统用户权限运行，独立于智能体权限。',
    ),
    L(
      'Documented residual risk that is not a vulnerability record: the Code Mode worker is described by the vendor\u2019s own notes (quoted in CVE-2026-101102) as "containment, not a security boundary".',
      '属于文档化的残余风险，不是漏洞记录：厂商自己的说明（被 CVE-2026-101102 引用）把 Code Mode worker 描述为 “containment, not a security boundary”。',
    ),
    L(
      'Every claim was read on 2026-10-07; advisory databases change, so this dataset is a dated snapshot rather than a live feed.',
      '所有主张均于 2026-10-07 读取；公告数据库会变化，因此本数据集是带日期的快照，而不是实时数据源。',
    ),
  ],
  counts: {
    advisories: 13,
    affectingInstalled: 2,
    dshProductRecords: 5,
    dependencyRecords: 2,
    hardeningFacts: 6,
  },
  sources: [
    'src-nvd-search-harness',
    'src-nvd-search-deepseek',
    'src-nvd-82533',
    'src-mitre-cveawg-101078',
    'src-osv-querybatch',
    'src-gh-advisories-api',
    'src-gh-advisories-page',
    'src-npm-dsh-base',
    'src-npm-dsh',
    'src-gh-repo',
  ],
})
