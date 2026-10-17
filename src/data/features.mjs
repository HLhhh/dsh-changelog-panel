// FEATURES — one row per shipped capability, grounded in the README of the
// package that owns it. Every `packages` entry exists in the extracted install
// (288 @deepseek-ai packages, 0.2.0-rc.2) and every `source` is the repo-relative
// README path taken from that package's own `repository.directory` field.
// verify.mjs re-derives both facts from the extracted tree when it is present.
//
// Plain ESM, no imports, no I/O — this module is inlined into lib/client.js.

export const FEATURES = Object.freeze([
  // ── agent ────────────────────────────────────────────────────────────────
  {
    id: 'agent-loop',
    version: '0.2.0-rc.2',
    category: 'agent',
    title: L('Agent loop drives turns, tools and streaming', '智能体循环驱动轮次、工具与流式输出'),
    summary:
      L(
        'Creates fresh agents or resumes persisted sessions, then drives each turn through model requests, streamed responses, tool execution and durable session history. A parallel tool-call cap bounds concurrency while exclusive calls keep their ordering, and cancellation preserves text already streamed to the user.',
        '创建全新的智能体，或恢复已持久化的会话，然后驱动每个轮次依次完成模型请求、流式响应、工具执行与持久会话历史。并行工具调用上限约束并发量，独占调用保持其顺序，取消操作会保留已经流式送达用户的文本。',
      ),
    packages: ['@deepseek-ai/dsh-agent-loop', '@deepseek-ai/dsh-agent'],
    source: 'packages/core/agent-loop/README.md',
  },
  {
    id: 'agent-presets',
    version: '0.2.0-rc.2',
    category: 'agent',
    title: L('Declarative agent presets per composition', '按组合声明智能体预设'),
    summary:
      L(
        'Declares an agent\u2019s tools, prompt sections and skills in ordinary Cordis YAML, so one process can run several compositions and a session can select one. Failed definitions stay visible while existing agents keep the composition they already use.',
        '用普通 Cordis YAML 声明智能体的工具、提示词片段与技能，因此一个进程可运行多套组合，会话可选择其中一套。定义失败仍会显示出来，而既有智能体继续使用它们已在用的那套组合。',
      ),
    packages: ['@deepseek-ai/dsh-agent-preset-registry', '@deepseek-ai/dsh-agent-preset'],
    source: 'packages/preset/agent-preset-registry/README.md',
  },
  {
    id: 'workspace-instructions',
    version: '0.2.0-rc.2',
    category: 'agent',
    title: L('Loads AGENTS.md workspace instructions', '加载 AGENTS.md 工作区指令'),
    summary:
      L(
        'Feeds agents the applicable user-global and project-level AGENTS.md-compatible guidance chain for the first request, with a byte budget that drops broader files before truncating the most specific one. Later filesystem operations discover newly relevant nested files and resume reconciles the baseline.',
        '在首个请求前向智能体提供适用的用户级与项目级 AGENTS.md 兼容指令链，并设有字节预算：先丢弃范围更宽的文件，再截断最具体的文件。后续的文件系统操作会发现新近相关的嵌套文件，而会话恢复会重新对齐基线。',
      ),
    packages: ['@deepseek-ai/dsh-agent-instructions'],
    source: 'packages/context/agent-instructions/README.md',
  },
  {
    id: 'context-compaction',
    version: '0.2.0-rc.2',
    category: 'agent',
    title: L('Condenses old context before the limit', '在触达上限前压缩旧上下文'),
    summary:
      L(
        'As token pressure builds it condenses the oldest history into a summary while preserving recent messages, and after a context-overflow error it condenses and retries. `/compact` requests it on demand, and oversized tool results can optionally be trimmed first.',
        '随着 token 压力上升，它把最旧的历史压缩成摘要，同时保留近期消息；出现上下文超限错误后，它会压缩并重试。`/compact` 可按需触发，过大的工具结果也可以选择先裁剪。',
      ),
    packages: ['@deepseek-ai/dsh-compaction-basic', '@deepseek-ai/dsh-command-compact'],
    source: 'packages/compaction/compaction-basic/README.md',
  },
  {
    id: 'plan-mode',
    version: '0.2.0-rc.2',
    category: 'agent',
    title: L('Plan mode with a reviewed plan before acting', '先给出经审阅的计划再执行'),
    summary:
      L(
        'Asks the agent to explore and design before execution, then presents the finished plan for approval; `/plan` enters it, `/plan off` or review feedback leaves it. The active state survives session resume and forks, and the composer shows a plan-mode chip.',
        '让智能体在动手前先探索与设计，再把完成的计划提交审批；`/plan` 进入该模式，`/plan off` 或审阅反馈可退出。该状态在会话恢复与派生（fork）后仍然保留，输入区会显示计划模式标记。',
      ),
    packages: ['@deepseek-ai/dsh-plan-mode', '@deepseek-ai/dsh-client-ui-plan'],
    source: 'packages/plan/plan-mode/README.md',
  },
  {
    id: 'durable-goals',
    version: '0.2.0-rc.2',
    category: 'agent',
    title: L('Goals that persist across resume and restart', '跨恢复与重启持久存在的目标'),
    summary:
      L(
        'One long-running completion objective persists across turns, session resume, fork and process restarts, with compare-and-set edits, pause/resume/complete/block, and a configurable round cap that bounds automatic continuation in the same session.',
        '一个长期存在的完成目标可跨轮次、会话恢复、派生与进程重启持续存在，支持比较并设置（compare-and-set）式编辑、暂停/恢复/完成/阻塞，以及一个可配置的轮次上限，用来约束同一会话内的自动续跑。',
      ),
    packages: [
      '@deepseek-ai/dsh-goal',
      '@deepseek-ai/dsh-goal-round-driver',
      '@deepseek-ai/dsh-tool-goal',
    ],
    source: 'packages/goal/goal/README.md',
  },

  // ── ui ───────────────────────────────────────────────────────────────────
  {
    id: 'web-gui',
    version: '0.2.0-rc.2',
    category: 'ui',
    title: L('Browser GUI for chat, models and sessions', '浏览器图形界面：对话、模型与会话'),
    summary:
      L(
        '`dsh --profile web` opens an interactive browser GUI with chat, model and settings management and session history, using the same model access, tools and safety defaults as the other dsh surfaces. Startup prints an authenticated URL and respects `--no-open` and custom ports.',
        '`dsh --profile web` 打开交互式浏览器图形界面，包含对话、模型与设置管理以及会话历史，使用与其他 dsh 表面相同的模型访问、工具与安全默认值。启动时会打印带认证的 URL，并遵循 `--no-open` 与自定义端口。',
      ),
    packages: ['@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-web-frontend'],
    source: 'packages/bundle/web-app/README.md',
  },
  {
    id: 'panel-layout',
    version: '0.2.0-rc.2',
    category: 'ui',
    title: L('Three-column shell with an edge panel track', '三栏外壳与边缘面板轨道'),
    summary:
      L(
        'The three-column AppFrame with edge-column widths: the right column concedes space before the centre, its occupant can render fullscreen while the wide-screen track stays underneath, and `ctx.layout` owns the presentation control that plugins like this panel use.',
        '带边缘列宽度的三栏 AppFrame：右栏先让出空间再占用中栏，其占用者可全屏渲染，而宽屏轨道仍保留在下方；`ctx.layout` 负责本面板这类插件所用的呈现控制。',
      ),
    packages: ['@deepseek-ai/dsh-client-ui-layout'],
    source: 'packages/client/ui-layout/README.md',
  },
  {
    id: 'trajectory-view',
    version: '0.2.0-rc.2',
    category: 'ui',
    title: L('Trajectory ledger with timing overview', '轨迹账本与耗时总览'),
    summary:
      L(
        'Inspects agent activity as a turn-aware ledger grouped by User, Assistant, Tool, nested Subtool and compaction records, with a record inspector for tokens, duration and payloads. Long histories open at the tail, page older records on demand and render only visible rows.',
        '以轮次感知的账本形式查看智能体活动，按 User、Assistant、Tool、嵌套 Subtool 与压缩记录分组，并提供记录检查器查看 token、耗时与载荷。较长的历史从尾部打开，按需向前分页加载，且只渲染可见行。',
      ),
    packages: ['@deepseek-ai/dsh-client-ui-trajectory'],
    source: 'packages/client/ui-trajectory/README.md',
  },
  {
    id: 'changed-files',
    version: '0.2.0-rc.2',
    category: 'ui',
    title: L('Changed-files and delivery cards per turn', '每轮的变更文件与交付卡片'),
    summary:
      L(
        'Renders the changed-files card a finished turn ends with, the review tab that compares each changed file, explicit delivery cards, and inline-code file links that open in the right sidebar. Listed and linked paths come from recorded mutations and deliveries, never from prose.',
        '渲染一轮结束时出现的变更文件卡片、用于对比每个变更文件的审阅标签页、显式交付卡片，以及可打开右侧栏的内联代码文件链接。列出与链接的路径来自已记录的改动与交付，而不是来自散文描述。',
      ),
    packages: ['@deepseek-ai/dsh-client-ui-deliverables', '@deepseek-ai/dsh-workspace-changes'],
    source: 'packages/client/ui-deliverables/README.md',
  },
  {
    id: 'background-jobs',
    version: '0.2.0-rc.2',
    category: 'ui',
    title: L('Background job list with streaming output', '后台作业列表与流式输出'),
    summary:
      L(
        'Shows the session\u2019s background jobs in one header control with lifecycle, elapsed time, progress and terminal detail; live jobs and settled jobs with retained output get expandable output panels, and collapsing stops the stream.',
        '在一个头部控件中显示会话的后台作业，含生命周期、已用时间、进度与终端细节；进行中的作业以及保留输出的已结束作业可展开输出面板，折叠即停止流式传输。',
      ),
    packages: ['@deepseek-ai/dsh-client-ui-jobs', '@deepseek-ai/dsh-jobs-local'],
    source: 'packages/client/ui-jobs/README.md',
  },
  {
    id: 'file-references',
    version: '0.2.0-rc.2',
    category: 'ui',
    title: L('One @ menu for files, folders and sessions', '一个 @ 菜单引用文件、目录与会话'),
    summary:
      L(
        'A single `@` completion menu lists files before sessions, inserts atomic references with a stable clipboard form, lets folder rows descend without closing completion, and keeps each group available when the other cannot load. Session mentions are validated before any model context is captured.',
        '单一 `@` 补全菜单先列文件再列会话，插入带稳定剪贴板形式的原子引用，允许目录行继续下钻而不关闭补全，并在其中一类无法加载时仍保留另一类可用。会话引用在捕获任何模型上下文之前会先做校验。',
      ),
    packages: ['@deepseek-ai/dsh-client-ui-reference', '@deepseek-ai/dsh-file-reference-local'],
    source: 'packages/client/ui-reference/README.md',
  },

  // ── tools ────────────────────────────────────────────────────────────────
  {
    id: 'file-tools',
    version: '0.2.0-rc.2',
    category: 'tools',
    title: L('Read, write and edit tools over ctx.fs', '基于 ctx.fs 的读、写、编辑工具'),
    summary:
      L(
        'Gives the model line-numbered UTF-8 reads, image reads, atomic file creation or replacement, and targeted literal edits, with capped results and stable error codes plus recovery instructions on failure. Mutations stay atomic even when no observation policy is mounted.',
        '为模型提供带行号的 UTF-8 读取、图片读取、原子创建或替换文件，以及定向的字面量编辑；结果有上限，失败时给出稳定错误码与恢复指引。即使未挂载观察策略，改动也保持原子。',
      ),
    packages: ['@deepseek-ai/dsh-tool-fs', '@deepseek-ai/dsh-fs-local'],
    source: 'packages/fs/tool-fs/README.md',
  },
  {
    id: 'search-tools',
    version: '0.2.0-rc.2',
    category: 'tools',
    title: L('Bundled glob and grep discovery tools', '内置 glob 与 grep 发现工具'),
    summary:
      L(
        'Adds `glob` file discovery and `grep` content search over the local workspace with no host ripgrep installation required. Results are workdir-relative, include hidden and ignored files while excluding VCS metadata, and stay fully recoverable through the spill store when caps trim output.',
        '在本地工作区上提供 `glob` 文件发现与 `grep` 内容搜索，无需在主机上安装 ripgrep。结果相对于工作目录，包含隐藏与被忽略的文件但排除 VCS 元数据，且在上限裁剪输出后仍可通过 spill 存储完整取回。',
      ),
    packages: ['@deepseek-ai/dsh-tool-fs-search'],
    source: 'packages/fs/tool-fs-search/README.md',
  },
  {
    id: 'bash-tool',
    version: '0.2.0-rc.2',
    category: 'tools',
    title: L('bash tool with background jobs and escalation', 'bash 工具：后台作业与提权'),
    summary:
      L(
        'Runs Bash commands and returns stdout, stderr and exit markers in a fresh shell, receiving the managed `DSH_*` environment. With a job registry composed every command is a job, so background runs and timed-out foreground runs return an id for `job_output` and `job_kill`.',
        '在全新的 shell 中运行 Bash 命令并返回 stdout、stderr 与退出标记，同时获得受管的 `DSH_*` 环境。组合了作业注册表后，每条命令都是一个作业，因此后台运行和超时的前台运行都会返回 id，供 `job_output` 与 `job_kill` 使用。',
      ),
    packages: [
      '@deepseek-ai/dsh-tool-bash',
      '@deepseek-ai/dsh-bash-local',
      '@deepseek-ai/dsh-shell-env',
    ],
    source: 'packages/shell/tool-bash/README.md',
  },
  {
    id: 'web-tools',
    version: '0.2.0-rc.2',
    category: 'tools',
    title: L('web_search and web_fetch tools', 'web_search 与 web_fetch 工具'),
    summary:
      L(
        'Lets models search the web and retrieve pages, each tool independently configurable. Provider-controlled text is labelled external and untrusted, fetched HTML excludes active and hidden content, and a missing provider leaves the tool visible with a structured error.',
        '让模型搜索网页并抓取页面，两者可独立配置。由提供方控制的文本会标注为外部且不可信，抓取的 HTML 会排除活动与隐藏内容；提供方缺失时工具仍然可见，并返回结构化错误。',
      ),
    packages: [
      '@deepseek-ai/dsh-tool-web',
      '@deepseek-ai/dsh-web-search-deepseek',
      '@deepseek-ai/dsh-web-fetch-http',
    ],
    source: 'packages/web/tool-web/README.md',
  },
  {
    id: 'subagents',
    version: '0.2.0-rc.2',
    category: 'tools',
    title: L('Delegate to subagents and steer them', '委派子智能体并对其进行引导'),
    summary:
      L(
        'Delegation tools start fresh in-process children that inherit the parent\u2019s workspace, session lineage, provider and limits, while `send_message`, `interrupt_agent` and `list_agents` steer continuable children between turns without discarding their inbox or descendants.',
        '委派工具会启动全新的进程内子智能体，它们继承父级的工作区、会话血缘、提供方与各项上限；而 `send_message`、`interrupt_agent` 与 `list_agents` 可在轮次之间引导可续跑的子智能体，且不会丢弃其收件箱或后代。',
      ),
    packages: [
      '@deepseek-ai/dsh-tool-subagent',
      '@deepseek-ai/dsh-tool-subagent-control',
      '@deepseek-ai/dsh-subagent-spawn-in-process',
    ],
    source: 'packages/subagent/tool-subagent/README.md',
  },
  {
    id: 'mcp-tools',
    version: '0.2.0-rc.2',
    category: 'tools',
    title: L('Use tools and resources from MCP servers', '使用 MCP 服务器提供的工具与资源'),
    summary:
      L(
        'Connects external Model Context Protocol servers one entry at a time, exposing their tools under `mcp__<server>__<tool>` names, with shared resource discovery and reading. No server is enabled by default and an empty caller scope adds no tools or prompt text.',
        '逐个连接外部 Model Context Protocol 服务器，把它们的工具以 `mcp__<server>__<tool>` 名称暴露出来，并共享资源发现与读取能力。默认不启用任何服务器，调用方作用域为空时不会添加任何工具或提示词文本。',
      ),
    packages: ['@deepseek-ai/dsh-mcp-client', '@deepseek-ai/dsh-mcp-resources'],
    source: 'packages/mcp/mcp-client/README.md',
  },

  // ── sessions ─────────────────────────────────────────────────────────────
  {
    id: 'session-log',
    version: '0.2.0-rc.2',
    category: 'sessions',
    title: L('Append-only log records every model fact', '追加式日志记录每个模型可见事实'),
    summary:
      L(
        'Records every model-visible fact in an append-only session log and derives model history from that record, so consumers can inspect, replay, fork and flush sessions while preserving historical events. Compaction hides superseded entries from the active conversation without deleting them.',
        '把每个模型可见的事实记录到追加式会话日志中，并从该记录推导模型历史，因此消费方可检查、重放、派生与刷新会话，同时保留历史事件。压缩会让被取代的条目从活动对话中隐藏，但不删除它们。',
      ),
    packages: ['@deepseek-ai/dsh-session'],
    source: 'packages/core/session/README.md',
  },
  {
    id: 'session-persistence',
    version: '0.2.0-rc.2',
    category: 'sessions',
    title: L('Durable per-session JSONL logs', '每个会话一份持久 JSONL 日志'),
    summary:
      L(
        'Stores each session in a current append-only JSONL log and keeps immutable historical format generations \u2014 checksummed Zstandard frames by default, plain lines when compression is disabled \u2014 with format migration and torn-tail crash recovery handled inside the backend.',
        '把每个会话存入当前的追加式 JSONL 日志，并保留不可变的历史格式代际——默认是带校验和的 Zstandard 帧，关闭压缩时为纯文本行——格式迁移与尾部撕裂的崩溃恢复都在后端内部处理。',
      ),
    packages: ['@deepseek-ai/dsh-session-persistence-jsonl'],
    source: 'packages/session/session-persistence-jsonl/README.md',
  },
  {
    id: 'session-search',
    version: '0.2.0-rc.2',
    category: 'sessions',
    title: L('Ranked full-text search over session history', '会话历史的相关性全文搜索'),
    summary:
      L(
        'Adds ranked SQLite FTS5 search across all sessions or within one, with cursor pagination, over a separate derived index that reflects live and persisted state without modifying the session store. Exact reads, filters and relationship traces stay available through the same query API.',
        '在所有会话中或单个会话内添加带排序的 SQLite FTS5 搜索，支持游标分页；检索的是独立的派生索引，因此能反映实时与已持久化的状态而不修改会话存储。精确读取、过滤与关系追踪仍通过同一查询 API 提供。',
      ),
    packages: ['@deepseek-ai/dsh-session-query-sqlite', '@deepseek-ai/dsh-session-query'],
    source: 'packages/session-query/session-query-sqlite/README.md',
  },
  {
    id: 'session-export',
    version: '0.2.0-rc.2',
    category: 'sessions',
    title: L('Download a session tree as a ZIP', '把会话树导出为 ZIP'),
    summary:
      L(
        'A \u201cDownload session log\u201d menu item and an `/export` slash command hand the session tree \u2014 session, sub-sessions and attachments \u2014 to the browser as a ZIP through an authenticated Host streaming route.',
        '“Download session log” 菜单项与 `/export` 斜杠命令会通过带认证的 Host 流式路由，把会话树——会话、子会话与附件——以 ZIP 形式交给浏览器。',
      ),
    packages: ['@deepseek-ai/dsh-session-log-export'],
    source: 'packages/session-query/session-log-export/README.md',
  },
  {
    id: 'session-format-migration',
    version: '0.2.0-rc.2',
    category: 'sessions',
    title: L('Lossless migration of older session formats', '旧会话格式的无损迁移'),
    summary:
      L(
        'Opens sessions written by released older format generations as current ones without rewriting their stored generation, lifting tool results, renaming message sources, closing evidenced interrupted turns and appending missing parent catalog facts, with explicit refusal rules.',
        '把由已发布旧格式代际写入的会话按当前格式打开，而不改写其已存储的代际：提取工具结果、重命名消息来源、闭合有证据的中断轮次并补齐缺失的父目录事实，并配有明确的拒绝规则。',
      ),
    packages: [
      '@deepseek-ai/dsh-session-format-v3-to-v4',
      '@deepseek-ai/dsh-session-format-catalog',
      '@deepseek-ai/dsh-session-format',
    ],
    source: 'packages/session/session-format-v3-to-v4/README.md',
  },

  // ── security ─────────────────────────────────────────────────────────────
  {
    id: 'sandbox-policy',
    version: '0.2.0-rc.2',
    category: 'security',
    title: L('One file-effect policy for every tool call', '每次工具调用统一文件影响策略'),
    summary:
      L(
        'Applies a single file-effect policy to every confined bash, filesystem and terminal call: deployments choose the default mode and fallback workspace root, each session can switch modes independently, and the choice survives restart. The model receives the effective policy before each request.',
        '对每次受限的 bash、文件系统与终端调用应用同一份文件影响策略：部署方选择默认模式与后备工作区根目录，每个会话可独立切换模式，该选择在重启后保留。模型在每次请求前会收到生效的策略。',
      ),
    packages: ['@deepseek-ai/dsh-sandbox-policy', '@deepseek-ai/dsh-sandbox-local'],
    source: 'packages/sandbox/sandbox-policy/README.md',
  },
  {
    id: 'workspace-confined-writes',
    version: '0.2.0-rc.2',
    category: 'security',
    title: L('Writes confined to the session workspace', '写入被限制在会话工作区内'),
    summary:
      L(
        'Confines model file writes and edits to the session workspace or a platform temporary root in `workspace-write`, rejects every mutation in `read-only`, and reports denials as `FS_SANDBOX_DENIED` with the active mode and a same-turn escalation hint.',
        '在 `workspace-write` 下把模型的文件写入与编辑限制在会话工作区或平台临时根目录内，在 `read-only` 下拒绝任何改动，并把拒绝报告为 `FS_SANDBOX_DENIED`，附上当前模式与同一轮次内的提权提示。',
      ),
    packages: ['@deepseek-ai/dsh-fs-sandbox', '@deepseek-ai/dsh-fs'],
    source: 'packages/fs/fs-sandbox/README.md',
  },
  {
    id: 'approval-prompts',
    version: '0.2.0-rc.2',
    category: 'security',
    title: L('One-shot approvals that fail closed', '一次性审批，失败即关闭'),
    summary:
      L(
        'Requires a one-shot decision before a sensitive tool action proceeds: `ask` routes each request to the deployment\u2019s answerers, `never` rejects without prompting, and missing or failed answerers return `unavailable` so the action fails closed. Every request and outcome lands in the session audit log.',
        '敏感工具操作执行前需要一次性决定：`ask` 把每个请求交给部署方的应答者，`never` 直接拒绝而不提示，应答者缺失或失败会返回 `unavailable`，因此该操作失败即关闭。每个请求与结果都会写入会话审计日志。',
      ),
    packages: ['@deepseek-ai/dsh-user-approval', '@deepseek-ai/dsh-client-ui-approval'],
    source: 'packages/interaction/user-approval/README.md',
  },
  {
    id: 'permission-presets',
    version: '0.2.0-rc.2',
    category: 'security',
    title: L('Named permission presets per session', '按会话命名的权限预设'),
    summary:
      L(
        'Offers named permission modes that set sandbox and approval together while each enforcement service keeps its own value, provides future-session defaults, and exposes the current choice through the session projection. Unmatched knob combinations appear as `custom`.',
        '提供把沙箱与审批成组设置的命名权限模式，同时各执行服务保留自己的取值；预设为未来会话提供默认值，并通过会话投影暴露当前选择。不匹配的组合会显示为 `custom`。',
      ),
    packages: [
      '@deepseek-ai/dsh-permission-presets',
      '@deepseek-ai/dsh-client-ui-permission-presets',
    ],
    source: 'packages/interaction/permission-presets/README.md',
  },
  {
    id: 'read-before-edit',
    version: '0.2.0-rc.2',
    category: 'security',
    title: L('Read-before-edit with stale-read rejection', '先读后写，拒绝过期读取'),
    summary:
      L(
        'Makes filesystem tools require a successful read before overwriting or editing a file, and rejects the mutation when the file changed since that read with a clear instruction to re-read and retry. Reading a missing path authorizes guarded creation.',
        '要求文件系统工具在覆盖或编辑文件前先成功读取；若文件自那次读取后已变更，则拒绝该改动并明确提示重新读取后重试。读取一个不存在的路径即授权受保护的创建。',
      ),
    packages: ['@deepseek-ai/dsh-fs-observation-policy'],
    source: 'packages/fs/fs-observation-policy/README.md',
  },
  {
    id: 'atomic-writes',
    version: '0.2.0-rc.2',
    category: 'security',
    title: L('Atomic, symlink-safe file replacement', '原子且防符号链接的文件替换'),
    summary:
      L(
        'Replaces a file without exposing partial content or following a symlinked temporary path, using caller-selected permission bits on a fresh inode so an existing file\u2019s permissions can only narrow, and a writer lock that serialises read-modify-write cycles across processes.',
        '替换文件时不会暴露部分内容，也不会跟随符号链接的临时路径；在新 inode 上使用调用方选择的权限位，因此既有文件的权限只会收窄；写入锁跨进程串行化读-改-写周期。',
      ),
    packages: ['@deepseek-ai/dsh-atomic-write'],
    source: 'packages/util/atomic-write/README.md',
  },

  // ── platform ─────────────────────────────────────────────────────────────
  {
    id: 'core-bundle',
    version: '0.2.0-rc.2',
    category: 'platform',
    title: L('Shared core bundle for every dsh profile', '每个 dsh 配置档共享的核心包'),
    summary:
      L(
        'Every base-backed `dsh --profile` surface runs on this bundle, so those surfaces share one model connection, the full tool set, durable session history and the workspace safety defaults. Custom profiles name it first and layer their own patches on top.',
        '每个基于 base 的 `dsh --profile` 表面都运行在这个包上，因此这些表面共享同一个模型连接、完整工具集、持久会话历史与工作区安全默认值。自定义配置档先列出它，再在其上叠加自己的补丁。',
      ),
    packages: ['@deepseek-ai/dsh-base'],
    source: 'packages/bundle/base/README.md',
  },
  {
    id: 'local-web-host',
    version: '0.2.0-rc.2',
    category: 'platform',
    title: L('Local HTTP host for the web GUI', 'Web 图形界面的本地 HTTP 主机'),
    summary:
      L(
        'A `node:http` server where plugins register named routes, upgrade routes and one fallback handler, with fixed match order: exact over the whole table, then longest prefix, then fallback. The SPA dist server claims the fallback seat with traversal rejection and index fallback.',
        '一个 `node:http` 服务器，插件可在其中注册命名路由、升级路由与一个兜底处理器，匹配顺序固定：先整表精确匹配，再最长前缀，最后兜底。SPA dist 服务器占据兜底位置，带路径穿越拒绝与 index 回退。',
      ),
    packages: ['@deepseek-ai/dsh-host-webserver', '@deepseek-ai/dsh-host-frontend-static'],
    source: 'packages/host/webserver/README.md',
  },
  {
    id: 'hooks-bridge',
    version: '0.2.0-rc.2',
    category: 'platform',
    title: L('Run Claude Code and Codex hooks as-is', '原样运行 Claude Code 与 Codex 钩子'),
    summary:
      L(
        'Runs command hooks from an existing Claude Code `hooks.json`/settings file or Codex `hooks.json` during agent runs without a rewrite: they can block prompts or tool calls with model-visible reasons, attach conversation context, or force another model turn.',
        '在智能体运行期间运行来自既有 Claude Code `hooks.json`/设置文件或 Codex `hooks.json` 的命令钩子，无需改写：它们可以携带模型可见的理由阻止提示词或工具调用、附加对话上下文，或强制再进行一个模型轮次。',
      ),
    packages: [
      '@deepseek-ai/dsh-hooks-claude-code',
      '@deepseek-ai/dsh-hooks-codex',
      '@deepseek-ai/dsh-hook-protocol',
    ],
    source: 'packages/hooks/hooks-claude-code/README.md',
  },
  {
    id: 'sdk-server',
    version: '0.2.0-rc.2',
    category: 'platform',
    title: L('Stdio JSON-RPC server for SDK clients', '面向 SDK 客户端的 stdio JSON-RPC 服务'),
    summary:
      L(
        'Serves the SDK wire protocol over stdio so out-of-process clients can open one session per `sessionId`, queue prompts and stream every session event and agent status transition back. Stdout carries only JSON-RPC frames, and `shutdown` disposes the runtime and exits 0.',
        '通过 stdio 提供 SDK 线协议，使进程外客户端可按 `sessionId` 打开一个会话、排队提交提示词，并把每个会话事件与智能体状态变化流式回传。stdout 只承载 JSON-RPC 帧，`shutdown` 会释放运行时并以 0 退出。',
      ),
    packages: ['@deepseek-ai/dsh-sdk-jsonrpc-server', '@deepseek-ai/dsh-sdk-protocol'],
    source: 'packages/sdk/server/README.md',
  },

  // ── plugins ──────────────────────────────────────────────────────────────
  {
    id: 'client-plugin-bundles',
    version: '0.2.0-rc.2',
    category: 'plugins',
    title: L('Lazy browser bundles for client plugins', '客户端插件的惰性浏览器包'),
    summary:
      L(
        'Turns a package\u2019s `dsh.client` declaration into a loadable browser bundle: the host scans enabled Loader entries and composes the boot graph, a Web carrier serves each bundle over `/plugins`, and the browser loads them lazily so nothing runs until a plugin is first used.',
        '把包的 `dsh.client` 声明转换为可加载的浏览器包：Host 扫描已启用的 Loader 条目并组装启动图，Web 载体通过 `/plugins` 提供每个包，浏览器按需惰性加载，因此在插件首次使用前不会执行任何内容。',
      ),
    packages: ['@deepseek-ai/dsh-client-modules'],
    source: 'packages/client/modules/README.md',
  },
  {
    id: 'plugin-manager',
    version: '0.2.0-rc.2',
    category: 'plugins',
    title: L('Install and enable plugins from the GUI', '在图形界面中安装与启用插件'),
    summary:
      L(
        'Manages the profile\u2019s plugin bundles without editing configuration by hand: enable or disable rows, select installed bundles, install or remove external bundles, and watch the install run \u2014 from the Web sidebar or from an agent.',
        '无需手工编辑配置即可管理配置档的插件包：启用或禁用条目、选择已安装的包、安装或移除外部包，并查看安装的运行过程——可从 Web 侧边栏或由智能体完成。',
      ),
    packages: ['@deepseek-ai/dsh-plugin-manager', '@deepseek-ai/dsh-client-ui-plugin-manager'],
    source: 'packages/boot/plugin-manager/README.md',
  },
  {
    id: 'ui-slots',
    version: '0.2.0-rc.2',
    category: 'plugins',
    title: L('Typed UI slots and component factories', '带类型的 UI 插槽与组件工厂'),
    summary:
      L(
        'Lets web client plugins define and compose typed UI regions: ordinary Slots give parent-owned extension positions while Component Factories give reusable assemblies, and both derive scoped state, injection, locale and child-render props from declaration-merged types.',
        '让 Web 客户端插件定义并组合带类型的 UI 区域：普通 Slot 提供父级拥有的扩展位置，Component Factory 提供可复用装配，二者都从声明合并的类型推导作用域状态、注入、本地化与子渲染属性。',
      ),
    packages: ['@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-renderer'],
    source: 'packages/client/ui-slots/README.md',
  },
  {
    id: 'client-hmr',
    version: '0.2.0-rc.2',
    category: 'plugins',
    title: L('Live plugin reload without a page refresh', '无需刷新页面的插件热重载'),
    summary:
      L(
        'Keeps open Web pages in sync with the Host plugin graph and reloads rebuilt browser bundles: ordinary enable/disable changes take effect without reloading the page or restarting the Host, and a code rebuild replaces the affected plugin with fresh component state.',
        '让打开的 Web 页面与 Host 插件图保持同步并重载重建的浏览器包：普通的启用/禁用变更无需刷新页面或重启 Host 即可生效，代码重建会用全新的组件状态替换受影响的插件。',
      ),
    packages: ['@deepseek-ai/dsh-client-hmr'],
    source: 'packages/client/hmr/README.md',
  },
])
