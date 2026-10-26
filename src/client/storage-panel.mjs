/**
 * Storage panel: the browser half of the storage / garbage-collection view.
 *
 * It renders what the host half measured (`plugin/lib/storage-scan.js`) from the
 * report it wrote to `$DSH_HOME/storages/dsh-storage-panel/report.json`: what DSH
 * leaves on this SSD, what each thing costs, which conversation it belongs to, and
 * which parts can be reclaimed (through the OS trash, never unlink).
 *
 * `tests/build.mjs` concatenates this file into one scope with `live-data.mjs`,
 * `fetched.mjs` and `index.mjs`, so it imports nothing: `React`, `el` and `isArray`
 * are plain in-scope bindings, on the same contract `fetched.mjs` documents. Every
 * one of them is referenced from inside a function body only — the top level of this
 * file runs while the concatenated scope is still being initialised.
 *
 * The rule this panel exists to keep: **never claim something is safe when it is
 * not.**
 *
 *   - Sizes are printed exactly as the report measured them; nothing is re-measured
 *     or extrapolated. Percentages and bar widths are the only computed numbers,
 *     and both are derived from reported sizes and labelled as comparisons.
 *   - The scanner's `reason` strings are rendered verbatim; the panel never
 *     paraphrases them into something stronger.
 *   - A `confidence: 'low'` item reads as a suggestion ("低置信度 · 仅建议"), never
 *     as a recommendation.
 *   - A category whose `reclaim` is `'never'` (runtime binaries) is marked as
 *     not-to-be-deleted wherever it appears, and says why.
 *   - Subagent sessions are nested under the parent they were recovered from, so a
 *     reader can see that the two costs share one log.
 *
 * Wiring status, checked against the current `index.mjs` and its stylesheet:
 *
 * - New CSS classes (this file is the only source of them; the stylesheet must be
 *   extended before the panel looks finished):
 *     .dshcl-storage                view root
 *     .dshcl-storageSection         one section wrapper
 *     .dshcl-storageSummary         the top block (stats grid)
 *     .dshcl-storageStats           the stat grid
 *     .dshcl-storageStat            one stat cell
 *     .dshcl-storageStatLabel       the cell's label
 *     .dshcl-storageStatValue       the cell's value
 *     .dshcl-storageStatus          status/error banner
 *     .dshcl-storageStatusBusy      its loading tone
 *     .dshcl-storageStatusOk        its ready tone
 *     .dshcl-storageStatusError     its error tone
 *     .dshcl-storageStatusDetail    the muted part after "·"
 *     .dshcl-storageControls        the button cluster in a section head
 *     .dshcl-storageBtn             button override hook (see the reuse note below)
 *     .dshcl-storagePath            mono, breakable path or identifier text
 *     .dshcl-storageSize            a right-aligned measured size
 *     .dshcl-storageRow             one cost category row
 *     .dshcl-storageBar             bar track (the fill's width is inline)
 *     .dshcl-storageBarFill         bar fill
 *     .dshcl-storageReclaim         reclaim hint pill base
 *     .dshcl-storageReclaimNever    "do not delete" tone
 *     .dshcl-storageReclaimAll      "safe to regenerate" tone
 *     .dshcl-storageReclaimSome     "review" tone
 *     .dshcl-storageReclaimUnknown  "not stated by the scan" tone
 *     .dshcl-storageDetail          the nested detail list under a cost row
 *     .dshcl-storageDetailRow       one nested detail row
 *     .dshcl-storageDetailValue     that row's size
 *     .dshcl-storageWorkspace       the workspace path in a group head
 *     .dshcl-storageSession         one session row
 *     .dshcl-storageMeta            a muted facts line (session facts, selection)
 *     .dshcl-storageActions         a session row's button cluster
 *     .dshcl-storageSubs            the nested subagent list
 *     .dshcl-storageSubRow          one nested subagent row (indented)
 *     .dshcl-storagePlanRow         one reclaim plan item
 *     .dshcl-storagePlanRowLow      a low-confidence (suggestion-only) plan item
 *     .dshcl-storageReason          the scanner's reason text
 *     .dshcl-storageFoot            the plan's selection + trash footer
 *     .dshcl-storageArm             a select control that needs a second click
 *     .dshcl-storageArmOn           that control's armed state
 *   Rows and sections also carry `data-*` hooks for CSS and tests: `data-category`,
 *   `data-reclaim`, `data-plan-item`, `data-kind`, `data-confidence`, `data-guarded`,
 *   `data-selected`, `data-plan-kind`, `data-session-id`, `data-subagent`,
 *   `data-workspace`, `data-status`, `data-storage-section`, `data-storage-panel`.
 *
 * - Reused shared classes (no new rules needed): .dshcl-secHead, .dshcl-secVer,
 *   .dshcl-secSummary, .dshcl-notice, .dshcl-noticeTitle, .dshcl-empty,
 *   .dshcl-items, .dshcl-item, .dshcl-itemHead, .dshcl-itemTitle, .dshcl-pill,
 *   .dshcl-count, .dshcl-group, .dshcl-groupHead, .dshcl-liveDate, .dshcl-liveWarn,
 *   .dshcl-liveBtn, and the inline-list style CoverageNotice already uses.
 *   Buttons carry `dshcl-liveBtn dshcl-storageBtn`: the live section's button class
 *   is the base so buttons are usable and hoverable before the storage rules land,
 *   and the storage class is the override hook.
 *
 * - Dictionary keys added. The panel's keys are namespaced `storage.`; every string
 *   below is required unless marked optional (the optional ones are closed
 *   vocabularies whose zh/en fallbacks live in this file, and a dictionary entry
 *   with the same key wins over the fallback):
 *
 *     storage.title                   存储占用 / Storage on disk
 *     storage.status.idle             尚未读取报告 / Report not read yet
 *     storage.status.loading          正在读取报告… / Reading the report…
 *     storage.status.ready            报告已载入 / Report loaded
 *     storage.status.scanError        主机端扫描失败 / Host scan failed
 *     storage.status.readError        读取报告失败 / Could not read the report
 *     storage.refresh                 重新读取报告 / Reload report
 *     storage.refreshing              读取中… / Reading…
 *     storage.rescan                  请求重新扫描 / Rescan now
 *     storage.empty                   还没有存储报告。点下面的按钮让主机端扫描一次。 / No storage report yet. Use the button below to run a host-side scan.
 *     storage.summary.note            所有数字都来自主机端扫描报告，面板不做估算。 / Every number comes from the host scan report; the panel estimates nothing.
 *     storage.summary.total           磁盘占用合计 / Total on disk
 *     storage.summary.totalNote       各分类实测之和；未计量的分类不在其中。 / The sum of the measured categories; unmeasured ones are not included.
 *     storage.summary.reclaimable     可回收 / Reclaimable
 *     storage.summary.reclaimableNote 回收计划里所有条目的合计，不代表它们都已被确认可删。 / The sum of every item in the reclaim plan — not all of them are confirmed safe to delete.
 *     storage.summary.noPlan          报告里没有回收计划。 / The report carries no reclaim plan.
 *     storage.summary.generatedAt     扫描时间 / Scanned
 *     storage.summary.scanTime        扫描耗时 / Scan time
 *     storage.summary.ms              {n} 毫秒 / {n} ms
 *     storage.summary.sessions        会话 / Conversations
 *     storage.summary.sessionsValue   {n} 个（含 {subs} 个子会话） / {n} ({subs} subagents)
 *     storage.summary.dshVersion      本机 DSH 版本：{version} / Running DSH version: {version}
 *     storage.summary.dshVersionSource 来源：{source} / source: {source}
 *     storage.summary.home            DSH 目录 / DSH home
 *     storage.summary.workspace       工作区 / Workspace
 *     storage.reportError             扫描器报告了错误 / The scanner reported an error
 *     storage.cost.title              空间去向 / Where the space goes
 *     storage.cost.sub                按实测大小从大到小排列；条形是相对最大一项的比例，百分比是占已计量合计的比例。 / Largest measured first; each bar is relative to the biggest row and the percentage is of the measured total.
 *     storage.cost.share              占 {pct} / {pct} of the measured total
 *     storage.cost.detailNote         明细是实测的子目录；散落文件不单独列出，所以明细相加可能小于该行合计。 / Detail rows are the measured subdirectories; loose files are not listed separately, so they may add up to less than the row's total.
 *     storage.cost.unmeasured         本次扫描未计量 / not measured by this scan
 *     storage.cost.empty              报告里没有可分类的实测数据。 / The report has no measured categories.
 *     storage.cost.neverDetail        以下文件由 DSH 运行时使用：删除后 DSH 将无法运行。 / These files belong to the DSH runtime; deleting them stops DSH from running.
 *     storage.cost.attachments        {count} 个对象，其中 {orphans} 个没有任何会话引用（{size}） / {count} objects, {orphans} of them referenced by no session ({size})
 *     storage.cost.more               另有 {n} 项未显示 / {n} more not shown
 *     storage.cost.files              {n} 个文件 / {n} files
 *     storage.cost.profileActive      使用中 / in use
 *     storage.sessions.title          会话与占用 / Conversations and what they cost
 *     storage.sessions.sub            按工作区分组，组间与组内都按实测大小从大到小排列。 / Grouped by workspace; groups and rows are ordered by measured size, largest first.
 *     storage.sessions.shareNote      子会话与父会话共用同一份日志，因此列在父会话下面。 / Subagent sessions share the parent's log, so they are listed under it.
 *     storage.sessions.empty          报告里没有会话目录。 / The report lists no session directories.
 *     storage.sessions.unresolved     {n} 个子会话没能匹配到父会话，单独列出。 / {n} subagent sessions could not be matched to a parent and are listed on their own.
 *     storage.sessions.attributionOff 未能解压会话日志，子会话归属不可用。 / Session logs could not be decompressed, so subagent attribution is unavailable.
 *     storage.sessions.subCount       含 {n} 个子会话 / {n} subagents
 *     storage.group.unknown           未记录工作区 / No recorded workspace
 *     storage.group.subtotal          {sessions} 个会话 · {size} / {sessions} conversations · {size}
 *     storage.turns                   {n} 轮 / {n} turns
 *     storage.turnsUnknown            轮数未知 / turn count unknown
 *     storage.modified                最后修改 {date} / modified {date}
 *     storage.badge.pinned            已固定 / pinned
 *     storage.badge.archived          已归档 / archived
 *     storage.badge.unprojected       无投影 / no projection
 *     storage.badge.unprojectedTitle  这个会话没有缓存投影，标题与轮数无法读取。 / This session has no cached projection, so its title and turn count cannot be read.
 *     storage.badge.subagent          子会话 / subagent
 *     storage.badge.orphan            父会话未识别 / parent not identified
 *     storage.action.open             打开对话 / Open conversation
 *     storage.action.reveal           在访达中显示 / Show in Finder
 *     storage.subagent.otherCwd       运行目录 {cwd} / ran in {cwd}
 *     storage.plan.title              回收计划 / Reclaim plan
 *     storage.plan.sub                {n} 项 · 合计 {size} / {n} items · {size} total
 *     storage.plan.scope              计划只包含配置档案、浏览器缓存、无引用附件和已归档会话；运行时二进制不在其中。 / The plan only ever covers plugin profiles, browser cache, unreferenced attachments and archived sessions; runtime binaries are never in it.
 *     storage.plan.disclaimer         条目与理由都来自扫描器；标为「仅建议」的条目只是线索，不是结论。 / Items and reasons come from the scanner; anything marked “suggestion only” is a lead, not a verdict.
 *     storage.plan.empty              这份报告里没有可回收项。 / This report has nothing to reclaim.
 *     storage.plan.select             选择 / Select
 *     storage.plan.deselect           取消选择 / Deselect
 *     storage.plan.confirmSelect      再次点击确认 / Click again to confirm
 *     storage.plan.armTitle           这一项影响较大：需要点两次才会被选中。 / This item matters: it takes two clicks to select it.
 *     storage.plan.trash              移到废纸篓 / Move to Trash
 *     storage.plan.trashing           正在移到废纸篓… / Moving to Trash…
 *     storage.plan.trashNote          项目会被移到系统废纸篓，可在访达里「放回原处」还原。 / Items go to the OS Trash and can be put back from Finder.
 *     storage.plan.selected           已选 {n} 项 · {size} / {n} selected · {size}
 *     storage.result.title            上次回收结果 / Last reclaim result
 *     storage.result.moved            已移到废纸篓 {n} 项 / {n} moved to the Trash
 *     storage.result.failed           失败 {n} 项 / {n} failed
 *     storage.result.skipped          跳过 {n} 项 / {n} skipped
 *     storage.workdir.title         其他窗口的产物 / Files from other windows
 *     storage.workdir.sub           每个窗口在自己的工作目录里生成的文件… / What each window generated in its own working directory…
 *     storage.workdir.sessions     {n} 个会话 / {n} session(s)
 *     storage.workdir.contains     {n} 个子窗口已并入下方，不计入本行 {size} / {n} nested window(s) counted below, excluded here ({size})
 *     storage.workdir.dedupe       嵌套目录已去重，避免重复计算 {size} / Nested directories deduplicated; {size} counted once
 *     storage.workdir.notReclaimable 这些是你自己的项目文件，不列为可回收 / Your own project files; never offered for reclamation
 *     storage.workdir.flat          目录下没有子目录，文件直接在根目录 / No subdirectories; files sit in the root
 *     storage.workdir.allNested     全部在子窗口内 / all inside nested windows
 *     storage.workdir.missing       这个目录已经不在了 / This directory no longer exists
 *     storage.workdir.empty         没有记录到任何工作目录 / No working directory recorded
 *     storage.result.refreshHint      重新读取报告即可刷新上面的列表。 / Reload the report to refresh the list above.
 *
 *   Optional (closed vocabularies; the zh/en fallbacks are inline below, and a
 *   dictionary entry under the same key wins over the fallback):
 *     storage.category.runtimes      运行时二进制 / Runtime binaries
 *     storage.category.plugins       插件配置档案 / Plugin profiles
 *     storage.category.sessions      会话日志 / Session logs
 *     storage.category.attachments   附件对象 / Attachment objects
 *     storage.category.browserCache  浏览器缓存 / Browser cache
 *     storage.category.caches        缓存与索引 / Caches and indexes
 *     storage.category.workspace     工作区文件 / Workspace files
 *     storage.category.other         其他（未计量） / Other (not measured)
 *     storage.reclaim.never          不建议删除 / Do not delete
 *     storage.reclaim.all            可安全重建 / Safe to regenerate
 *     storage.reclaim.some           需要自行判断 / Review before deleting
 *     storage.reclaim.unknown        扫描器未标注 / Not stated by the scan
 *     storage.confidence.high        高置信度 / high confidence
 *     storage.confidence.medium      中置信度 / medium confidence
 *     storage.confidence.low         低置信度 · 仅建议 / low confidence · suggestion only
 *     storage.plan.kind.profile      配置档案 / Plugin profile
 *     storage.plan.kind.browserCache 浏览器缓存 / Browser cache
 *     storage.plan.kind.attachment   附件对象 / Attachment object
 *     storage.plan.kind.session      已归档会话 / Archived session
 *     storage.plan.kind.other        其他 / Other
 *
 * - Report fields consumed, all verbatim from `scanStorage()`/`planCleanup()`:
 *   version, generatedAt, scanMs, error, host, totals, grandTotal, categories,
 *   runtimes.children, profiles, sessions, subagents, attachments, browserCache,
 *   caches.breakdown, workspace, plan.items, plan.bytes, plan.byKind.
 *
 * @module dsh-changelog-panel/storage-panel
 */

// ── vocabulary ──────────────────────────────────────────────────────────────
// Closed vocabularies carry their zh/en fallback inline, exactly like
// `NOTE_CATEGORY_LABEL` in fetched.mjs: a dictionary entry under the same key wins,
// so the panel reads correctly before the dictionaries are extended and keeps
// reading correctly afterwards.

/**
 * Cost category labels. The ids and their `reclaim` values come from `CATEGORIES`
 * in `plugin/lib/storage-scan.js`; `other` is the one category that list names but
 * the scan does not measure.
 */
const STORAGE_CATEGORY_LABEL = {
  runtimes: { key: 'storage.category.runtimes', zh: '运行时二进制', en: 'Runtime binaries' },
  plugins: { key: 'storage.category.plugins', zh: '插件配置档案', en: 'Plugin profiles' },
  sessions: { key: 'storage.category.sessions', zh: '会话日志', en: 'Session logs' },
  attachments: { key: 'storage.category.attachments', zh: '附件对象', en: 'Attachment objects' },
  browserCache: { key: 'storage.category.browserCache', zh: '浏览器缓存', en: 'Browser cache' },
  caches: { key: 'storage.category.caches', zh: '缓存与索引', en: 'Caches and indexes' },
  workspace: { key: 'storage.category.workspace', zh: '工作区文件', en: 'Workspace files' },
  other: { key: 'storage.category.other', zh: '其他（未计量）', en: 'Other (not measured)' },
}

/**
 * What a category's `reclaim` value means, and how it is marked.
 *
 * `never` is the one that must never look like an invitation: it is the runtime
 * the harness itself runs on. `why` is the sentence shown next to it, kept to what
 * `storage-scan.js` states ("deleting them breaks the harness").
 */
const STORAGE_RECLAIM_LABEL = {
  never: {
    key: 'storage.reclaim.never',
    zh: '不建议删除',
    en: 'Do not delete',
    icon: '🔒',
    tone: 'dshcl-storageReclaim dshcl-storageReclaimNever',
    whyZh: '运行时二进制：删除后 DSH 无法运行',
    whyEn: 'Runtime binaries: DSH cannot run without them',
  },
  all: {
    key: 'storage.reclaim.all',
    zh: '可安全重建',
    en: 'Safe to regenerate',
    icon: '♻️',
    tone: 'dshcl-storageReclaim dshcl-storageReclaimAll',
    whyZh: 'DSH 会在需要时重新生成',
    whyEn: 'DSH regenerates this on demand',
  },
  some: {
    key: 'storage.reclaim.some',
    zh: '需要自行判断',
    en: 'Review before deleting',
    icon: '🔍',
    tone: 'dshcl-storageReclaim dshcl-storageReclaimSome',
    whyZh: '可能包含仍然需要的内容，删除前请核实',
    whyEn: 'may still hold something you need; check before deleting',
  },
  unknown: {
    key: 'storage.reclaim.unknown',
    zh: '扫描器未标注',
    en: 'Not stated by the scan',
    icon: '❔',
    tone: 'dshcl-storageReclaim dshcl-storageReclaimUnknown',
    whyZh: '报告没有说明这一类的可回收性',
    whyEn: 'the report does not state whether this category is reclaimable',
  },
}

/**
 * How much weight a plan item's `confidence` carries.
 *
 * An unstated confidence resolves to `low`, because the panel must not upgrade an
 * unknown claim into a recommendation. `low` reads as a suggestion in its own text;
 * the amber tone and `.dshcl-storagePlanRowLow` only support that wording.
 */
const STORAGE_CONFIDENCE_LABEL = {
  high: {
    key: 'storage.confidence.high',
    zh: '高置信度',
    en: 'high confidence',
    color: 'var(--dsw-alias-state-success-primary,#2f9e63)',
    hintZh: '扫描器列出了可核查的迹象',
    hintEn: 'the scanner lists checkable signals',
  },
  medium: {
    key: 'storage.confidence.medium',
    zh: '中置信度',
    en: 'medium confidence',
    color: 'var(--dsw-alias-state-info-primary,#3b7ddd)',
    hintZh: '依据较弱，建议先核实',
    hintEn: 'weaker evidence; check before acting',
  },
  low: {
    key: 'storage.confidence.low',
    zh: '低置信度 · 仅建议',
    en: 'low confidence · suggestion only',
    color: 'var(--dsw-alias-state-warning-primary,#c58a20)',
    hintZh: '这只是线索，不是结论',
    hintEn: 'this is a lead, not a verdict',
  },
}

/** Reclaim plan item kinds, from `planCleanup()`. */
const STORAGE_KIND_LABEL = {
  profile: { key: 'storage.plan.kind.profile', zh: '配置档案', en: 'Plugin profile' },
  browserCache: { key: 'storage.plan.kind.browserCache', zh: '浏览器缓存', en: 'Browser cache' },
  attachment: { key: 'storage.plan.kind.attachment', zh: '附件对象', en: 'Attachment object' },
  session: { key: 'storage.plan.kind.session', zh: '已归档会话', en: 'Archived session' },
  other: { key: 'storage.plan.kind.other', zh: '其他', en: 'Other' },
}

/** Render order of plan kinds: biggest decision first, trivia last. */
const STORAGE_KIND_ORDER = ['profile', 'browserCache', 'attachment', 'session']

/**
 * Tone classes for the status banner, following `LIVE_STATUS_CLASS` in fetched.mjs:
 * the key is the tone `renderStorageStatus` accepts, the value is the class string.
 * Exported because the panel's other views may reuse the same four tones.
 */
const STORAGE_STATUS = {
  idle: 'dshcl-storageStatus',
  loading: 'dshcl-storageStatus dshcl-storageStatusBusy',
  ready: 'dshcl-storageStatus dshcl-storageStatusOk',
  error: 'dshcl-storageStatus dshcl-storageStatusError',
}

/** Default banner text per tone, used when the caller passes no message. */
const STORAGE_STATUS_KEY = {
  idle: 'storage.status.idle',
  loading: 'storage.status.loading',
  ready: 'storage.status.ready',
  error: 'storage.status.scanError',
}

/** Detail rows the cost breakdown shows per category before it counts the rest. */
const STORAGE_DETAIL_LIMIT = 5

/** How long an armed (two-step) select control stays armed. */
const STORAGE_ARM_TIMEOUT_MS = 6000

/** 1024-based size units; the report measures bytes, so this is display only. */
const STORAGE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

// ── formatting ──────────────────────────────────────────────────────────────

/**
 * Human-readable size, 1024-based.
 *
 * One decimal below ten so small values keep their shape (`1.0 MB`), none at ten
 * and above (`500 MB`) so a row of numbers stays scannable. A value that would
 * round to a full 1024 of its unit is promoted instead, so no unit ever prints as
 * `1024.0 KB`.
 *
 * Deliberately strict about its input: this is the function the panel prints every
 * size with, and a size that is not a finite number is unknown, not zero.
 * @param n - a byte count from the report.
 * @returns display text, or '—' when the value is unusable (null, NaN, negative,
 *   Infinity, or not a number at all).
 */
function formatBytes(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return '—'
  if (n === 0) return '0 B'
  let index = 0
  let value = n
  while (value >= 1024 && index < STORAGE_UNITS.length - 1) {
    value /= 1024
    index += 1
  }
  // 0.5 KB below the next unit rounds up to a whole 1024 of this one; promote it so
  // the printed unit is never a contradiction.
  while (index > 0 && index < STORAGE_UNITS.length - 1 && value >= 1023.5) {
    value /= 1024
    index += 1
  }
  const text = index === 0 || value >= 10 ? String(Math.round(value)) : value.toFixed(1)
  return text + ' ' + STORAGE_UNITS[index]
}

/**
 * The local calendar form of a timestamp, whichever shape the report uses.
 *
 * `report.generatedAt` is an ISO string and `session.modified` is epoch
 * milliseconds; both arrive here. The zone offset is returned rather than named so
 * the output never depends on a locale-aware formatter (same choice as
 * `formatTimestamp` in fetched.mjs).
 * @param value - an ISO string, an epoch-millisecond number, or anything else.
 * @returns `{ day, clock, zone }`, or null when the value is not a usable date.
 */
function storageClock(value) {
  let at = null
  if (typeof value === 'number' && Number.isFinite(value)) at = new Date(value)
  else if (typeof value === 'string' && value !== '') at = new Date(value)
  if (at === null || Number.isNaN(at.getTime())) return null
  const pad = (part) => String(part).padStart(2, '0')
  const offset = -at.getTimezoneOffset()
  const absolute = Math.abs(offset)
  return {
    day: at.getFullYear() + '-' + pad(at.getMonth() + 1) + '-' + pad(at.getDate()),
    clock: pad(at.getHours()) + ':' + pad(at.getMinutes()),
    zone: 'UTC' + (offset < 0 ? '-' : '+') + pad(Math.floor(absolute / 60)) + ':' + pad(absolute % 60),
  }
}

/**
 * The calendar date of a timestamp, for a dense row.
 * @param value - ISO string, epoch ms, or anything else.
 * @returns `YYYY-MM-DD`, or '' when unusable.
 */
function formatStorageDay(value) {
  const clock = storageClock(value)
  return clock === null ? '' : clock.day
}

/**
 * A full local timestamp with its zone, for a status line or a tooltip.
 * @param value - ISO string, epoch ms, or anything else.
 * @param language - 'zh' or 'en'; only the brackets differ.
 * @returns `YYYY-MM-DD HH:mm UTC+08:00`, or '' when unusable.
 */
function formatStorageStamp(value, language) {
  const clock = storageClock(value)
  if (clock === null) return ''
  const base = clock.day + ' ' + clock.clock
  return language === 'zh' ? base + '（' + clock.zone + '）' : base + ' ' + clock.zone
}

// ── readers ─────────────────────────────────────────────────────────────────

/**
 * The translator to use, tolerating a caller that forgot to pass one.
 * @param props - any renderer's props.
 * @returns `t(key, params)`, falling back to the key itself.
 */
function storageTranslator(props) {
  if (props && typeof props.t === 'function') return props.t
  return (key) => key
}

/**
 * The language to prefer for the closed vocabularies in this file.
 * @param props - any renderer's props.
 * @returns 'zh' or 'en'.
 */
function storageLanguage(props) {
  return props && props.language === 'zh' ? 'zh' : 'en'
}

/**
 * Look one entry out of a closed vocabulary, falling back instead of inventing.
 * @param table - one of the `STORAGE_*_LABEL` tables.
 * @param id - the id the report or the plan supplied.
 * @param fallbackId - the entry to use when `id` is not in the table.
 * @returns the vocabulary entry.
 */
function storagePick(table, id, fallbackId) {
  return Object.prototype.hasOwnProperty.call(table, id) ? table[id] : table[fallbackId]
}

/**
 * The display text of a vocabulary entry: the dictionary wins, the inline pair is
 * the fallback (the same contract as `noteCategoryLabel` in fetched.mjs).
 * @param t - the panel's translator.
 * @param language - 'zh' or 'en'.
 * @param meta - a vocabulary entry with `key`, `zh` and `en`.
 * @returns the label to display.
 */
function storageLabel(t, language, meta) {
  const text = t(meta.key)
  if (text !== meta.key) return text
  return language === 'zh' ? meta.zh : meta.en
}

/**
 * The per-language explanatory sentence of a vocabulary entry.
 * @param language - 'zh' or 'en'.
 * @param meta - a vocabulary entry with `whyZh`/`whyEn` or `hintZh`/`hintEn`.
 * @param suffix - 'why' for the reclaim sentence, 'hint' for the confidence one.
 * @returns the sentence, or '' when the entry does not carry one.
 */
function storageWhy(language, meta, suffix) {
  const zh = meta[suffix + 'Zh']
  const en = meta[suffix + 'En']
  if (typeof zh !== 'string' || typeof en !== 'string') return ''
  return language === 'zh' ? zh : en
}

/**
 * A readable short form of a session id, for a row whose projection had no title.
 *
 * Session directory names escape ':' as `~003A`, and a subagent id can carry a
 * namespace in front of the meaningful part (`im-link:dm:oc_…`), so the tail after
 * the last separator is what identifies the session to a reader.
 * @param id - the session id from the report.
 * @returns up to eight characters, or '—' when there is no id.
 */
function shortSessionId(id) {
  const text = typeof id === 'string' ? id : ''
  if (text === '') return '—'
  const decoded = text.split('~003A').join(':')
  const withoutPrefix = decoded.startsWith('session-') ? decoded.slice('session-'.length) : decoded
  const tail = withoutPrefix.slice(withoutPrefix.lastIndexOf(':') + 1)
  const candidate = tail.length >= 8 ? tail : withoutPrefix
  return candidate.slice(0, 8)
}

/**
 * What fraction of `total` a size occupies.
 * @param bytes - a measured size from the report.
 * @param total - the measured total to compare against.
 * @returns a percentage, or null when it cannot be stated (either side unusable).
 */
function storageShare(bytes, total) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return null
  if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0) return null
  return (bytes / total) * 100
}

/**
 * A percentage as text: no decimal at ten and above, one below.
 * @param percent - a percentage from `storageShare`.
 * @returns the text, or '' when the value is unusable.
 */
function storagePercentText(percent) {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return ''
  const rounded = percent >= 10 ? Math.round(percent) : Math.round(percent * 10) / 10
  return String(rounded) + '%'
}

/**
 * The width of one row's bar, relative to the largest row.
 *
 * This is a visual comparison only, and it is labelled as one: the measured bytes
 * and the share of the measured total are printed next to it. A measured row never
 * renders as an invisible bar, so the width is floored at one percent.
 * @param bytes - the row's measured size.
 * @param largest - the largest measured size in the same list.
 * @returns a percentage between 0 and 100 for an inline width.
 */
function storageBarWidth(bytes, largest) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return 0
  if (typeof largest !== 'number' || !Number.isFinite(largest) || largest <= 0) return 0
  return Math.max(1, Math.min(100, (bytes / largest) * 100))
}

/**
 * Largest measured size first; rows with no measurement keep their order at the end.
 * @param rows - rows carrying an optional `bytes`.
 * @returns a sorted copy.
 */
function storageLargestFirst(rows) {
  const size = (row) => (row && typeof row.bytes === 'number' && Number.isFinite(row.bytes) ? row.bytes : -1)
  return rows.slice().sort((left, right) => size(right) - size(left))
}

// ── cost rows ───────────────────────────────────────────────────────────────

/**
 * The cost rows: `report.categories` (which carries `reclaim`) joined with the
 * measured `report.totals`, largest first.
 *
 * A category the report measured but the category list does not name is still a
 * cost the reader is paying, so it is shown with its reclaim unstated rather than
 * dropped. `other` is the reverse case: named by the list, never measured, and
 * rendered with a dash instead of a fake zero.
 * @param report - the scan report.
 * @returns `[{ id, bytes, reclaim }]`, `bytes` null when unmeasured.
 */
function storageCategoryRows(report) {
  const totals = report && report.totals && typeof report.totals === 'object' ? report.totals : {}
  const categories = report && isArray(report.categories) ? report.categories : []
  const seen = new Set()
  const rows = []
  const push = (id, reclaim) => {
    if (typeof id !== 'string' || id === '' || seen.has(id)) return
    seen.add(id)
    const bytes = typeof totals[id] === 'number' && Number.isFinite(totals[id]) ? totals[id] : null
    rows.push({ id: id, bytes: bytes, reclaim: reclaim })
  }
  for (const entry of categories) {
    if (!entry || typeof entry.id !== 'string') continue
    const known = entry.reclaim === 'never' || entry.reclaim === 'all' || entry.reclaim === 'some'
    push(entry.id, known ? entry.reclaim : 'unknown')
  }
  for (const id of Object.keys(totals)) push(id, 'unknown')
  return storageLargestFirst(rows)
}

/**
 * Children of a measured directory, as detail rows.
 * @param children - `childSizes()` output: `{ name, path, bytes, files }`.
 * @returns detail rows sorted largest first.
 */
function storageChildRows(children) {
  const rows = isArray(children) ? children : []
  return storageLargestFirst(
    rows
      .filter((row) => row && typeof row.name === 'string' && row.name !== '')
      .map((row) => ({
        id: row.name,
        name: row.name,
        path: typeof row.path === 'string' ? row.path : '',
        bytes: typeof row.bytes === 'number' && Number.isFinite(row.bytes) ? row.bytes : null,
        files: typeof row.files === 'number' && Number.isFinite(row.files) ? row.files : null,
        badge: '',
      })),
  )
}

/**
 * The nested detail a cost row can show, straight from the report.
 *
 * Only the shapes the report actually carries are wired — `runtimes.children`,
 * `profiles`, `browserCache.children`, `caches.breakdown`, `workspace.children` and
 * the attachment counts; a category with no detail returns null and renders as a
 * bare row. Every size here was measured by the same scan as the row's own total.
 * @param categoryId - the category id.
 * @param report - the scan report.
 * @param t - the panel's translator.
 * @param language - 'zh' or 'en'.
 * @returns `{ children, noteKey, noteParams }`, or null when there is no detail.
 */
function storageCategoryDetail(categoryId, report, t, language) {
  if (!report) return null
  if (categoryId === 'runtimes') {
    const children = storageChildRows(report.runtimes && report.runtimes.children)
    return children.length === 0 ? null : { children: children, noteKey: '', noteParams: null }
  }
  if (categoryId === 'plugins') {
    const profiles = storageLargestFirst(isArray(report.profiles) ? report.profiles.slice() : [])
    const children = profiles
      .filter((profile) => profile && typeof profile.name === 'string')
      .map((profile) => ({
        id: profile.name,
        name: profile.name,
        path: typeof profile.path === 'string' ? profile.path : '',
        bytes: typeof profile.bytes === 'number' && Number.isFinite(profile.bytes) ? profile.bytes : null,
        files: typeof profile.files === 'number' && Number.isFinite(profile.files) ? profile.files : null,
        badge: profile.isActive === true ? t('storage.cost.profileActive') : '',
      }))
    return children.length === 0 ? null : { children: children, noteKey: '', noteParams: null }
  }
  if (categoryId === 'browserCache') {
    const children = storageChildRows(report.browserCache && report.browserCache.children)
    return children.length === 0 ? null : { children: children, noteKey: '', noteParams: null }
  }
  if (categoryId === 'caches') {
    const breakdown = report.caches && report.caches.breakdown ? report.caches.breakdown : null
    if (!breakdown) return null
    // The keys of `breakdown` are the directory names the scan measured, so they are
    // shown as-is instead of being translated into something they are not.
    const children = storageLargestFirst(
      Object.keys(breakdown)
        .filter((name) => typeof breakdown[name] === 'number' && Number.isFinite(breakdown[name]))
        .map((name) => ({ id: name, name: name, path: '', bytes: breakdown[name], files: null, badge: '' })),
    )
    return children.length === 0 ? null : { children: children, noteKey: '', noteParams: null }
  }
  if (categoryId === 'workspace') {
    const children = storageChildRows(report.workspace && report.workspace.children)
    return children.length === 0 ? null : { children: children, noteKey: '', noteParams: null }
  }
  if (categoryId === 'attachments') {
    const attachments = report.attachments
    if (!attachments) return null
    // The one reclaim signal the attachment store has: an object no session log
    // references. It is stated as a count rather than as an invitation.
    return {
      children: [],
      noteKey: 'storage.cost.attachments',
      noteParams: {
        count: typeof attachments.count === 'number' ? attachments.count : 0,
        orphans: typeof attachments.orphanCount === 'number' ? attachments.orphanCount : 0,
        size: formatBytes(typeof attachments.orphanBytes === 'number' ? attachments.orphanBytes : 0),
      },
    }
  }
  return null
}

// ── session rows ────────────────────────────────────────────────────────────

/**
 * The session table's shape: one group per workspace, each holding top-level
 * sessions with their subagent sessions nested under them.
 *
 * A session is nested when it is a subagent (`isSubagent`) whose `parentId` names a
 * session that is present and is not itself a subagent; DSH stores no parent
 * reference, so the scanner recovered that mapping from the parent's log, and an
 * unmatched subagent is surfaced on its own with an "unresolved parent" badge
 * instead of being hidden. Every size is carried through untouched.
 * @param sessions - `report.sessions`.
 * @returns `{ groups, orphans }`, groups ordered by subtotal, largest first.
 */
function groupSessions(sessions) {
  const rows = isArray(sessions)
    ? sessions.filter((session) => session && typeof session.id === 'string' && session.id !== '')
    : []
  const byId = new Map(rows.map((session) => [session.id, session]))
  const childrenOf = new Map()
  const tops = []
  const orphans = []
  for (const session of rows) {
    if (session.isSubagent !== true) {
      tops.push(session)
      continue
    }
    const parentId = typeof session.parentId === 'string' ? session.parentId : ''
    const parent = parentId === '' ? null : byId.get(parentId)
    if (parent && parent.isSubagent !== true) {
      if (!childrenOf.has(parentId)) childrenOf.set(parentId, [])
      childrenOf.get(parentId).push(session)
      continue
    }
    orphans.push(session)
  }

  const sizeOf = (session) => (typeof session.bytes === 'number' && Number.isFinite(session.bytes) ? session.bytes : 0)
  const groups = new Map()
  const add = (session, children, orphan) => {
    const key = typeof session.cwd === 'string' && session.cwd !== '' ? session.cwd : ''
    if (!groups.has(key)) groups.set(key, { id: key, entries: [], bytes: 0, sessions: 0 })
    const group = groups.get(key)
    let bytes = sizeOf(session)
    for (const child of children) bytes += sizeOf(child)
    group.entries.push({ session: session, children: children, orphan: orphan === true })
    group.bytes += bytes
    group.sessions += 1 + children.length
  }
  for (const session of tops) add(session, childrenOf.get(session.id) || [], false)
  for (const session of orphans) add(session, [], true)

  const sorted = [...groups.values()].sort((left, right) => {
    if (left.bytes !== right.bytes) return right.bytes - left.bytes
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
  })
  for (const group of sorted) {
    // Largest row first, then the most recently modified: the panel's question is
    // "what costs the most", and the date is on every row for the other question.
    group.entries.sort((left, right) => {
      const difference = sizeOf(right.session) - sizeOf(left.session)
      if (difference !== 0) return difference
      const one = typeof left.session.modified === 'number' ? left.session.modified : 0
      const two = typeof right.session.modified === 'number' ? right.session.modified : 0
      return two - one
    })
    for (const entry of group.entries) entry.children = storageLargestFirst(entry.children)
  }
  return { groups: sorted, orphans: orphans }
}

// ── claim selection ─────────────────────────────────────────────────────────

/**
 * Whether one plan item is currently selected.
 * @param selected - a Set, an array, or anything else.
 * @param id - the plan item id.
 * @returns true when the id is in the selection.
 */
function storageSelectionHas(selected, id) {
  if (selected instanceof Set) return selected.has(id)
  if (isArray(selected)) return selected.indexOf(id) !== -1
  return false
}

/**
 * The items a trash action would act on, in plan order.
 * @param items - every plan item.
 * @param selected - a Set, an array, or anything else.
 * @returns the selected items.
 */
function storageSelectedItems(items, selected) {
  return items.filter((item) => item && storageSelectionHas(selected, item.id))
}

/**
 * Bucket plan items by `kind`, in `STORAGE_KIND_ORDER`, unknown kinds afterwards.
 * @param items - `plan.items`.
 * @returns `[[kind, items]]`.
 */
function storagePlanGroups(items) {
  const buckets = new Map()
  for (const item of items) {
    if (!item) continue
    const kind = typeof item.kind === 'string' && item.kind !== '' ? item.kind : 'other'
    if (!buckets.has(kind)) buckets.set(kind, [])
    buckets.get(kind).push(item)
  }
  const rank = (kind) => {
    const at = STORAGE_KIND_ORDER.indexOf(kind)
    return at === -1 ? STORAGE_KIND_ORDER.length : at
  }
  return [...buckets.entries()]
    .sort((left, right) => rank(left[0]) - rank(right[0]) || (left[0] < right[0] ? -1 : 1))
    .map(([kind, rows]) => [kind, storageLargestFirst(rows)])
}

/**
 * A plan kind's measured total: the scanner's own `plan.byKind` when it carries
 * one, otherwise the sum of the item sizes the report already states. Either way
 * the bytes come from the report; the panel never measures anything itself.
 * @param plan - the reclaim plan.
 * @param kind - the item kind.
 * @param rows - the kind's items.
 * @returns a byte total.
 */
function storagePlanKindBytes(plan, kind, rows) {
  const stated = plan && plan.byKind ? plan.byKind[kind] : undefined
  if (typeof stated === 'number' && Number.isFinite(stated)) return stated
  return rows.reduce(
    (sum, row) => sum + (typeof row.bytes === 'number' && Number.isFinite(row.bytes) ? row.bytes : 0),
    0,
  )
}

/**
 * A plan item's display name: its title when the scanner captured one, else the
 * identifying tail of its id, else the last segment of its path.
 * @param item - one `plan.items` entry.
 * @returns the name to display.
 */
function storageItemName(item) {
  if (item && typeof item.title === 'string' && item.title.trim() !== '') return item.title.trim()
  const id = item && typeof item.id === 'string' ? item.id : ''
  const at = id.indexOf(':')
  if (at !== -1 && at < id.length - 1) {
    const tail = id.slice(at + 1)
    return item.kind === 'session' ? shortSessionId(tail) : tail
  }
  const path = item && typeof item.path === 'string' ? item.path.replace(/\/+$/, '') : ''
  const base = path.slice(path.lastIndexOf('/') + 1)
  return base !== '' ? base : id !== '' ? id : '—'
}

// ── the status banner ───────────────────────────────────────────────────────

/**
 * The status / error banner: one line, tone-classed, with an optional detail.
 *
 * `message` is rendered verbatim when the caller passes one (a scanner error, a
 * failed read) so an error the panel does not understand is still reported in the
 * words of the thing that produced it.
 * @param props - `{ status, t, language, message, detail }`; status is one of
 *   `STORAGE_STATUS`'s four tones.
 * @returns the banner element.
 */
function renderStorageStatus(props) {
  const t = storageTranslator(props)
  const status =
    props.status === 'error' || props.status === 'ready' || props.status === 'loading' ? props.status : 'idle'
  const message = typeof props.message === 'string' && props.message !== '' ? props.message : t(STORAGE_STATUS_KEY[status])
  const detail = typeof props.detail === 'string' && props.detail !== '' ? props.detail : ''
  return el(
    'div',
    {
      className: STORAGE_STATUS[status],
      role: status === 'error' ? 'alert' : 'status',
      'data-status': status,
    },
    el('span', null, message),
    detail === '' ? null : el('span', { className: 'dshcl-storageStatusDetail' }, ' · ' + detail),
  )
}

// ── summary ─────────────────────────────────────────────────────────────────

/**
 * One stat cell of the summary grid.
 * @param props - `{ label, value, title }`.
 * @returns the cell element.
 */
function renderStorageStat(props) {
  return el(
    'div',
    { className: 'dshcl-storageStat' },
    el('span', { className: 'dshcl-storageStatLabel', title: props.title || undefined }, props.label),
    el('span', { className: 'dshcl-storageStatValue' }, props.value),
  )
}

/**
 * The top block: total on disk, how much is reclaimable, when the scan ran, where
 * it looked, and the controls that re-read or re-run it.
 *
 * Three states are distinct and all three are honest: no report at all (an empty
 * state with the button), a report whose scan failed (`report.error`, shown in the
 * scanner's own words instead of numbers), and a report the client could not even
 * read (`props.error`). A `report` is never rendered as if it were fresh when
 * neither the numbers nor the timestamp are there.
 * @param props - `{ report, plan, t, language, onRefresh, onRescan, busy, error }`.
 * @returns the summary section element.
 */
function renderStorageSummary(props) {
  const t = storageTranslator(props)
  const language = storageLanguage(props)
  const report = props.report || null
  const plan = props.plan || (report && report.plan ? report.plan : null)
  const busy = props.busy === true
  const readError = typeof props.error === 'string' && props.error !== '' ? props.error : ''
  const scanError =
    report && typeof report.error === 'string' && report.error !== '' ? report.error : ''
  const status = readError !== '' || scanError !== '' ? 'error' : report === null ? (busy ? 'loading' : 'idle') : busy ? 'loading' : 'ready'
  const stamp = report ? formatStorageStamp(report.generatedAt, language) : ''
  const statusMessage =
    readError !== ''
      ? t('storage.status.readError')
      : scanError !== ''
        ? t('storage.status.scanError')
        : ''
  const statusDetail = readError !== '' ? readError : scanError !== '' ? scanError : stamp

  const controls = el(
    'div',
    { className: 'dshcl-storageControls' },
    // The view switch sits with the refresh control, in the summary header: it
    // changes how every section below reads, so it must not scroll away with them.
    typeof props.onView === 'function' ? el(renderViewSwitch, { view: props.view, onView: props.onView, t: t }) : null,
    el(
      'button',
      {
        type: 'button',
        className: 'dshcl-liveBtn dshcl-storageBtn',
        disabled: busy,
        onClick: () => {
          if (typeof props.onRefresh === 'function') props.onRefresh()
        },
      },
      busy ? t('storage.refreshing') : t('storage.refresh'),
    ),
    typeof props.onRescan === 'function'
      ? el(
          'button',
          {
            type: 'button',
            className: 'dshcl-liveBtn dshcl-storageBtn',
            disabled: busy,
            onClick: () => props.onRescan(),
          },
          t('storage.rescan'),
        )
      : null,
  )

  const sessions = report && isArray(report.sessions) ? report.sessions : []
  const subagents = sessions.filter((session) => session && session.isSubagent === true).length
  const host = report && report.host && typeof report.host === 'object' ? report.host : null

  return el(
    'section',
    { className: 'dshcl-storageSection dshcl-storageSummary', 'data-storage-section': 'summary' },
    el(
      'div',
      { className: 'dshcl-secHead' },
      el('span', { className: 'dshcl-secVer' }, t('storage.title')),
      el(renderStorageStatus, { status: status, t: t, language: language, message: statusMessage, detail: statusDetail }),
      // The controls live with the numbers they refresh, except in the empty state,
      // where they belong to the empty state itself.
      report === null ? null : controls,
    ),
    el('p', { className: 'dshcl-secSummary' }, t('storage.summary.note')),
    readError === ''
      ? null
      : el(
          'div',
          { className: 'dshcl-notice' },
          el('p', { className: 'dshcl-noticeTitle' }, t('storage.status.readError')),
          el('p', null, readError),
        ),
    scanError === ''
      ? null
      : el(
          'div',
          { className: 'dshcl-notice' },
          el('p', { className: 'dshcl-noticeTitle' }, t('storage.reportError')),
          el('p', null, scanError),
          stamp === '' ? null : el('p', { className: 'dshcl-liveDate' }, t('storage.summary.generatedAt') + ': ' + stamp),
        ),
    report === null
      ? el('div', { className: 'dshcl-empty' }, el('p', null, t('storage.empty')), controls)
      : el(
          'div',
          null,
          el(
            'div',
            { className: 'dshcl-storageStats' },
            el(renderStorageStat, {
              label: t('storage.summary.total'),
              value: formatBytes(report.grandTotal),
              title: t('storage.summary.totalNote'),
            }),
            el(renderStorageStat, {
              label: t('storage.summary.reclaimable'),
              value: plan && typeof plan.bytes === 'number' ? formatBytes(plan.bytes) : '—',
              title: plan ? t('storage.summary.reclaimableNote') : t('storage.summary.noPlan'),
            }),
            el(renderStorageStat, {
              label: t('storage.summary.sessions'),
              value: t('storage.summary.sessionsValue', { n: sessions.length, subs: subagents }),
              title: '',
            }),
            el(renderStorageStat, {
              label: t('storage.summary.generatedAt'),
              value: stamp === '' ? '—' : stamp,
              title: '',
            }),
            el(renderStorageStat, {
              label: t('storage.summary.scanTime'),
              value:
                typeof report.scanMs === 'number' ? t('storage.summary.ms', { n: report.scanMs }) : '—',
              title: '',
            }),
          ),
          el('p', { className: 'dshcl-liveDate' }, t('storage.summary.totalNote')),
          el('p', { className: 'dshcl-liveDate' }, plan ? t('storage.summary.reclaimableNote') : t('storage.summary.noPlan')),
          host && typeof host.home === 'string'
            ? el('p', { className: 'dshcl-storagePath', title: host.home }, t('storage.summary.home') + ': ' + host.home)
            : null,
          host && typeof host.workspace === 'string'
            ? el(
                'p',
                { className: 'dshcl-storagePath', title: host.workspace },
                t('storage.summary.workspace') + ': ' + host.workspace,
              )
            : null,
          // The running DSH version, and — when it could not be read — why. This is
          // the diagnostic that a report from another machine needs: a wrong badge is
          // otherwise indistinguishable from a wrong install.
          host === null
            ? null
            : el(
                'p',
                { className: 'dshcl-liveDate', 'data-dsh-version': String(host.dshVersion || 'unknown') },
                t('storage.summary.dshVersion', { version: String(host.dshVersion || 'unknown') }) +
                  (host.dshVersionSource ? ' · ' + t('storage.summary.dshVersionSource', { source: String(host.dshVersionSource) }) : '') +
                  (Array.isArray(host.dshVersionChecked) && host.dshVersionChecked.length > 0
                    ? ' · ' + host.dshVersionChecked.join(', ')
                    : ''),
              ),
        ),
  )
}

// ── cost breakdown ──────────────────────────────────────────────────────────

/**
 * One cost category row: label, the reclaim hint that says what it is, the exact
 * measured size, the share of the measured total, a proportional bar, and whatever
 * nested detail the report carries.
 * @param props - `{ row, detail, largest, total, t, language }`.
 * @returns the row element.
 */
function renderCostRow(props) {
  const row = props.row
  const t = props.t
  const language = props.language
  const meta = storagePick(STORAGE_RECLAIM_LABEL, row.reclaim, 'unknown')
  const category = storagePick(STORAGE_CATEGORY_LABEL, row.id, 'other')
  const measured = typeof row.bytes === 'number' && Number.isFinite(row.bytes)
  // An unmeasured category gets no reclaim claim at all. `CATEGORIES` names `other`
  // with `reclaim: 'never'`, but the scan measures nothing for it, and repeating a
  // runtime sentence next to a dash would be a claim about bytes nobody weighed.
  const hint = storageWhy(language, meta, 'why')
  const percent = measured ? storageShare(row.bytes, props.total) : null
  const detail = props.detail || null
  const children = detail && isArray(detail.children) ? detail.children : []
  const shown = children.slice(0, STORAGE_DETAIL_LIMIT)
  const rest = children.length - shown.length
  return el(
    'div',
    {
      className: 'dshcl-item dshcl-storageRow',
      'data-category': row.id,
      'data-reclaim': row.reclaim,
    },
    el(
      'div',
      { className: 'dshcl-itemHead' },
      el('span', { className: 'dshcl-itemTitle' }, storageLabel(t, language, category)),
      measured
        ? el('span', { className: 'dshcl-pill ' + meta.tone, title: hint }, meta.icon + ' ' + storageLabel(t, language, meta))
        : null,
      el('span', { className: 'dshcl-storageSize' }, measured ? formatBytes(row.bytes) : '—'),
      percent === null
        ? null
        : el('span', { className: 'dshcl-liveDate' }, t('storage.cost.share', { pct: storagePercentText(percent) })),
      measured ? null : el('span', { className: 'dshcl-liveDate' }, t('storage.cost.unmeasured')),
    ),
    el(
      'div',
      {
        className: 'dshcl-storageBar',
        title: measured ? formatBytes(row.bytes) + (percent === null ? '' : ' · ' + storagePercentText(percent)) : '',
      },
      el('div', { className: 'dshcl-storageBarFill', style: { width: storageBarWidth(row.bytes, props.largest) + '%' } }),
    ),
    // The one category that must never read as an invitation says so in words, not
    // only in colour.
    measured && row.reclaim === 'never'
      ? el('p', { className: 'dshcl-liveDate' }, t('storage.cost.neverDetail'))
      : null,
    detail && detail.noteKey !== ''
      ? el('p', { className: 'dshcl-liveDate' }, t(detail.noteKey, detail.noteParams))
      : null,
    shown.length === 0
      ? null
      : el(
          'ul',
          { className: 'dshcl-storageDetail' },
          shown.map((child) =>
            el(
              'li',
              { className: 'dshcl-storageDetailRow', key: child.id },
              el('span', { className: 'dshcl-storagePath', title: child.path || child.name }, child.name),
              child.badge === '' ? null : el('span', { className: 'dshcl-pill' }, child.badge),
              child.files === null ? null : el('span', { className: 'dshcl-liveDate' }, t('storage.cost.files', { n: child.files })),
              el('span', { className: 'dshcl-storageDetailValue' }, child.bytes === null ? '—' : formatBytes(child.bytes)),
            ),
          ),
          rest <= 0
            ? null
            : el('li', { className: 'dshcl-liveDate', key: '__rest' }, t('storage.cost.more', { n: rest })),
        ),
  )
}

/**
 * Where the space goes: one row per cost category, largest first, each with the
 * reclaim hint the scanner's category list implies and its nested detail.
 * @param props - `{ report, t, language }`.
 * @returns the cost section element, or null without a report.
 */
function renderCostBreakdown(props) {
  const t = storageTranslator(props)
  const language = storageLanguage(props)
  const report = props.report || null
  if (!report) return null
  const rows = storageCategoryRows(report)
  const prepared = rows.map((row) => ({ row: row, detail: storageCategoryDetail(row.id, report, t, language) }))
  const hasDetail = prepared.some((entry) => entry.detail !== null && entry.detail.children.length > 0)
  const total = typeof report.grandTotal === 'number' && Number.isFinite(report.grandTotal) ? report.grandTotal : null
  // What the tiles add up to: every measured category, workspace included.
  const categoryBytes = rows.reduce(
    (sum, row) => sum + (typeof row.bytes === 'number' && Number.isFinite(row.bytes) ? row.bytes : 0),
    0,
  )
  const largest = rows.reduce((max, row) => {
    if (typeof row.bytes !== 'number' || !Number.isFinite(row.bytes)) return max
    return row.bytes > max ? row.bytes : max
  }, 0)
  return el(
    'section',
    { className: 'dshcl-storageSection', 'data-storage-section': 'cost' },
    el(
      'div',
      { className: 'dshcl-secHead' },
      el('span', { className: 'dshcl-secVer' }, t('storage.cost.title')),
      // The total shown here is the sum of the categories this chart draws, which
      // is NOT `grandTotal`: that figure excludes the workspace category, so stating
      // it beside tiles that include the workspace made the header disagree with the
      // picture. The summary above states `grandTotal` and what it means.
      categoryBytes === null
        ? null
        : el('span', { className: 'dshcl-liveDate' }, t('storage.chart.total') + ' ' + formatBytes(categoryBytes)),
    ),
    el('p', { className: 'dshcl-secSummary' }, t('storage.cost.sub')),
    // Nested rows are the measured subdirectories, and loose files are not listed
    // one by one, so a reader who adds them up must know a remainder is normal.
    hasDetail ? el('p', { className: 'dshcl-liveDate' }, t('storage.cost.detailNote')) : null,
    rows.length === 0
      ? el('div', { className: 'dshcl-empty' }, t('storage.cost.empty'))
      : props.view === 'chart'
        ? el(
            'div',
            { className: 'dshcl-chartWrap' },
            el(renderTreemap, {
              // A treemap of the categories: area is bytes, so the runtime's share is
              // visible before any number is read.
              'data-chart': 'cost',
              items: rows
                .filter((row) => typeof row.bytes === 'number' && row.bytes > 0)
                .map((row) => ({
                  key: row.id,
                  label: storageLabel(t, language, storagePick(STORAGE_CATEGORY_LABEL, row.id, 'other')),
                  weight: row.bytes,
                  detail: formatBytes(row.bytes) + (total ? ' · ' + Math.round((row.bytes / total) * 100) + '%' : ''),
                  tone: row.reclaim === 'never' ? 'Locked' : row.reclaim === 'all' ? 'Free' : 'Care',
                })),
            }),
            el(renderChartTotal, { bytes: categoryBytes, label: t('storage.chart.total'), t: t }),
          )
        : el(
            'div',
            { className: 'dshcl-items' },
            prepared.map((entry) =>
              el(renderCostRow, {
                key: entry.row.id,
                row: entry.row,
                detail: entry.detail,
                largest: largest,
                total: total,
                t: t,
                language: language,
              }),
            ),
          ),
  )
}

// ── session table ───────────────────────────────────────────────────────────

/**
 * One session row, parent or nested subagent.
 *
 * The title falls back to a shortened id when the projection had no title, and an
 * unprojected session says so instead of silently showing blanks: the panel's whole
 * point is that a reader can trust what it says about their own conversations.
 * @param props - `{ session, children, sub, orphan, parentCwd, canReveal, t,
 *   language, onOpenSession, onReveal }`.
 * @returns the row element.
 */
function renderSessionRow(props) {
  const session = props.session
  const t = props.t
  const language = props.language
  const children = isArray(props.children) ? props.children : []
  const sub = props.sub === true
  const orphan = props.orphan === true
  const canReveal = props.canReveal === true
  const rawTitle = typeof session.title === 'string' ? session.title.trim() : ''
  const label = sub
    ? typeof session.subagentLabel === 'string' && session.subagentLabel !== ''
      ? session.subagentLabel
      : shortSessionId(session.id)
    : rawTitle !== ''
      ? rawTitle
      : shortSessionId(session.id)
  const day = formatStorageDay(session.modified)
  const tooltip = typeof session.dir === 'string' ? session.dir : session.id

  const badges = []
  if (sub) badges.push({ id: 'subagent', label: t('storage.badge.subagent'), title: '', mono: false })
  if (orphan) badges.push({ id: 'orphan', label: t('storage.badge.orphan'), title: '', mono: false })
  if (session.pinned === true) badges.push({ id: 'pinned', label: t('storage.badge.pinned'), title: '', mono: false })
  if (session.archived === true) badges.push({ id: 'archived', label: t('storage.badge.archived'), title: '', mono: false })
  if (session.projected === false) {
    badges.push({ id: 'unprojected', label: t('storage.badge.unprojected'), title: t('storage.badge.unprojectedTitle'), mono: false })
  }

  const facts = [
    typeof session.turns === 'number' ? t('storage.turns', { n: session.turns }) : t('storage.turnsUnknown'),
    t('storage.modified', { date: day === '' ? '—' : day }),
  ]
  if (children.length > 0) facts.push(t('storage.sessions.subCount', { n: children.length }))
  // A subagent can run in a different directory than the session that spawned it;
  // that is a fact about where its bytes came from, so it is stated.
  if (sub && typeof session.cwd === 'string' && session.cwd !== '' && session.cwd !== props.parentCwd) {
    facts.push(t('storage.subagent.otherCwd', { cwd: session.cwd }))
  }

  return el(
    'li',
    {
      className: 'dshcl-item ' + (sub ? 'dshcl-storageSubRow' : 'dshcl-storageSession'),
      'data-session-id': session.id,
      'data-subagent': sub ? 'true' : 'false',
    },
    el(
      'div',
      { className: 'dshcl-itemHead' },
      el(
        'h4',
        { className: 'dshcl-itemTitle', title: tooltip },
        rawTitle === '' && !sub ? el('span', { className: 'dshcl-storagePath' }, label) : label,
      ),
      badges.map((badge) =>
        el('span', { className: 'dshcl-pill', key: badge.id, title: badge.title || undefined }, badge.label),
      ),
      el('span', { className: 'dshcl-storageSize' }, formatBytes(session.bytes)),
    ),
    el(
      'div',
      { className: 'dshcl-storageMeta' },
      facts.map((fact) => el('span', { key: fact }, fact)),
    ),
    el(
      'div',
      { className: 'dshcl-storageActions' },
      el(
        'button',
        {
          type: 'button',
          className: 'dshcl-liveBtn dshcl-storageBtn',
          onClick: () => {
            if (typeof props.onOpenSession === 'function') props.onOpenSession(session.id)
          },
        },
        t('storage.action.open'),
      ),
      // Reveal depends on a host capability that may not be there, so the control is
      // rendered only when the panel was told it exists.
      canReveal
        ? el(
            'button',
            {
              type: 'button',
              className: 'dshcl-liveBtn dshcl-storageBtn',
              title: typeof session.dir === 'string' ? session.dir : '',
              onClick: () => {
                if (typeof props.onReveal === 'function' && typeof session.dir === 'string') props.onReveal(session.dir)
              },
            },
            t('storage.action.reveal'),
          )
        : null,
    ),
    children.length === 0
      ? null
      : el(
          'ul',
          { className: 'dshcl-storageSubs' },
          children.map((child) =>
            el(renderSessionRow, {
              key: child.id,
              session: child,
              children: [],
              sub: true,
              orphan: false,
              parentCwd: session.cwd,
              canReveal: canReveal,
              t: t,
              language: language,
              onOpenSession: props.onOpenSession,
              onReveal: props.onReveal,
            }),
          ),
        ),
  )
}

/**
 * One workspace group: its path, its subtotal, and its session rows.
 * @param props - `{ group, canReveal, t, language, onOpenSession, onReveal }`.
 * @returns the group element.
 */
function renderSessionGroup(props) {
  const group = props.group
  const t = props.t
  const label = group.id === '' ? t('storage.group.unknown') : group.id
  return el(
    'section',
    { className: 'dshcl-group', 'data-workspace': group.id },
    el(
      'div',
      { className: 'dshcl-groupHead' },
      el('span', { className: 'dshcl-storageWorkspace', title: group.id === '' ? undefined : group.id }, label),
      el(
        'span',
        { className: 'dshcl-count' },
        '· ' + t('storage.group.subtotal', { sessions: group.sessions, size: formatBytes(group.bytes) }),
      ),
    ),
    el(
      'ul',
      { className: 'dshcl-items' },
      group.entries.map((entry) =>
        el(renderSessionRow, {
          key: entry.session.id,
          session: entry.session,
          children: entry.children,
          // An unmatched subagent is still a subagent: it keeps its badge and its
          // label, and only the nesting is missing.
          sub: entry.session.isSubagent === true,
          orphan: entry.orphan,
          parentCwd: group.id,
          canReveal: props.canReveal,
          t: t,
          language: props.language,
          onOpenSession: props.onOpenSession,
          onReveal: props.onReveal,
        }),
      ),
    ),
  )
}

/**
 * The conversation-to-storage mapping: which workspace costs what, which session
 * costs what inside it, and which subagent sessions belong to which parent.
 *
 * Attribution failures are stated rather than hidden: when the scan could not
 * decompress the logs at all, or could not match a subagent id to a parent, the
 * table says so, because an unattributed subagent looks exactly like a small
 * top-level session otherwise.
 * @param props - `{ report, canReveal, t, language, onOpenSession, onReveal }`.
 * @returns the session section element, or null without a report.
 */
function renderSessionTable(props) {
  const t = storageTranslator(props)
  const language = storageLanguage(props)
  const report = props.report || null
  if (!report) return null
  const sessions = isArray(report.sessions) ? report.sessions : []
  const grouped = groupSessions(sessions)
  const subagentRows = sessions.filter((session) => session && session.isSubagent === true)
  const mapped = report.subagents && typeof report.subagents.mapped === 'number' ? report.subagents.mapped : null
  const unresolved = report.subagents && isArray(report.subagents.unresolved) ? report.subagents.unresolved.length : 0
  return el(
    'section',
    { className: 'dshcl-storageSection', 'data-storage-section': 'sessions' },
    el('div', { className: 'dshcl-secHead' }, el('span', { className: 'dshcl-secVer' }, t('storage.sessions.title'))),
    el('p', { className: 'dshcl-secSummary' }, t('storage.sessions.sub')),
    subagentRows.length === 0 ? null : el('p', { className: 'dshcl-liveDate' }, t('storage.sessions.shareNote')),
    unresolved > 0
      ? el('p', { className: 'dshcl-liveWarn' }, t('storage.sessions.unresolved', { n: unresolved }))
      : null,
    subagentRows.length > 0 && mapped === 0
      ? el('p', { className: 'dshcl-liveWarn' }, t('storage.sessions.attributionOff'))
      : null,
    sessions.length === 0
      ? el('div', { className: 'dshcl-empty' }, t('storage.sessions.empty'))
      : grouped.groups.map((group) =>
          el(renderSessionGroup, {
            key: group.id === '' ? '__unknown' : group.id,
            group: group,
            canReveal: props.canReveal === true,
            t: t,
            language: language,
            onOpenSession: props.onOpenSession,
            onReveal: props.onReveal,
          }),
        ),
  )
}


// ── chart primitives ────────────────────────────────────────────────────────


/**
 * The total a chart adds up to, stated on the chart itself.
 *
 * A treemap communicates proportion, not magnitude: the reader can see that the
 * runtime dominates without learning that the whole picture is 587 MB. Stating the
 * sum under the tiles is what turns a shape into a figure, and a chart whose parts
 * have visible labels but no stated total invites the reader to add them up by hand
 * and distrust the result when a rounding remainder appears.
 * @param props - `{ bytes, label, t }`.
 * @returns the footer element, or null when there is no total.
 */
function renderChartTotal(props) {
  if (typeof props.bytes !== 'number' || !Number.isFinite(props.bytes)) return null
  return el(
    'div',
    {
      className: 'dshcl-chartTotal',
      'data-chart-total': 'true',
      'data-total-bytes': String(props.bytes),
    },
    el('span', { className: 'dshcl-chartTotalLabel' }, props.label),
    el('span', { className: 'dshcl-chartTotalValue' }, formatBytes(props.bytes)),
  )
}

/**
 * Lay a list of weighted items out as nested rectangles filling a unit square.
 *
 * A squarified-ish slice-and-dice treemap: each level splits the current rectangle
 * along its longer side, proportional to weight. Slice-and-dice alone produces
 * slivers; alternating the split axis with the parent's aspect ratio keeps tiles
 * readable at this scale without pulling in a layout dependency.
 *
 * @param items - `[{ key, weight }]`, any order.
 * @returns `[{ key, x, y, w, h }]` in 0..1 fractions, keys preserved.
 */
function treemapLayout(items) {
  const rows = items
    .filter((item) => item && Number.isFinite(item.weight) && item.weight > 0)
    .sort((a, b) => b.weight - a.weight)
  const total = rows.reduce((sum, item) => sum + item.weight, 0)
  if (rows.length === 0 || total <= 0) return []
  const out = []
  const place = (slice, x, y, w, h) => {
    if (slice.length === 0) return
    const sum = slice.reduce((acc, item) => acc + item.weight, 0)
    const horizontal = w >= h
    let cursor = horizontal ? x : y
    for (const item of slice) {
      const fraction = item.weight / sum
      if (horizontal) {
        const width = w * fraction
        out.push({ key: item.key, x: cursor, y, w: width, h })
        cursor += width
      } else {
        const height = h * fraction
        out.push({ key: item.key, x, y: cursor, w, h: height })
        cursor += height
      }
    }
  }
  const split = (slice, x, y, w, h, depth) => {
    if (slice.length === 0) return
    if (slice.length === 1 || depth >= 2) {
      place(slice, x, y, w, h)
      return
    }
    const sum = slice.reduce((acc, item) => acc + item.weight, 0)
    const horizontal = w >= h
    let cursor = horizontal ? x : y
    let taken = 0
    for (let index = 0; index < slice.length; index += 1) {
      const item = slice[index]
      const fraction = item.weight / sum
      const weight = horizontal ? w * fraction : h * fraction
      taken += item.weight
      const isLast = index === slice.length - 1
      if (!isLast && taken / sum < 0.55) {
        if (horizontal) {
          out.push({ key: item.key, x: cursor, y, w: weight, h })
          cursor += weight
        } else {
          out.push({ key: item.key, x, y: cursor, w, h: weight })
          cursor += weight
        }
        continue
      }
      // The remaining items share the rest of the rectangle.
      const rest = slice.slice(index)
      const restSum = sum - (taken - item.weight)
      const restFraction = restSum / sum
      if (horizontal) {
        split(rest, cursor, y, w * restFraction, h, depth + 1)
      } else {
        split(rest, x, cursor, w, h * restFraction, depth + 1)
      }
      return
    }
  }
  split(rows, 0, 0, 1, 1, 0)
  return out
}

/**
 * A treemap of weighted rows, each tile labelled and titled.
 *
 * Tiles smaller than a readable fraction keep their tooltip but drop their text,
 * because overlapping labels read as noise rather than as data.
 * @param props - `{ items, className, dataAttribute }` where items are
 *   `{ key, label, weight, detail, tone }`.
 * @returns the treemap element.
 */
function renderTreemap(props) {
  const items = isArray(props.items) ? props.items : []
  const tiles = treemapLayout(items.map((item) => ({ key: item.key, weight: item.weight })))
  const byKey = new Map(items.map((item) => [item.key, item]))
  return el(
    'div',
    {
      className: 'dshcl-chartTreemap' + (props.className ? ' ' + props.className : ''),
      // Forwarded so a caller can label the chart for styling and for tests; a
      // component prop does not become an attribute on its own.
      'data-chart': props['data-chart'] === undefined ? null : props['data-chart'],
      // The sum the tiles were laid out from, so a test can assert the stated total
      // matches the picture rather than trusting two separately computed numbers.
      'data-chart-bytes': String(items.reduce((sum, item) => sum + (Number(item.weight) || 0), 0)),
    },
    tiles.map((tile) => {
      const item = byKey.get(tile.key) || { label: tile.key }
      const share = tile.w * tile.h
      return el(
        'div',
        {
          key: tile.key,
          className: 'dshcl-chartTile' + (item.tone ? ' dshcl-chartTile' + item.tone : ''),
          style: {
            left: tile.x * 100 + '%',
            top: tile.y * 100 + '%',
            width: tile.w * 100 + '%',
            height: tile.h * 100 + '%',
          },
          title: item.detail ? item.label + ' — ' + item.detail : item.label,
          'data-tile': tile.key,
        },
        share < 0.035
          ? null
          : el(
              'span',
              { className: 'dshcl-chartTileLabel' },
              el('span', { className: 'dshcl-chartTileName' }, item.label),
              item.detail ? el('span', { className: 'dshcl-chartTileValue' }, item.detail) : null,
            ),
      )
    }),
  )
}

/**
 * A horizontal bar per row, measured against the largest row.
 * @param props - `{ items }` where items are `{ key, label, detail, weight, tone }`.
 * @returns the bar list element.
 */
function renderBars(props) {
  const items = isArray(props.items) ? props.items : []
  const largest = items.reduce((max, item) => Math.max(max, item.weight || 0), 0)
  return el(
    'ul',
    { className: 'dshcl-chartBars' },
    items.map((item) =>
      el(
        'li',
        { className: 'dshcl-chartBarRow', key: item.key, 'data-bar': item.key },
        el('span', { className: 'dshcl-chartBarLabel', title: item.label }, item.label),
        el(
          'span',
          { className: 'dshcl-chartBarTrack' },
          el('span', {
            className: 'dshcl-chartBarFill' + (item.tone ? ' dshcl-chartBarFill' + item.tone : ''),
            style: { width: (largest > 0 ? Math.max(1, ((item.weight || 0) / largest) * 100) : 0) + '%' },
          }),
        ),
        el('span', { className: 'dshcl-chartBarValue' }, item.detail),
      ),
    ),
  )
}

/**
 * The list/chart switch, shaped like the panel's language switch.
 * @param props - `{ view, onView, t }`.
 * @returns the segmented control element.
 */
function renderViewSwitch(props) {
  const t = props.t
  const view = props.view === 'list' ? 'list' : 'chart'
  const option = (id, label) =>
    el(
      'button',
      {
        key: id,
        type: 'button',
        className: 'dshcl-langBtn' + (view === id ? ' dshcl-langBtnOn' : ''),
        'aria-pressed': view === id ? 'true' : 'false',
        'data-view': id,
        onClick: () => {
          if (typeof props.onView === 'function') props.onView(id)
        },
      },
      label,
    )
  return el(
    'div',
    { className: 'dshcl-lang dshcl-viewSwitch', role: 'group', 'aria-label': t('storage.view.label') },
    option('chart', t('storage.view.chart')),
    option('list', t('storage.view.list')),
  )
}

// ── other windows' generated files ──────────────────────────────────────────

/**
 * One working directory: where a window ran, what it holds, and what is inside.
 *
 * These are the reader's own projects, so no row here is ever a reclaim candidate
 * — the section answers "where did the other windows put things", which is a
 * different question from "what may I delete". `ownBytes` excludes any nested
 * window's directory, because a window opened at a parent of another window would
 * otherwise report that window's files as its own and the totals would double.
 * @param props - `{ row, t, language }`.
 * @returns the row element.
 */
function renderWorkdirRow(props) {
  const row = props.row
  const t = props.t
  const own = typeof row.ownBytes === 'number' ? row.ownBytes : row.bytes
  const nested = isArray(row.contains) ? row.contains : []
  const children = isArray(row.children) ? row.children : []
  const visible = children.filter((child) => !nested.some((inner) => inner === child.path))
  return el(
    'li',
    {
      className: 'dshcl-item dshcl-storageWorkdir',
      'data-workdir': row.path,
      'data-sessions': String(row.sessionCount === undefined ? 0 : row.sessionCount),
    },
    el(
      'div',
      { className: 'dshcl-itemHead' },
      el('h4', { className: 'dshcl-itemTitle dshcl-storageWorkdirName', title: row.path }, row.path),
      // A window opened at a parent of another window owns no files itself, so its
      // own measure is 0. Printing "0 B" there reads as "this directory is empty",
      // which is false — say where the space actually is instead.
      el(
        'span',
        { className: 'dshcl-storageSize' },
        own === 0 && nested.length > 0 ? t('storage.workdir.allNested') : formatBytes(own),
      ),
      el(
        'span',
        { className: 'dshcl-pill' },
        t('storage.workdir.sessions', { n: row.sessionCount === undefined ? 0 : row.sessionCount }),
      ),
    ),
    row.exists === false ? el('p', { className: 'dshcl-liveWarn' }, t('storage.workdir.missing')) : null,
    nested.length > 0
      ? el(
          'p',
          { className: 'dshcl-liveDate' },
          t('storage.workdir.contains', { n: nested.length, size: formatBytes(row.nestedBytes || 0) }),
        )
      : null,
    visible.length === 0
      ? el('p', { className: 'dshcl-liveDate' }, t('storage.workdir.flat'))
      : el(
          'ul',
          { className: 'dshcl-storageDetail' },
          visible.slice(0, 8).map((child) =>
            el(
              'li',
              { className: 'dshcl-storageDetailRow', key: child.path },
              el('span', { className: 'dshcl-storageWorkdirChild', title: child.path }, child.name),
              el('span', { className: 'dshcl-storageDetailValue' }, formatBytes(child.bytes)),
            ),
          ),
        ),
  )
}

/**
 * Every working directory any window ran in, largest first.
 *
 * This is the section that answers "were the other windows' files and scripts
 * counted, and where are they". The scan behind it groups sessions by their own
 * `cwd`, so a window that ran elsewhere appears here even though it is not the
 * workspace this panel happens to be opened in.
 * @param props - `{ report, t, language }`.
 * @returns the section element, or null when the report predates this data.
 */
function renderWorkdirTable(props) {
  const t = storageTranslator(props)
  const language = storageLanguage(props)
  const report = props.report || null
  if (!report || !report.workdirs || !isArray(report.workdirs.rows)) return null
  const rows = report.workdirs.rows
  const ownBytes = typeof report.workdirs.ownBytes === 'number' ? report.workdirs.ownBytes : null
  const naiveBytes = typeof report.workdirs.totalBytes === 'number' ? report.workdirs.totalBytes : null
  const deduped = ownBytes !== null && naiveBytes !== null && ownBytes !== naiveBytes
  return el(
    'section',
    { className: 'dshcl-storageSection', 'data-storage-section': 'workdirs' },
    el(
      'div',
      { className: 'dshcl-secHead' },
      el('span', { className: 'dshcl-secVer' }, t('storage.workdir.title')),
      ownBytes === null
        ? null
        : el('span', { className: 'dshcl-liveDate' }, t('storage.chart.total') + ' ' + formatBytes(ownBytes)),
    ),
    el('p', { className: 'dshcl-secSummary' }, t('storage.workdir.sub')),
    // Saying the deduplication out loud is what makes the number trustworthy: the
    // naive sum counts a nested window twice, and a reader who adds the visible
    // rows by hand must not conclude the panel is wrong.
    deduped
      ? el('p', { className: 'dshcl-liveDate' }, t('storage.workdir.dedupe', { size: formatBytes(naiveBytes - ownBytes) }))
      : null,
    el('p', { className: 'dshcl-liveDate' }, t('storage.workdir.notReclaimable')),
    rows.length === 0
      ? el('div', { className: 'dshcl-empty' }, t('storage.workdir.empty'))
      : props.view === 'chart'
        ? el(renderWorkdirChart, { rows: rows, t: t, language: language })
        : el(
            'ul',
            { className: 'dshcl-items' },
            rows.map((row) =>
              el(renderWorkdirRow, {
                key: row.path,
                row: row,
                t: t,
                language: language,
              }),
            ),
          ),
  )
}

/**
 * The working directories as a treemap of their own (non-nested) contents.
 *
 * `ownBytes` is what the chart is weighted by, so a window opened at a parent of
 * another window does not visually swallow the window inside it — the double-count
 * that made the first list view's totals read as 247.5 MB instead of 139.3 MB.
 * @param props - `{ rows, t, language }`.
 * @returns the chart element.
 */
function renderWorkdirChart(props) {
  const rows = isArray(props.rows) ? props.rows : []
  const t = props.t
  const own = (row) => (typeof row.ownBytes === 'number' ? row.ownBytes : row.bytes || 0)
  const nested = (row) => (isArray(row.contains) ? row.contains : [])
  // Leaves only: a container's area is its children's area, drawn once, by them.
  // Drawing a container AND its child double-counts, which once made the tiles add
  // up to 248 MB beside a stated total of 140 MB.
  const tiles = rows.filter((row) => nested(row).length === 0 && own(row) > 0)
  const containers = rows.filter((row) => nested(row).length > 0)
  const zeroLeaf = rows.filter((row) => nested(row).length === 0 && own(row) === 0)
  const chartedBytes = tiles.reduce((sum, row) => sum + own(row), 0)
  return el(
    'div',
    { className: 'dshcl-chartWrap', 'data-chart': 'workdirs' },
    el(renderTreemap, {
      // The treemap carries its own marker: `data-chart` above names the wrapper, so
      // a reader looking for the tiles must not match the wrapper and find none.
      'data-chart': 'workdirs-tiles',
      items: tiles.map((row) => ({
        key: row.path,
        // The basename is what fits inside a tile; the full path is the tooltip.
        label: row.path.split('/').filter(Boolean).pop() || row.path,
        weight: own(row),
        detail: formatBytes(own(row)),
      })),
    }),
    // Stated from the tiles, so the figure and the picture cannot disagree.
    el(renderChartTotal, { bytes: chartedBytes, label: t('storage.chart.total'), t: t }),
    containers.length > 0
      ? el('p', { className: 'dshcl-liveDate' }, t('storage.workdir.chartContainers', { n: containers.length }))
      : null,
    zeroLeaf.length > 0
      ? el('p', { className: 'dshcl-liveDate' }, t('storage.workdir.chartNested', { n: zeroLeaf.length }))
      : null,
  )
}

// ── reclaim plan ────────────────────────────────────────────────────────────

/**
 * One reclaim plan item.
 *
 * Informational only. There is no select control: reclaim runs through the
 * `storage_cleanup` Agent tool, and this panel has no way to invoke anything on the
 * host. A select button here would be dead on click — the exact defect this
 * rewrite exists to remove. What the reader needs from this row is what the item
 * is, how big it is, and the scanner's own reason for offering it.
 * @param props - `{ item, t, language }`.
 * @returns the item element.
 */
function renderPlanItem(props) {
  const item = props.item
  const t = props.t
  const language = props.language
  const meta = storagePick(STORAGE_KIND_LABEL, item.kind, 'other')
  const confidence = storagePick(STORAGE_CONFIDENCE_LABEL, item.confidence, 'low')
  const guarded = item.needsConfirmation === true
  return el(
    'li',
    {
      className: 'dshcl-item dshcl-storagePlanRow' + (item.confidence === 'low' ? ' dshcl-storagePlanRowLow' : ''),
      'data-plan-item': item.id,
      'data-kind': item.kind,
      'data-confidence': typeof item.confidence === 'string' ? item.confidence : 'unknown',
      'data-guarded': guarded ? 'true' : 'false',
    },
    el(
      'div',
      { className: 'dshcl-itemHead' },
      el('span', { className: 'dshcl-pill' }, storageLabel(t, language, meta)),
      el('h4', { className: 'dshcl-itemTitle' }, storageItemName(item)),
      el('span', { className: 'dshcl-storageSize' }, formatBytes(item.bytes)),
      el(
        'span',
        { className: 'dshcl-pill', style: { color: confidence.color }, title: storageWhy(language, confidence, 'hint') },
        storageLabel(t, language, confidence),
      ),
      // The id is what a reader passes to `storage_cleanup`, so it is shown rather
      // than hidden behind a control.
      el('code', { className: 'dshcl-storagePlanId', title: item.id }, item.id),
    ),
    el('p', { className: 'dshcl-storageReason' }, typeof item.reason === 'string' ? item.reason : ''),
    typeof item.path === 'string' && item.path !== ''
      ? el('p', { className: 'dshcl-storagePath', title: item.path }, item.path)
      : null,
    guarded ? el('p', { className: 'dshcl-liveDate' }, t('storage.plan.armTitle')) : null,
  )
}

/**
 * The reclaim plan: the scanner's candidates grouped by kind.
 *
 * A list, not a control surface. Reclaim is executed by the `storage_cleanup`
 * Agent tool, so this section answers "what is reclaimable, how much, and why
 * did the scanner offer it" and nothing else. The ids are printed because they
 * are the argument the reader hands to that tool.
 * @param props - `{ plan, t, language }`.
 * @returns the plan element.
 */
function renderReclaimPlan(props) {
  const t = storageTranslator(props)
  const language = storageLanguage(props)
  const plan = props.plan || null
  const items = plan && isArray(plan.items) ? plan.items.filter((item) => item && typeof item.id === 'string') : []
  const groups = storagePlanGroups(items)

  return el(
    'section',
    { className: 'dshcl-storageSection', 'data-storage-section': 'plan' },
    el(
      'div',
      { className: 'dshcl-secHead' },
      el('span', { className: 'dshcl-secVer' }, t('storage.plan.title')),
      plan
        ? el(
            'span',
            { className: 'dshcl-liveDate' },
            t('storage.plan.sub', { n: items.length, size: formatBytes(plan.bytes) }),
          )
        : null,
    ),
    el('p', { className: 'dshcl-secSummary' }, t('storage.plan.disclaimer')),
    el('p', { className: 'dshcl-liveDate' }, t('storage.plan.scope')),
    groups.length === 0
      ? el('div', { className: 'dshcl-empty' }, t('storage.plan.empty'))
      : groups.map(([kind, rows]) =>
          el(
            'section',
            { className: 'dshcl-group', key: kind, 'data-plan-kind': kind },
            el(
              'div',
              { className: 'dshcl-groupHead' },
              el('span', null, storageLabel(t, language, storagePick(STORAGE_KIND_LABEL, kind, 'other'))),
              el(
                'span',
                { className: 'dshcl-count' },
                '· ' +
                  t('storage.plan.sub', {
                    n: rows.length,
                    size: formatBytes(storagePlanKindBytes(plan, kind, rows)),
                  }),
              ),
            ),
            el(
              'ul',
              { className: 'dshcl-items' },
              rows.map((item) =>
                el(renderPlanItem, {
                  key: item.id,
                  item: item,
                  t: t,
                  language: language,
                }),
              ),
            ),
          ),
        ),
  )
}

/**
 * The failed entries of a trash result, normalised.
 * @param failed - `trashPaths()`'s `failed`: `[{ paths, reason }]`.
 * @returns `[{ paths, reason }]` with paths always an array.
 */
function storageResultFailures(failed) {
  if (!isArray(failed)) return []
  return failed.map((entry) => ({
    paths: entry && isArray(entry.paths) ? entry.paths.map((path) => String(path)) : [],
    reason: entry && typeof entry.reason === 'string' ? entry.reason : '',
  }))
}

/**
 * How many paths a failed trash result covers.
 * @param failed - `trashPaths()`'s `failed`.
 * @returns the number of paths the OS refused.
 */
function storageResultFailureCount(failed) {
  if (!isArray(failed)) return 0
  return failed.reduce((sum, entry) => sum + (entry && isArray(entry.paths) ? entry.paths.length : 1), 0)
}

// ── the whole view ──────────────────────────────────────────────────────────

/**
 * The storage view: summary, cost breakdown, session table and reclaim plan.
 *
 * Purely presentational — it reads a report; it never scans, reads a file, or
 * touches the trash. Reclaim is not a callback here on purpose: the only half with
 * filesystem authority is the host, reached through the `storage_cleanup` Agent
 * tool, so no control in this view can delete anything.
 * @param props - `{ report, plan, t, language, busy, error, onRefresh, onRescan,
 *   canReveal, onOpenSession, onReveal, view, onView }`.
 * @returns the view element.
 */
/**
 * What this dashboard is and what the reader can do with it.
 *
 * The first reader asked "我不知道怎么使用" — the panel showed numbers without
 * saying where they came from, why one category must not be deleted, or why the
 * reclaim list has no button. Three sentences remove that whole class of question.
 * @param props - `{ t }`.
 * @returns the explanation block.
 */
function renderStorageHelp(props) {
  const t = props.t
  return el(
    'section',
    { className: 'dshcl-storageSection dshcl-storageHelp', 'data-storage-help': 'true' },
    el('div', { className: 'dshcl-secHead' }, el('span', { className: 'dshcl-secVer' }, t('storage.help.title'))),
    el(
      'ul',
      { className: 'dshcl-storageHelpList' },
      el('li', null, t('storage.help.what')),
      el('li', null, t('storage.help.reclaim')),
      el('li', null, t('storage.help.how')),
      el('li', null, t('storage.help.readonly')),
    ),
  )
}

function renderStoragePanel(props) {
  const t = storageTranslator(props)
  const language = storageLanguage(props)
  const report = props.report || null
  const plan = props.plan || (report && report.plan ? report.plan : null)
  const scanFailed = report !== null && typeof report.error === 'string' && report.error !== ''
  return el(
    'div',
    { className: 'dshcl-storage', 'data-storage-panel': 'true' },
    el(renderStorageHelp, { t: t }),
    el(renderStorageSummary, {
      report: report,
      plan: plan,
      t: t,
      language: language,
      busy: props.busy,
      error: props.error,
      onRefresh: props.onRefresh,
      onRescan: props.onRescan,
      // The view switch lives in this header, so these two must travel with it.
      view: props.view,
      onView: props.onView,
    }),
    // A failed scan has no numbers to show, so the sections below it are not
    // rendered at all rather than rendered empty.
    report === null || scanFailed
      ? null
      : el(renderCostBreakdown, { report: report, t: t, language: language, view: props.view }),
    // Before the session table: "which windows exist and what do they hold" is the
    // question this section answers, and the per-conversation detail below it is
    // the drill-down.
    report === null || scanFailed
      ? null
      : el(renderWorkdirTable, { report: report, t: t, language: language, view: props.view }),
    report === null || scanFailed
      ? null
      : el(renderSessionTable, {
          report: report,
          canReveal: props.canReveal,
          t: t,
          language: language,
          onOpenSession: props.onOpenSession,
          onReveal: props.onReveal,
        }),
    plan
      ? el(renderReclaimPlan, { plan: plan, t: t, language: language })
      : null,
  )
}

export {
  renderStoragePanel,
  renderStorageHelp,
  renderStorageSummary,
  renderCostBreakdown,
  renderSessionTable,
  renderViewSwitch,
  renderWorkdirChart,
  renderChartTotal,
  renderTreemap,
  renderBars,
  treemapLayout,
  renderWorkdirTable,
  renderReclaimPlan,
  renderStorageStatus,
  STORAGE_STATUS,
  formatBytes,
}
