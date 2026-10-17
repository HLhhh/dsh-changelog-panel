/**
 * Browser half of the DeepSeek Harness changelog & vulnerability panel.
 *
 * This file is the source of truth for `plugin/lib/client.js`; `tests/build.mjs`
 * concatenates it with the `src/data/*.mjs` modules and wraps both in the
 * lazy-CJS factory the dsh module system loads. It therefore stays free of
 * imports and writes its elements with `React.createElement`.
 *
 * Contributions:
 * - `sidebar.panellist` — the sidebar icon that selects the panel.
 * - `main` (keyed by the same id) — the full-center-column panel body.
 *
 * @module dsh-changelog-panel/client
 */

/** Registration id; the panellist row and the keyed `main` entry must share it. */
const PANEL_ID = 'changelog'
/** Required cordis services, resolved by the client module system before apply(). */
// `remote` itself must be injected before `ctx.remote` is readable at all: asking
// for the service without it throws "cannot get property \"remote\" without inject".
// The shipped sidebar-files plugin declares both, for the same reason.
// Every service the panels read must be declared: asking for an undeclared one
// throws "cannot get property X without inject". `remote` gates `ctx.remote`,
// `remote.workspaceFiles` gates the file read, and `sessions` gates the session
// list the file read needs a `sessionId` from. The shipped sidebar-files and
// ui-session plugins declare the same set for the same reasons.
const inject = ['slots', 'locale', 'sessions', 'remote', 'remote.workspaceFiles']
/** Accent used for the "latest" release and the security view. */
const CSS_TAG_ID = 'dsh-changelog-panel/panel.css'

// ── data access with graceful degradation ───────────────────────────────────
// The build inlines the data modules as top-level consts. They are referenced
// defensively so the panel still renders (with an empty state) if a dataset is
// ever missing or malformed, instead of throwing inside the render pass.

const isArray = (value) => Array.isArray(value)

/**
 * Derive a release channel from a version string.
 * @param version - a semver-ish version such as `0.2.0-rc.2`.
 * @returns `'stable'` when there is no prerelease tag, else the tag's first word.
 */
function channelOfVersion(version) {
  const match = /^[0-9][^-]*-([A-Za-z]+)/.exec(String(version))
  return match ? match[1].toLowerCase() : 'stable'
}

/**
 * Read one dataset string in the panel's current language.
 *
 * Schema revision 2 stores reader-facing prose as a frozen `{ en, zh }` pair
 * built by `L()`; revision 1 used plain strings. Both shapes are accepted so the
 * panel renders while a dataset migrates, and a pair missing its Chinese falls
 * back to English rather than rendering an empty card or `[object Object]`.
 * @param value - a `{ en, zh }` pair, a plain string, or anything else.
 * @param language - 'zh' or 'en'.
 * @returns display text, or '' when there is nothing readable.
 */
function pickText(value, language) {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return value == null ? '' : String(value)
  const preferred = language === 'zh' ? value.zh : value.en
  const fallback = language === 'zh' ? value.en : value.zh
  if (typeof preferred === 'string' && preferred.length > 0) return preferred
  if (typeof fallback === 'string' && fallback.length > 0) return fallback
  return ''
}

/**
 * Read a dataset string list in the panel's language, dropping empties.
 * @param values - array of pairs or strings.
 * @param language - 'zh' or 'en'.
 * @returns display strings.
 */
function pickTextList(values, language) {
  if (!isArray(values)) return []
  return values.map((entry) => pickText(entry, language)).filter((entry) => entry.length > 0)
}

/**
 * Resolve one dictionary key for an explicit language.
 *
 * The framework's bound translator follows the GUI's active language; this panel
 * lets a reader pick a different one, so the bound translator cannot be used for
 * the panel's own strings. Everything the panel says therefore goes through a
 * `t(language, key, params)` callback the registration injects.
 * @param translator - the namespace-bound translator from `ctx.locale.bind()`.
 * @param language - 'zh' or 'en'.
 * @param key - dictionary key.
 * @param params - optional `{name}` substitutions.
 * @returns the resolved text, falling back to English and then to the key.
 */
function translateTo(translator, language, key, params) {
  const table = {}
  const source = language === 'zh' ? zh : en
  const other = language === 'zh' ? en : zh
  if (source[key] !== undefined) table[key] = source[key]
  else if (other[key] !== undefined) table[key] = other[key]
  else if (typeof translator === 'function') return translator(key, params)
  let text = table[key] !== undefined ? table[key] : key
  if (params) {
    for (const name of Object.keys(params)) text = text.split('{' + name + '}').join(String(params[name]))
  }
  return text
}
const dataReleases = () => (typeof RELEASES !== 'undefined' && isArray(RELEASES) ? RELEASES : [])
const dataFeatures = () => (typeof FEATURES !== 'undefined' && isArray(FEATURES) ? FEATURES : [])
const dataAdvisories = () => (typeof ADVISORIES !== 'undefined' && isArray(ADVISORIES) ? ADVISORIES : [])
const dataCoverage = () => (typeof ADVISORY_COVERAGE !== 'undefined' && ADVISORY_COVERAGE ? ADVISORY_COVERAGE : null)
const dataSources = () => (typeof SOURCES !== 'undefined' && isArray(SOURCES) ? SOURCES : [])

// ── live-data cache ─────────────────────────────────────────────────────────

/** localStorage key holding the last successful live fetch. */
const LIVE_CACHE_KEY = 'dsh-changelog-panel/live-v1'
/** A cached payload older than this is still shown, but marked stale. */
const LIVE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Read the cached live payload.
 *
 * `localStorage` can throw (disabled storage, quota, private mode), so every
 * access is guarded and a failure degrades to "no cache" rather than breaking
 * the panel. The cache only ever holds data we fetched ourselves, so a stale or
 * corrupt entry is discarded instead of being repaired.
 * @returns the cached payload, or null.
 */
function readLiveCache() {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(LIVE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (!isArray(parsed.releases) || parsed.releases.length === 0) return null
    if (typeof parsed.fetchedAt !== 'string') return null
    const age = Date.now() - Date.parse(parsed.fetchedAt)
    if (!Number.isFinite(age) || age > LIVE_CACHE_MAX_AGE_MS) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Persist the live payload for the next page load.
 * @param payload - a successful `fetchLiveData` result.
 * @returns {void}
 */
function writeLiveCache(payload) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(LIVE_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // A cache that cannot be written is not an error the reader needs to see.
  }
}

/** localStorage key recording the day of the last automatic refresh. */
const AUTO_REFRESH_DAY_KEY = 'dsh-changelog-panel/auto-refresh-day'

/**
 * Local calendar day, as `YYYY-MM-DD`.
 *
 * Local rather than UTC: "the first time I open it today" is the reader's day, and
 * a UTC boundary would move the refresh to an arbitrary hour of their evening.
 * @param now - a Date, for testability.
 * @returns the local day key.
 */
function localDayKey(now) {
  const at = now instanceof Date ? now : new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return at.getFullYear() + '-' + pad(at.getMonth() + 1) + '-' + pad(at.getDate())
}

/**
 * Whether an automatic refresh is due today.
 * @param now - a Date, for testability.
 * @returns true when today's automatic refresh has not run yet.
 */
function autoRefreshDue(now) {
  try {
    if (typeof localStorage === 'undefined') return true
    return localStorage.getItem(AUTO_REFRESH_DAY_KEY) !== localDayKey(now)
  } catch {
    // Unreadable storage means we cannot prove it ran today, so treat it as due.
    return true
  }
}

/** Record that today's automatic refresh has run. */
function markAutoRefreshed(now) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(AUTO_REFRESH_DAY_KEY, localDayKey(now))
  } catch {
    // A marker that cannot be written only costs one extra refresh later.
  }
}

/** Forget the cache (used when a fetch fails so a bad payload cannot stick). */
function clearLiveCache() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(LIVE_CACHE_KEY)
  } catch {
    // ignore
  }
}

// ── language ────────────────────────────────────────────────────────────────

/** The two languages this panel writes itself in. */
const PANEL_LANGUAGES = [
  { id: 'zh', label: '中文', tag: 'zh' },
  { id: 'en', label: 'EN', tag: 'en' },
]

/**
 * The id of the GUI's currently active locale, lower-cased.
 *
 * The framework hands each plugin a translator already bound to the active
 * language, so the panel follows the GUI for free. The id is only needed as the
 * *default* for the in-panel language switch, which exists because a reader may
 * want a different language from the rest of the shell.
 * @param props - composed slot props.
 * @returns the active locale id, or '' when the service cannot answer.
 */
function activeLocaleId(props) {
  const locale = props && props.locale
  if (!locale || typeof locale.getLocale !== 'function') return ''
  try {
    const snapshot = locale.getLocale()
    return snapshot && typeof snapshot.active === 'string' ? snapshot.active.toLowerCase() : ''
  } catch {
    return ''
  }
}

/**
 * Pick the panel's display language for this render.
 * @param override - the reader's choice from the language switch, if any.
 * @param activeId - the GUI's active locale id.
 * @returns 'zh' or 'en'.
 */
function pickLocale(override, activeId) {
  if (override === 'zh' || override === 'en') return override
  return activeId.indexOf('zh') === 0 ? 'zh' : 'en'
}

/**
 * Switch the GUI language through the framework's locale service. Used only when
 * the reader has not overridden the language for this panel.
 * @param props - composed slot props.
 * @param id - locale id to activate.
 * @returns whether the call was issued.
 */
function setGuiLocale(props, id) {
  const locale = props && props.locale
  if (!locale || typeof locale.setLocale !== 'function') return false
  try {
    // The catalog registers exactly the ids 'zh' and 'en'; setLocale THROWS for
    // anything else, so the panel's own 'zh' sentinel is what must be passed.
    const target = id === 'zh' ? 'zh' : 'en'
    const result = locale.setLocale(target)
    return result !== false
  } catch {
    return false
  }
}

// ── vocabulary ──────────────────────────────────────────────────────────────

/**
 * JSON endpoints a reader can still open in a browser and read usefully: a single
 * recorded advisory, unlike the batch/query APIs the sweep used.
 */
const BROWSABLE_API_ENDPOINTS = [/^https:\/\/api\.osv\.dev\/v1\/vulns\//]

/** Hosts that answer only machine clients; their URLs are not usable as links. */
const JSON_API_HOSTS = ['api.osv.dev', 'services.nvd.nist.gov', 'api.github.com']

/**
 * Whether a source URL is worth rendering as a clickable link. Sweep and search
 * APIs answer JSON only to POST, or return a document no reader can use, so they
 * are listed as evidence text instead of being offered as a link a reader would
 * find broken.
 * @param url - source URL.
 * @returns true when the URL is a browsable page.
 */
function isBrowsableUrl(url) {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return false
  if (BROWSABLE_API_ENDPOINTS.some((pattern) => pattern.test(url))) return true
  return !JSON_API_HOSTS.some((host) => url.indexOf('//' + host + '/') !== -1)
}

const CATEGORY_ORDER = ['agent', 'tools', 'sessions', 'ui', 'plugins', 'platform', 'security']
const CATEGORY_META = {
  agent: { zh: '智能体', en: 'Agent', color: 'var(--dsw-alias-state-success-primary, #2f9e63)' },
  tools: { zh: '工具', en: 'Tools', color: 'var(--dsw-alias-state-info-primary, #3b7ddd)' },
  sessions: { zh: '会话', en: 'Sessions', color: 'var(--dsw-alias-state-warning-primary, #c58a20)' },
  ui: { zh: '界面', en: 'Interface', color: 'var(--dsw-alias-state-brand-primary, #6a5cff)' },
  plugins: { zh: '插件', en: 'Plugins', color: 'var(--dsw-alias-state-info-primary, #3b7ddd)' },
  platform: { zh: '平台', en: 'Platform', color: 'var(--dsw-alias-state-success-primary, #2f9e63)' },
  security: { zh: '安全', en: 'Security', color: 'var(--dsw-alias-state-error-primary, #d94a4a)' },
}
const SEVERITY_META = {
  critical: { zh: '严重', en: 'Critical', color: 'var(--dsw-alias-state-error-primary, #d94a4a)' },
  high: { zh: '高危', en: 'High', color: 'var(--dsw-alias-state-error-primary, #d94a4a)' },
  medium: { zh: '中危', en: 'Medium', color: 'var(--dsw-alias-state-warning-primary, #c58a20)' },
  low: { zh: '低危', en: 'Low', color: 'var(--dsw-alias-label-tertiary, #8b8b8b)' },
  info: { zh: '提示', en: 'Info', color: 'var(--dsw-alias-state-info-primary, #3b7ddd)' },
  unknown: { zh: '未知', en: 'Unknown', color: 'var(--dsw-alias-label-tertiary, #8b8b8b)' },
}
const STATUS_META = {
  fixed: { zh: '已修复', en: 'Fixed', color: 'var(--dsw-alias-state-success-primary, #2f9e63)' },
  affected: { zh: '受影响', en: 'Affected', color: 'var(--dsw-alias-state-error-primary, #d94a4a)' },
  watched: { zh: '持续关注', en: 'Watched', color: 'var(--dsw-alias-state-warning-primary, #c58a20)' },
  'not-affected': { zh: '不受影响', en: 'Not affected', color: 'var(--dsw-alias-label-tertiary, #8b8b8b)' },
}
/**
 * How each record relates to the build installed here. "A CVE exists for this
 * project" and "this install is vulnerable" are different claims, so the panel
 * states which one applies instead of leaving the reader to assume.
 */
const INSTALL_META = {
  yes: { key: 'install.yes', color: 'var(--dsw-alias-state-error-primary, #d94a4a)' },
  no: { key: 'install.no', color: 'var(--dsw-alias-state-success-primary, #2f9e63)' },
  unknown: { key: 'install.unknown', color: 'var(--dsw-alias-label-tertiary, #8b8b8b)' },
}

// ── inline styles ───────────────────────────────────────────────────────────
// One style element per plugin, keyed exactly like the shipped bundles key
// theirs, so HMR/reload cannot double-inject and the host can evict it.

const CSS = `
.dshcl-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base,transparent);color:var(--dsw-alias-label-primary,inherit)}
.dshcl-head{flex:none;display:flex;flex-direction:column;gap:10px;padding:18px 28px 12px;border-bottom:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.22))}
.dshcl-headTop{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.dshcl-headRefresh{margin-left:auto;display:flex;align-items:center}
.dshcl-search{justify-content:flex-end}
.dshcl-headText{min-width:0;flex:1}
.dshcl-title{margin:0;font-size:20px;line-height:28px;font-weight:600;letter-spacing:-.01em}
.dshcl-sub{margin:3px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,inherit)}
.dshcl-search{flex:none;display:flex;align-items:center;gap:8px}
.dshcl-storageHelp{padding:12px 16px}
.dshcl-storageHelpList{margin:6px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:5px}
.dshcl-storageHelpList li{font-size:12px;line-height:19px;color:var(--dsw-alias-label-secondary,inherit)}
.dshcl-storageSelection{position:sticky;top:0;z-index:2;background:var(--dsw-specific-menu,var(--dsw-alias-bg-base,Canvas));box-shadow:var(--dsw-elevation-subtle,none)}
.dshcl-storageSelectionText{width:100%;box-sizing:border-box;margin-top:8px;min-height:76px;font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:11px;line-height:17px;color:var(--dsw-alias-label-secondary,inherit);background:var(--dsw-alias-fill-l1,rgba(128,128,128,.06));border:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.22));border-radius:var(--dsw-radius-md,8px);padding:8px;resize:vertical}
.dshcl-chartTotal{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:8px 2px 0;border-top:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.2));margin-top:2px}
.dshcl-chartTotalLabel{font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-tertiary,inherit)}
.dshcl-chartTotalValue{font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:15px;font-weight:600;line-height:22px;color:var(--dsw-alias-label-primary,inherit)}
.dshcl-viewSwitch{margin-right:4px}
.dshcl-viewSwitch .dshcl-langBtn{min-width:44px}
.dshcl-chartWrap{display:flex;flex-direction:column;gap:8px}
.dshcl-chartTreemap{position:relative;width:100%;height:240px;border-radius:var(--dsw-radius-lg,10px);overflow:hidden;background:var(--dsw-alias-fill-l1,rgba(128,128,128,.06))}
.dshcl-chartTile{position:absolute;box-sizing:border-box;border:.5px solid var(--dsw-alias-bg-base,Canvas);overflow:hidden;display:flex;align-items:flex-start;padding:7px 9px;background:var(--dsw-alias-fill-l2,rgba(128,128,128,.16))}
.dshcl-chartTileLocked{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d94a4a) 22%,transparent)}
.dshcl-chartTileFree{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2f9e63) 22%,transparent)}
.dshcl-chartTileCare{background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#c58a20) 22%,transparent)}
.dshcl-chartTileLabel{display:flex;flex-direction:column;gap:1px;min-width:0}
.dshcl-chartTileName{font-size:11.5px;line-height:16px;font-weight:600;color:var(--dsw-alias-label-primary,inherit);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshcl-chartTileValue{font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:10.5px;line-height:15px;color:var(--dsw-alias-label-secondary,inherit);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshcl-chartBars{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.dshcl-chartBarRow{display:flex;align-items:center;gap:10px}
.dshcl-chartBarLabel{flex:0 0 30%;font-size:11.5px;line-height:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshcl-chartBarTrack{flex:1;height:10px;border-radius:999px;background:var(--dsw-alias-fill-l2,rgba(128,128,128,.14));overflow:hidden}
.dshcl-chartBarFill{display:block;height:100%;border-radius:999px;background:var(--dsw-alias-state-info-primary,#3b7ddd)}
.dshcl-chartBarFillLocked{background:var(--dsw-alias-state-error-primary,#d94a4a)}
.dshcl-chartBarFillFree{background:var(--dsw-alias-state-success-primary,#2f9e63)}
.dshcl-chartBarFillCare{background:var(--dsw-alias-state-warning-primary,#c58a20)}
.dshcl-chartBarValue{flex:0 0 84px;text-align:right;font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:11px;color:var(--dsw-alias-label-secondary,inherit)}
.dshcl-storageMain{display:block;padding:18px 22px 56px}
.dshcl-storage{display:flex;flex-direction:column;gap:18px}
.dshcl-storageSection{border-radius:var(--dsw-radius-lg,10px);border:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.22));padding:14px 16px 16px;background:var(--dsw-alias-fill-l1,rgba(128,128,128,.03))}
.dshcl-storageSummary{display:flex;flex-direction:column;gap:10px}
.dshcl-storageStats{display:flex;flex-wrap:wrap;gap:18px}
.dshcl-storageStat{display:flex;flex-direction:column;gap:2px;min-width:96px}
.dshcl-storageStatLabel{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,inherit)}
.dshcl-storageStatValue{font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:17px;font-weight:600;line-height:24px;color:var(--dsw-alias-label-primary,inherit)}
.dshcl-storageStatus{display:flex;align-items:center;gap:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,inherit)}
.dshcl-storageStatusBusy{color:var(--dsw-alias-state-info-primary,#3b7ddd)}
.dshcl-storageStatusOk{color:var(--dsw-alias-state-success-primary,#2f9e63)}
.dshcl-storageStatusError{color:var(--dsw-alias-state-error-primary,#d94a4a)}
.dshcl-storageStatusDetail{color:var(--dsw-alias-label-tertiary,inherit)}
.dshcl-storageControls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dshcl-storageBtn{font-size:12px}
.dshcl-storagePath{font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:11px;color:var(--dsw-alias-label-tertiary,inherit);word-break:break-all}
.dshcl-storageSize{font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:12px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary,inherit);flex:none}
.dshcl-storageRow{display:flex;align-items:center;gap:10px;padding:5px 0}
.dshcl-storageBar{flex:1;min-width:60px;height:6px;border-radius:999px;background:var(--dsw-alias-fill-l2,rgba(128,128,128,.14));overflow:hidden}
.dshcl-storageBarFill{height:100%;border-radius:999px;background:var(--dsw-alias-state-info-primary,#3b7ddd)}
.dshcl-storageReclaim{flex:none;border-radius:999px;padding:0 7px;font-size:10px;line-height:16px;border:.5px solid currentColor}
.dshcl-storageReclaimNever{color:var(--dsw-alias-label-tertiary,inherit)}
.dshcl-storageReclaimAll{color:var(--dsw-alias-state-success-primary,#2f9e63)}
.dshcl-storageReclaimSome{color:var(--dsw-alias-state-warning-primary,#c58a20)}
.dshcl-storageReclaimUnknown{color:var(--dsw-alias-label-tertiary,inherit)}
.dshcl-storageWorkdir{border-left:2px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));padding-left:10px}
.dshcl-storageWorkdirName{font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:12px;word-break:break-all}
.dshcl-storageWorkdirChild{font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:11px;color:var(--dsw-alias-label-secondary,inherit);word-break:break-all;margin-right:auto}
.dshcl-storageDetail{display:flex;flex-direction:column;gap:3px;margin:4px 0 0 18px;padding-left:10px;border-left:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.2))}
.dshcl-storageDetailRow{display:flex;align-items:center;gap:10px;font-size:11.5px;line-height:18px}
.dshcl-storageDetailValue{color:var(--dsw-alias-label-tertiary,inherit);font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace)}
.dshcl-storageWorkspace{margin-top:12px}
.dshcl-storageSession{display:flex;align-items:flex-start;gap:10px;padding:7px 9px;border-radius:var(--dsw-radius-md,8px)}
.dshcl-storageSession:hover{background:var(--dsw-alias-fill-l1,rgba(128,128,128,.06))}
.dshcl-storageMeta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary,inherit)}
.dshcl-storageActions{display:flex;gap:6px;margin-left:auto;flex:none;opacity:.35;transition:opacity .12s}
.dshcl-storageSession:hover .dshcl-storageActions,.dshcl-storageSession:focus-within .dshcl-storageActions{opacity:1}
.dshcl-storageSubs{margin-left:22px;border-left:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.24));padding-left:8px}
.dshcl-storageSubRow{display:flex;align-items:center;gap:8px;padding:3px 0;font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-secondary,inherit)}
.dshcl-storagePlanRow{display:flex;align-items:center;gap:10px;padding:7px 9px;border-radius:var(--dsw-radius-md,8px);border:.5px solid transparent}
.dshcl-storagePlanRow:hover{background:var(--dsw-alias-fill-l1,rgba(128,128,128,.06))}
.dshcl-storagePlanRowLow{border-style:dashed;border-color:var(--dsw-alias-border-l2,rgba(128,128,128,.28))}
.dshcl-storageReason{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary,inherit);max-width:60ch}
.dshcl-storageFoot{display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:10px;border-top:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.2))}
.dshcl-storageArm{font-size:11px;color:var(--dsw-alias-state-warning-primary,#c58a20)}
.dshcl-storageArmOn{color:var(--dsw-alias-state-error-primary,#d94a4a);font-weight:600}
.dshcl-live{margin-top:26px;border-top:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.22));padding-top:14px}
.dshcl-liveHead{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.dshcl-liveTitle{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,inherit);margin:0}
.dshcl-liveControls{display:inline-flex;align-items:center;gap:6px;margin-left:auto}
.dshcl-liveBtn{border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));background:var(--dsw-specific-menu,transparent);color:var(--dsw-alias-label-secondary,inherit);cursor:pointer;border-radius:var(--dsw-radius-md,8px);padding:4px 10px;font-size:12px;line-height:18px}
.dshcl-liveBtn:hover:not(:disabled){color:var(--dsw-alias-label-primary,inherit);border-color:var(--dsw-alias-border-l2,rgba(128,128,128,.5))}
.dshcl-liveBtn:disabled{cursor:default;opacity:.55}
.dshcl-liveStatus{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,inherit)}
.dshcl-liveStatusOk{color:var(--dsw-alias-state-success-primary,#2f9e63)}
.dshcl-liveStatusWarn{color:var(--dsw-alias-state-warning-primary,#c58a20)}
.dshcl-liveStatusError{color:var(--dsw-alias-state-error-primary,#d94a4a)}
.dshcl-liveWarn{margin:6px 0 0;padding:0;font-size:11.5px;line-height:18px;color:var(--dsw-alias-state-warning-primary,#c58a20);list-style:none}
ul.dshcl-liveWarn li{margin:2px 0}
.dshcl-liveRelease{margin-top:14px;border:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.22));border-radius:var(--dsw-radius-lg,10px);padding:11px 13px 13px;background:var(--dsw-alias-fill-l1,rgba(128,128,128,.04))}
.dshcl-liveReleaseHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dshcl-liveDate{font-size:11.5px;color:var(--dsw-alias-label-tertiary,inherit)}
.dshcl-liveNoteHead{display:flex;align-items:center;gap:7px;margin-top:12px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,inherit)}
.dshcl-liveItem{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;border-radius:var(--dsw-radius-md,8px);padding:5px 8px;background:var(--dsw-alias-fill-l1,rgba(128,128,128,.04))}
.dshcl-liveItemText{font-size:12.5px;line-height:19px;color:var(--dsw-alias-label-primary,inherit);flex:1;min-width:0}
.dshcl-liveCredits{display:inline-flex;gap:4px;flex-wrap:wrap}
.dshcl-ver{display:inline-flex;align-items:center;gap:7px;flex:none}
.dshcl-verValue{font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary,inherit);padding:2px 7px;border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-fill-l2,rgba(128,128,128,.14))}
.dshcl-verState{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary,inherit);white-space:nowrap}
.dshcl-verStateOk{color:var(--dsw-alias-state-success-primary,#2f9e63)}
.dshcl-verStateBehind{color:var(--dsw-alias-state-warning-primary,#c58a20)}
.dshcl-verStateAhead{color:var(--dsw-alias-state-info-primary,#3b7ddd)}
.dshcl-verStateUnknown{color:var(--dsw-alias-label-tertiary,inherit)}
.dshcl-lang{display:inline-flex;gap:2px;padding:2px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-fill-l1,rgba(128,128,128,.08))}
.dshcl-langBtn{border:0;background:0 0;cursor:pointer;border-radius:var(--dsw-radius-sm,6px);padding:4px 9px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,inherit)}
.dshcl-langBtn:hover{color:var(--dsw-alias-label-primary,inherit)}
.dshcl-langOn{background:var(--dsw-specific-menu,var(--dsw-alias-fill-l2,rgba(128,128,128,.18)));color:var(--dsw-alias-label-primary,inherit)}
.dshcl-input{width:220px;box-sizing:border-box;min-height:30px;padding:5px 10px;border-radius:var(--dsw-radius-md,8px);border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));background:var(--dsw-alias-fill-l1,rgba(128,128,128,.06));color:inherit;font-size:12.5px;outline:none}
.dshcl-input:focus-visible{border-color:var(--dsw-alias-state-brand-primary,#6a5cff)}
.dshcl-tabs{display:inline-flex;gap:2px;padding:2px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-fill-l1,rgba(128,128,128,.08))}
.dshcl-tab{border:0;background:0 0;cursor:pointer;border-radius:var(--dsw-radius-sm,6px);padding:4px 10px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,inherit)}
.dshcl-tab:hover{color:var(--dsw-alias-label-primary,inherit)}
.dshcl-tabOn{background:var(--dsw-specific-menu,var(--dsw-alias-fill-l2,rgba(128,128,128,.16)));color:var(--dsw-alias-label-primary,inherit);box-shadow:var(--dsw-elevation-subtle,none)}
.dshcl-body{flex:1;min-height:0;display:flex}
.dshcl-rail{flex:none;width:212px;overflow:auto;padding:14px 10px 28px;border-right:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.22))}
.dshcl-railLabel{padding:0 8px 8px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,inherit)}
.dshcl-railItem{display:block;width:100%;text-align:left;border:0;background:0 0;cursor:pointer;border-radius:var(--dsw-radius-md,8px);padding:8px 10px;color:inherit}
.dshcl-railItem:hover{background:var(--dsw-alias-fill-l1,rgba(128,128,128,.08))}
.dshcl-railItemOn{background:var(--dsw-alias-fill-l2,rgba(128,128,128,.14))}
.dshcl-railTop{display:flex;align-items:center;gap:6px}
.dshcl-ver{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12.5px;font-weight:600}
.dshcl-railDate{margin-top:2px;font-size:11px;color:var(--dsw-alias-label-tertiary,inherit)}
.dshcl-pill{flex:none;border-radius:999px;padding:0 6px;font-size:10px;line-height:16px;border:.5px solid currentColor;opacity:.9}
.dshcl-newPill{flex:none;border-radius:999px;padding:0 6px;font-size:10px;line-height:16px;background:var(--dsw-alias-state-success-primary,#2f9e63);color:#fff}
.dshcl-main{flex:1;min-width:0;overflow:auto;padding:22px 28px 64px}
.dshcl-secHead{display:flex;align-items:center;gap:10px;margin:0 0 4px}
.dshcl-secVer{font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:17px;font-weight:600}
.dshcl-secDate{font-size:12px;color:var(--dsw-alias-label-tertiary,inherit)}
.dshcl-secSummary{margin:6px 0 0;max-width:74ch;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary,inherit)}
.dshcl-group{margin-top:20px}
.dshcl-groupHead{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,inherit)}
.dshcl-dot{width:8px;height:8px;border-radius:999px;flex:none}
.dshcl-count{color:var(--dsw-alias-label-tertiary,inherit);font-weight:400}
.dshcl-items{margin:10px 0 0;padding:0;list-style:none;display:grid;gap:8px}
.dshcl-item{position:relative;border-radius:var(--dsw-radius-lg,10px);border:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.22));background:var(--dsw-alias-fill-l1,rgba(128,128,128,.04));padding:11px 13px 12px}
.dshcl-item:hover{border-color:var(--dsw-alias-border-l2,rgba(128,128,128,.36))}
.dshcl-itemHead{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.dshcl-itemTitle{font-size:13.5px;font-weight:600;line-height:20px;margin:0}
.dshcl-itemSummary{margin:5px 0 0;font-size:12.5px;line-height:19px;color:var(--dsw-alias-label-secondary,inherit);max-width:82ch}
.dshcl-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.dshcl-tag{font-family:var(--dsw-font-mono,ui-monospace,Menlo,monospace);font-size:10.5px;line-height:16px;padding:1px 6px;border-radius:var(--dsw-radius-xs,4px);background:var(--dsw-alias-fill-l2,rgba(128,128,128,.12));color:var(--dsw-alias-label-secondary,inherit)}
.dshcl-refs{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}
.dshcl-ref{font-size:11.5px;color:var(--dsw-alias-state-info-primary,#3b7ddd);text-decoration:none}
.dshcl-ref:hover{text-decoration:underline}
.dshcl-adv{border-left:2px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4))}
.dshcl-notice{margin:0 0 16px;border-radius:var(--dsw-radius-lg,10px);border:.5px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.36));padding:12px 14px;font-size:12px;line-height:19px;color:var(--dsw-alias-label-secondary,inherit)}
.dshcl-noticeTitle{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary,inherit);margin:0 0 5px}
.dshcl-notice p{margin:0 0 4px;max-width:88ch}
.dshcl-empty{padding:48px 8px;text-align:center;font-size:13px;color:var(--dsw-alias-label-tertiary,inherit)}
.dshcl-foot{margin-top:26px;padding-top:12px;border-top:.5px solid var(--dsw-alias-border-l1,rgba(128,128,128,.22));font-size:11.5px;line-height:18px;color:var(--dsw-alias-label-tertiary,inherit)}
.dshcl-foot a{color:var(--dsw-alias-state-info-primary,#3b7ddd);text-decoration:none}
.dshcl-foot a:hover{text-decoration:underline}
`

/** Inject the panel stylesheet once per document; idempotent across reloads. */
function ensureStyles() {
  if (typeof document === 'undefined' || !document.head || !document.querySelector) return
  if (document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG_ID) + ']') !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-changelog-panel'
  tag.dataset.pluginCss = CSS_TAG_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

// ── icons ───────────────────────────────────────────────────────────────────
// Inline SVG keeps the bundle free of the primitives package, which publishes no
// browser bundle a dynamic plugin could resolve.

/**
 * Sidebar glyph: a changelog/spark mark.
 * @param props - slot-provided geometry and selection hints.
 * @returns the icon element.
 */
function ChangelogIcon(props) {
  const size = (props && props.size) || 16
  return React.createElement(
    'svg',
    { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
    React.createElement('path', {
      d: 'M3 2.5h7.5L13 5v8.5H3z',
      stroke: 'currentColor',
      strokeWidth: '1.2',
      strokeLinejoin: 'round',
    }),
    React.createElement('path', { d: 'M10.2 2.6V5H12.8', stroke: 'currentColor', strokeWidth: '1.2', strokeLinejoin: 'round' }),
    React.createElement('path', { d: 'M5.2 7.4h5.6M5.2 9.9h5.6', stroke: 'currentColor', strokeWidth: '1.2', strokeLinecap: 'round' }),
  )
}

/**
 * Security glyph: a shield.
 * @param props - geometry from the caller.
 * @returns the icon element.
 */
function ShieldIcon(props) {
  const size = (props && props.size) || 14
  return React.createElement(
    'svg',
    { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
    React.createElement('path', {
      d: 'M8 1.8 13 3.6v4.2c0 3-2.1 5.4-5 6.4-2.9-1-5-3.4-5-6.4V3.6z',
      stroke: 'currentColor',
      strokeWidth: '1.2',
      strokeLinejoin: 'round',
    }),
    React.createElement('path', { d: 'M5.7 8.1 7.4 9.8l3-3.4', stroke: 'currentColor', strokeWidth: '1.2', strokeLinecap: 'round', strokeLinejoin: 'round' }),
  )
}

// ── helpers ─────────────────────────────────────────────────────────────────

const el = React.createElement
const dateOf = (value) => (typeof value === 'string' ? value : '')

/**
 * Case-insensitive substring match across every searchable field of a row.
 * The needle is normalised here, so callers may pass raw user input.
 * @param row - dataset row.
 * @param query - raw search text.
 * @returns whether the row matches.
 */
function matches(row, query) {
  const needle = typeof query === 'string' ? query.trim().toLowerCase() : ''
  if (needle === '') return true
  const plain = [row.id, row.category, row.status, row.severity]
  const pairs = [row.title, row.summary]
  const packages = isArray(row.packages) ? row.packages : []
  const affected = isArray(row.affected) ? row.affected : []
  const refs = isArray(row.references) ? row.references : []
  const labels = refs.map((ref) => ref && ref.label)
  // Search BOTH languages of every pair, so a Chinese reader can find a row by
  // either its Chinese or its English wording.
  const text = pairs
    .concat(affected)
    .concat(labels)
    .filter((entry) => entry !== undefined && entry !== null)
    .flatMap((entry) => (typeof entry === 'object' ? [entry.en, entry.zh] : [entry]))
    .concat(plain)
    .concat(packages)
  return text
    .filter((part) => typeof part === 'string')
    .some((part) => part.toLowerCase().indexOf(needle) !== -1)
}

/**
 * Group rows by category in the fixed display order.
 * @param rows - dataset rows.
 * @returns ordered `[category, rows]` pairs.
 */
function groupByCategory(rows) {
  const buckets = new Map()
  for (const row of rows) {
    const key = CATEGORY_META[row.category] ? row.category : 'platform'
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(row)
  }
  return CATEGORY_ORDER.filter((key) => buckets.has(key)).map((key) => [key, buckets.get(key)])
}

/**
 * Feature rows belonging to one release version.
 * @param rows - all feature rows.
 * @param version - release version.
 * @returns the matching rows.
 */
function featuresOf(rows, version) {
  return rows.filter((row) => row.version === version)
}

// ── partial views ───────────────────────────────────────────────────────────

/**
 * One release entry in the left rail.
 * @param props - release row, selection state, and the select callback.
 * @returns the rail row element.
 */
function ReleaseRailItem(props) {
  const release = props.release
  const on = props.selected
  const count = props.count
  return el(
    'button',
    {
      type: 'button',
      className: 'dshcl-railItem' + (on ? ' dshcl-railItemOn' : ''),
      onClick: () => props.onSelect(release.version),
      'aria-current': on ? 'true' : undefined,
    },
    el(
      'div',
      { className: 'dshcl-railTop' },
      el('span', { className: 'dshcl-ver' }, release.version),
      release.highlight ? el('span', { className: 'dshcl-newPill' }, props.t('rail.latest')) : null,
      release.channel && release.channel !== 'stable'
        ? el('span', { className: 'dshcl-pill' }, release.channel)
        : null,
    ),
    el('div', { className: 'dshcl-railDate' }, dateOf(release.date) + ' · ' + props.t('rail.entries', { n: count })),
  )
}

/**
 * One feature card.
 * @param props - feature row and translation hook.
 * @returns the card element.
 */
function FeatureCard(props) {
  const row = props.row
  const meta = CATEGORY_META[row.category] || CATEGORY_META.platform
  const packages = isArray(row.packages) ? row.packages : []
  return el(
    'li',
    { className: 'dshcl-item' },
    el(
      'div',
      { className: 'dshcl-itemHead' },
      el('span', { className: 'dshcl-dot', style: { background: meta.color } }),
      el('h4', { className: 'dshcl-itemTitle' }, pickText(row.title, props.language)),
    ),
    pickText(row.summary, props.language)
      ? el('p', { className: 'dshcl-itemSummary' }, pickText(row.summary, props.language))
      : null,
    packages.length > 0
      ? el(
          'div',
          { className: 'dshcl-tags' },
          packages.slice(0, 6).map((name) => el('span', { className: 'dshcl-tag', key: name }, name)),
        )
      : null,
  )
}

/**
 * Feature rows for one release, grouped by category.
 * @param props - rows and translation hook.
 * @returns the grouped list element.
 */
function FeatureGroups(props) {
  const groups = groupByCategory(props.rows)
  if (groups.length === 0) return el('div', { className: 'dshcl-empty' }, props.t('empty.features'))
  return el(
    'div',
    null,
    groups.map(([category, rows]) => {
      const meta = CATEGORY_META[category]
      return el(
        'section',
        { className: 'dshcl-group', key: category },
        el(
          'div',
          { className: 'dshcl-groupHead' },
          el('span', { className: 'dshcl-dot', style: { background: meta.color } }),
          el('span', null, props.t('category.' + category)),
          el('span', { className: 'dshcl-count' }, '· ' + rows.length),
        ),
        el(
          'ul',
          { className: 'dshcl-items' },
          rows.map((row) => el(FeatureCard, { key: row.id, row: row, t: props.t, language: props.language })),
        ),
      )
    }),
  )
}

/**
 * One advisory card: identity, severity/status badges, affected range, references.
 * @param props - advisory row and translation hook.
 * @returns the card element.
 */
function AdvisoryCard(props) {
  const row = props.row
  const severity = SEVERITY_META[row.severity] || SEVERITY_META.unknown
  const status = STATUS_META[row.status] || STATUS_META.watched
  const install = INSTALL_META[row.appliesToInstalled] || INSTALL_META.unknown
  const affected = isArray(row.affected) ? row.affected : []
  const refs = isArray(row.references) ? row.references : []
  const packages = isArray(row.packages) ? row.packages : []
  return el(
    'li',
    { className: 'dshcl-item dshcl-adv', style: { borderLeftColor: severity.color } },
    el(
      'div',
      { className: 'dshcl-itemHead' },
      el('span', { className: 'dshcl-pill', style: { color: severity.color } }, props.t('severity.' + (SEVERITY_META[row.severity] ? row.severity : 'unknown'))),
      el('span', { className: 'dshcl-pill', style: { color: status.color } }, props.t('status.' + (STATUS_META[row.status] ? row.status : 'watched'))),
      el('h4', { className: 'dshcl-itemTitle' }, pickText(row.title, props.language)),
      el('span', { className: 'dshcl-tag' }, row.id),
    ),
    el(
      'div',
      { className: 'dshcl-tags' },
      el('span', { className: 'dshcl-pill', style: { color: install.color } }, props.t(install.key, { version: props.installedVersion })),
    ),
    pickText(row.summary, props.language)
      ? el('p', { className: 'dshcl-itemSummary' }, pickText(row.summary, props.language))
      : null,
    affected.length > 0
      ? el(
          'div',
          { className: 'dshcl-tags' },
          [
            el(
              'span',
              { className: 'dshcl-tag', key: '__a' },
              props.t('adv.affected') + ': ' + pickTextList(row.affected, props.language).join(', '),
            ),
          ],
        )
      : null,
    row.fixedIn ? el('div', { className: 'dshcl-tags' }, el('span', { className: 'dshcl-tag' }, props.t('adv.fixedIn') + ': ' + row.fixedIn)) : null,
    packages.length > 0
      ? el(
          'div',
          { className: 'dshcl-tags' },
          packages.slice(0, 6).map((name) => el('span', { className: 'dshcl-tag', key: name }, name)),
        )
      : null,
    refs.length > 0
      ? el(
          'div',
          { className: 'dshcl-refs' },
          refs.map((ref) =>
            el(
              'a',
              { className: 'dshcl-ref', key: ref.url, href: ref.url, target: '_blank', rel: 'noreferrer noopener' },
              pickText(ref.label, props.language) || ref.url,
            ),
          ),
        )
      : null,
  )
}

/**
 * The coverage statement: what was searched, and what was not found.
 * @param props - coverage object and translation hook.
 * @returns the notice element, or null when no coverage is recorded.
 */
function CoverageNotice(props) {
  const coverage = props.coverage
  if (!coverage) return null
  const searched = isArray(coverage.searched) ? coverage.searched : []
  const notFound = isArray(coverage.notFound) ? coverage.notFound : []
  const limitations = isArray(coverage.limitations) ? coverage.limitations : []
  const notes = isArray(coverage.notes) ? coverage.notes : []
  if (searched.length === 0 && notFound.length === 0 && notes.length === 0 && limitations.length === 0) return null
  return el(
    'div',
    { className: 'dshcl-notice' },
    el('p', { className: 'dshcl-noticeTitle' }, props.t('coverage.title')),
    pickText(coverage.summary, props.language) ? el('p', null, pickText(coverage.summary, props.language)) : null,
    // `searched` entries are records { sourceId, query, result }; render their
    // readable form instead of letting Array.join stringify them as objects.
    searched.length > 0
      ? el(
          'div',
          null,
          el('p', { style: { fontWeight: 600 } }, props.t('coverage.searched')),
          el(
            'ul',
            { style: { margin: '2px 0 6px', paddingLeft: '18px' } },
            searched.map((entry, index) =>
              el(
                'li',
                { key: (entry && entry.sourceId) || String(index) },
                describeSweep(entry, props.language),
              ),
            ),
          ),
        )
      : null,
    notFound.length > 0
      ? el(
          'div',
          null,
          el('p', { style: { fontWeight: 600 } }, props.t('coverage.notFound')),
          el(
            'ul',
            { style: { margin: '2px 0 6px', paddingLeft: '18px' } },
            notFound.map((entry, index) => el('li', { key: 'nf' + index }, pickText(entry, props.language))),
          ),
        )
      : null,
    limitations.length > 0
      ? el(
          'div',
          null,
          el('p', { style: { fontWeight: 600 } }, props.t('coverage.limitations')),
          el(
            'ul',
            { style: { margin: '2px 0 6px', paddingLeft: '18px' } },
            limitations.map((entry, index) => el('li', { key: 'lim' + index }, pickText(entry, props.language))),
          ),
        )
      : null,
    notes.map((note, index) => el('p', { key: 'note' + index }, pickText(note, props.language))),
    coverage.checkedAt ? el('p', null, props.t('coverage.checkedAt') + ': ' + coverage.checkedAt) : null,
  )
}

/**
 * Readable one-line form of a coverage sweep record.
 * @param entry - a `{ sourceId, query, result }` record, or any value.
 * @returns display text.
 */
function describeSweep(entry, language) {
  if (typeof entry === 'string') return entry
  if (!entry || typeof entry !== 'object') return String(entry)
  const parts = []
  if (entry.sourceId) parts.push(entry.sourceId)
  const query = pickText(entry.query, language)
  if (query) parts.push('“' + query + '”')
  const head = parts.join(' — ')
  const result = pickText(entry.result, language)
  return result ? (head ? head + ': ' + result : result) : head || ''
}

/**
 * The vulnerability view: coverage statement, advisories, and source list.
 * @param props - advisory rows, coverage, sources, and translation hook.
 * @returns the security section element.
 */
function SecurityView(props) {
  const rows = props.rows
  const sources = props.sources
  return el(
    'div',
    null,
    el(
      'div',
      { className: 'dshcl-secHead' },
      el('span', { style: { color: SEVERITY_META.high.color, display: 'inline-flex' } }, el(ShieldIcon, { size: 15 })),
      el('span', { className: 'dshcl-secVer' }, props.t('security.title')),
    ),
    el('p', { className: 'dshcl-secSummary' }, props.t('security.sub')),
    el(CoverageNotice, { coverage: props.coverage, t: props.t, language: props.language }),
    rows.length === 0
      ? el('div', { className: 'dshcl-empty' }, props.t('empty.advisories'))
      : el(
          'ul',
          { className: 'dshcl-items' },
          rows.map((row) =>
            el(AdvisoryCard, {
              key: row.id,
              row: row,
              t: props.t,
              language: props.language,
              installedVersion: props.installedVersion,
            }),
          ),
        ),
    sources.length > 0
      ? el(
          'div',
          { className: 'dshcl-foot' },
          el('div', null, props.t('sources.title')),
          el(
            'ul',
            { style: { margin: '6px 0 0', paddingLeft: '18px' } },
            sources.map((source) =>
              el(
                'li',
                { key: source.id },
                isBrowsableUrl(source.url)
                  ? el(
                      'a',
                      { href: source.url, target: '_blank', rel: 'noreferrer noopener' },
                      pickText(source.label, props.language),
                    )
                  : el('span', null, pickText(source.label, props.language), ' ' + props.t('sources.apiOnly')),
                source.kind ? ' — ' + source.kind : '',
              ),
            ),
          ),
        )
      : null,
  )
}

/**
 * The changelog view for one release.
 * @param props - release, its feature rows, and translation hook.
 * @returns the release section element.
 */
function ReleaseView(props) {
  const release = props.release
  if (!release) return el('div', { className: 'dshcl-empty' }, props.t('empty.release'))
  return el(
    'div',
    null,
    el(
      'div',
      { className: 'dshcl-secHead' },
      el('span', { className: 'dshcl-secVer' }, release.version),
      release.highlight ? el('span', { className: 'dshcl-newPill' }, props.t('rail.latest')) : null,
      el('span', { className: 'dshcl-secDate' }, dateOf(release.date)),
    ),
    pickText(release.title, props.language)
      ? el('p', { className: 'dshcl-secSummary', style: { fontWeight: 600 } }, pickText(release.title, props.language))
      : null,
    pickText(release.summary, props.language)
      ? el('p', { className: 'dshcl-secSummary' }, pickText(release.summary, props.language))
      : null,
    // The curated items below came from the bundled dataset. When the live fetch
    // also has this version, its official notes are the same release's own words,
    // so both are shown and labelled rather than one silently replacing the other.
    props.liveNotes
      ? el(
          'div',
          null,
          el('div', { className: 'dshcl-liveNoteHead', style: { marginTop: '18px' } }, props.t('live.officialNotes')),
          el(renderLiveRelease, {
            row: props.liveNotes,
            t: props.t,
            language: props.language,
          }),
        )
      : null,
    el(FeatureGroups, { rows: props.rows, t: props.t, language: props.language }),
  )
}

// ── the panel ───────────────────────────────────────────────────────────────

const VIEWS = [
  { id: 'changelog', key: 'view.changelog' },
  { id: 'security', key: 'view.security' },
]

/**
 * The full-center-column panel body: release rail, search, and the selected view.
 * @param props - composed slot props plus the injected locale hook.
 * @returns the panel element tree.
 */
function ChangelogPanel(props) {
  // Injecting a stylesheet is a side effect, so it belongs in an effect rather
  // than the render body. `ensureStyles` is idempotent, so React 18's double
  // effect invocation in development cannot double-inject.
  React.useEffect(() => {
    ensureStyles()
  }, [])
  // Language: default to whatever the GUI is showing, but let the reader switch
  // this panel on its own so a Chinese reader is not stuck with an English shell.
  const guiLanguage = activeLocaleId(props)
  const [languageOverride, setLanguageOverride] = React.useState(null)
  const language = pickLocale(languageOverride, guiLanguage)
  const t = React.useCallback(
    (key, params) => translateTo(props.t, language, key, params),
    [props.t, language],
  )
  const releases = React.useMemo(dataReleases, [])
  const [view, setView] = React.useState(props.initialView === 'security' ? 'security' : 'changelog')

  // ── live official data ────────────────────────────────────────────────────
  // Seeded from the last successful fetch so reopening the panel shows data
  // immediately instead of an empty state; a refresh then replaces it.
  const [live, setLive] = React.useState(() => createLiveState(readLiveCache()))
  /**
   * The DSH version this app is actually running, read from the host report.
   *
   * The bundle bakes a version in at build time, and that number goes stale the
   * moment the user upgrades the app — which is exactly what happened. The host
   * half detects the real version at runtime and writes it into the storage
   * report, so reading that report is the only way the panel can stay truthful.
   */
  const [runtimeVersion, setRuntimeVersion] = React.useState('')
  // Runtime first, then the build-time bake, then the prop. The bake is a snapshot
  // of the app at build time, so preferring it is what made an upgraded install
  // report its old version.
  const installedVersion =
    runtimeVersion !== ''
      ? runtimeVersion
      : typeof INSTALLED_VERSION !== 'undefined' && INSTALLED_VERSION !== 'unknown'
        ? INSTALLED_VERSION
        : props.installedVersion || 'unknown'

  const liveRef = React.useRef(live)
  liveRef.current = live

  /**
   * The rail's version list: the bundled dataset plus every version the live
   * fetch knows about. Without this, a refresh could report a newer release that
   * the rail gives no way to open. A live version the dataset also documents
   * keeps the dataset's own entry, so curation is never replaced by raw API data.
   */
  const railReleases = React.useMemo(() => {
    const liveRows = live.data && isArray(live.data.releases) ? live.data.releases : []
    if (liveRows.length === 0) return releases
    const known = new Set(releases.map((entry) => entry.version))
    const merged = releases.slice()
    for (const row of liveRows) {
      if (known.has(row.version)) continue
      known.add(row.version)
      merged.push({
        version: row.version,
        channel: channelOfVersion(row.version),
        date: row.date,
        title: row.version,
        summary: '',
        highlight: false,
        liveOnly: true,
      })
    }
    merged.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
    return merged
  }, [releases, live.data])
  const features = React.useMemo(dataFeatures, [])
  const advisories = React.useMemo(dataAdvisories, [])
  const coverage = React.useMemo(dataCoverage, [])
  const sources = React.useMemo(dataSources, [])

  // `initialView` exists so the vulnerability view is reachable in a headless
  // render (the tab click is the only other way in); production passes nothing.

  /**
   * Fetch once. The reducer lives in `fetched.mjs` (`runRefresh`) so it can be
   * reasoned about on its own; this only owns the React state and the cache.
   */
  const refreshNow = React.useCallback(async () => {
    if (liveRef.current.status === 'loading') return
    setLive((current) => ({ ...current, status: 'loading', error: '', lastAttemptAt: new Date().toISOString() }))
    const next = await runRefresh({})(liveRef.current)
    writeLiveCache(next.data)
    setLive(() => next)
  }, [])

  /**
   * Refresh automatically only on the first open of each day; the rest is manual.
   *
   * The day marker is persisted, so opening and closing the panel repeatedly (or
   * restarting the app) does not re-fetch — the reader who wants fresh data mid-day
   * presses the button. That matters because GitHub's unauthenticated API allows
   * only 60 requests per hour, and the data itself changes only when the project
   * publishes a release.
   *
   * The `openedRef` guard covers React's development double-invocation, and
   * `refreshNow` already no-ops while a request is in flight.
   */
  const openedRef = React.useRef(false)
  React.useEffect(() => {
    if (openedRef.current) return
    openedRef.current = true
    if (!autoRefreshDue()) return
    markAutoRefreshed()
    void refreshNow()
  }, [refreshNow])
  const [query, setQuery] = React.useState('')
  const [version, setVersion] = React.useState(null)

  // Default to the release this panel is installed from (the dataset flags it
  // `highlight`), falling back to the newest entry. Opening on the newest
  // published alpha instead would show an empty view whenever the dataset only
  // documents the installed build.
  /**
   * The middle column's scroll container, so switching releases can return the
   * reader to the top. Without this, switching while scrolled deep into a long
   * release left the new release's content above the viewport and the panel
   * looked like it had stopped responding — reported as "I have to scroll back to
   * the top before I can switch".
   */
  const mainRef = React.useRef(null)
  const selectVersion = React.useCallback((next) => {
    setVersion(next)
    setView('changelog')
    if (mainRef.current) mainRef.current.scrollTop = 0
  }, [])

  // Prefer the release the app is actually running, so an upgraded install opens on
  // its own version instead of whichever one the bundled dataset was authored
  // against. The dataset's `highlight` and then newest-first remain the fallbacks
  // for a version with no release notes (or an unknown version).
  const defaultRelease =
    railReleases.find((entry) => entry.version === installedVersion) ||
    railReleases.find((entry) => entry.highlight) ||
    railReleases[0] ||
    null
  const activeVersion = version || (defaultRelease ? defaultRelease.version : null)
  const needle = query

  const visibleFeatures = React.useMemo(
    () => featuresOf(features, activeVersion).filter((row) => matches(row, needle)),
    [features, activeVersion, needle],
  )
  const visibleAdvisories = React.useMemo(() => advisories.filter((row) => matches(row, needle)), [advisories, needle])
  const counts = React.useMemo(() => {
    const map = {}
    for (const row of features) map[row.version] = (map[row.version] || 0) + 1
    return map
  }, [features])

  // Read the host report once for the running version. A failure here is silent by
  // design: the badge falls back to the baked value rather than blocking the panel.
  React.useEffect(() => {
    let cancelled = false
    if (!props.ctx) return undefined
    void (async () => {
      try {
        const loaded = await loadStorageReport(props.ctx, undefined)
        const host = loaded && loaded.report && loaded.report.host ? loaded.report.host : null
        const version = host && typeof host.dshVersion === 'string' ? host.dshVersion : ''
        if (!cancelled && version !== '' && version !== 'unknown') setRuntimeVersion(version)
      } catch {
        // The report is optional for this panel; keep the baked fallback.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [props.ctx])

  const liveRelease = live.data && isArray(live.data.releases)
    ? live.data.releases.find((entry) => entry.version === activeVersion) || null
    : null
  const total = features.length + advisories.length

  return el(
    'div',
    { className: 'dshcl-root', 'data-dsh-plugin': 'dsh-changelog-panel' },
    el(
      'header',
      { className: 'dshcl-head' },
      el(
        'div',
        { className: 'dshcl-headTop' },
        el(
          'div',
          { className: 'dshcl-headText' },
          el('h3', { className: 'dshcl-title' }, t('panel.title')),
          el('p', { className: 'dshcl-sub' }, t('panel.sub', { releases: railReleases.length, entries: total })),
        ),
        el(renderVersionBadge, { state: live, t: t, language: language, installedVersion: installedVersion }),
        // Refresh controls sit in the header, which never scrolls, so they stay
        // reachable while a long release's notes scroll underneath.
        el('div', { className: 'dshcl-headRefresh' }, el(renderRefreshControls, {
          state: live,
          t: t,
          language: language,
          onRefresh: () => {
            void refreshNow()
          },
        })),
      ),
      el(
        'div',
        { className: 'dshcl-search' },
        el(
          'div',
          { className: 'dshcl-tabs', role: 'tablist' },
          VIEWS.map((entry) =>
            el(
              'button',
              {
                key: entry.id,
                type: 'button',
                role: 'tab',
                'aria-selected': view === entry.id ? 'true' : 'false',
                className: 'dshcl-tab' + (view === entry.id ? ' dshcl-tabOn' : ''),
                onClick: () => setView(entry.id),
              },
              t(entry.key) + (entry.id === 'security' ? ' (' + advisories.length + ')' : ''),
            ),
          ),
        ),
        el(
          'div',
          { className: 'dshcl-lang', role: 'group', 'aria-label': t('lang.label') },
          PANEL_LANGUAGES.map((entry) =>
            el(
              'button',
              {
                key: entry.id,
                type: 'button',
                className: 'dshcl-langBtn' + (language === entry.id ? ' dshcl-langOn' : ''),
                'aria-pressed': language === entry.id ? 'true' : 'false',
                title: t(entry.id === 'zh' ? 'lang.zh' : 'lang.en'),
                onClick: () => {
                  // Override this panel, and follow the GUI too when the locale
                  // service is unavailable or the call reports no change.
                  setLanguageOverride(entry.id)
                  setGuiLocale(props, entry.id)
                },
              },
              entry.label,
            ),
          ),
        ),
        el('input', {
          className: 'dshcl-input',
          type: 'search',
          value: query,
          placeholder: t('search.placeholder'),
          'aria-label': t('search.placeholder'),
          onChange: (event) => setQuery(event.target.value),
        }),
      ),
    ),
    el(
      'div',
      { className: 'dshcl-body' },
      el(
        'nav',
        { className: 'dshcl-rail', 'aria-label': t('panel.title') },
        el('div', { className: 'dshcl-railLabel' }, t('rail.title')),
        railReleases.map((entry) =>
          el(ReleaseRailItem, {
            key: entry.version,
            release: entry,
            selected: entry.version === activeVersion,
            count: counts[entry.version] || 0,
            onSelect: selectVersion,
            t: t,
          }),
        ),
      ),
      el(
        'main',
        { className: 'dshcl-main', ref: mainRef },
        view === 'security'
          ? el(SecurityView, {
              rows: visibleAdvisories,
              coverage: coverage,
              sources: sources,
              installedVersion: installedVersion,
              language: language,
              t: t,
            })
          : el(ReleaseView, {
              release: railReleases.find((entry) => entry.version === activeVersion) || null,
              rows: visibleFeatures,
              t: t,
              language: language,
              liveNotes: liveRelease,
            }),
        // Official data lives below the curated view rather than replacing it, so
        // a fetch never hides the reviewed dataset it is meant to extend.
        el(renderLiveNotes, { state: live, t: t, language: language }),
      ),
    ),
  )
}

// ── dictionaries ────────────────────────────────────────────────────────────

const zh = {
  'panel.title': '更新日志与漏洞',
  'panel.sub': '{releases} 个版本 · {entries} 条记录',
  'rail.title': '版本',
  'rail.latest': '最新',
  'rail.entries': '{n} 条',
  'view.changelog': '更新日志',
  'view.security': '漏洞与安全',
  'search.placeholder': '搜索特性、包名、编号…',
  'live.title': '官方最新数据',
  'live.refresh': '手动刷新',
  'live.onOpen': '每天首次打开自动刷新',
  'live.refreshing': '刷新中…',
  'live.lastUpdated': '上次更新 {time}',
  'live.neverFetched': '尚未拉取官方数据（面板目前显示的是内置快照）',
  'live.error': '拉取失败',
  'live.rateLimited': 'GitHub API 已达速率上限（未认证 60 次/小时），自动刷新已关闭',
  'live.warning': '提示',
  'live.empty': '还没有数据，点「手动刷新」拉取官方更新日志。',
  'live.liveVersions': '官方已发布 {n} 个版本',
  'live.showingLatest': '列表仅显示最新 {n} 个，其余在左侧版本栏点开',
  'live.officialNotes': '官方 Release',
  'live.noNotes': '官方没有为这个版本发布更新日志（npm 上有该版本，但仓库里没有对应的 Release）。',
  'live.noChinese': '这个版本的官方更新日志只有英文，没有中文。',
  'live.version.current': '当前版本',
  'live.version.latest': '最新',
  'live.version.upToDate': '已是最新',
  'live.version.behind': '有新版本',
  'live.version.ahead': '领先官方发布',
  'live.version.unknown': '无法比较版本',
  'note.new': '新增',
  'note.improved': '优化',
  'note.fixed': '修复',
  'note.other': '其他',
  'lang.label': '语言',
  'lang.zh': '切换到中文',
  'lang.en': 'Switch to English',
  'category.agent': '智能体',
  'category.tools': '工具',
  'category.sessions': '会话',
  'category.ui': '界面',
  'category.plugins': '插件',
  'category.platform': '平台',
  'category.security': '安全',
  'security.title': '漏洞与安全公告',
  'security.sub': '仅收录可核实的公开记录，并说明检索范围与未发现项。',
  'severity.critical': '严重',
  'severity.high': '高危',
  'severity.medium': '中危',
  'severity.low': '低危',
  'severity.info': '提示',
  'severity.unknown': '未知',
  'status.fixed': '已修复',
  'status.affected': '受影响',
  'status.watched': '持续关注',
  'status.not-affected': '不受影响',
  'adv.affected': '影响范围',
  'adv.fixedIn': '修复版本',
  'install.yes': '影响当前安装（{version}）',
  'install.no': '当前安装（{version}）不受影响',
  'install.unknown': '无法判定是否影响当前安装',
  'coverage.title': '检索范围说明',
  'coverage.searched': '已检索',
  'coverage.notFound': '未发现',
  'coverage.limitations': '无法核实',
  'coverage.checkedAt': '核查日期',
  'sources.title': '数据来源',
  'sources.apiOnly': '（API，仅程序可读）',
  'empty.features': '当前筛选下没有匹配的特性。',
  'empty.advisories': '当前筛选下没有匹配的漏洞记录。',
  'empty.release': '暂无版本数据。',
  'storage.help.title': '怎么用',
  'storage.help.what': '这里显示 DSH 在本地磁盘留下了什么、各占多少。数字全部来自宿主端实测扫描，面板不做估算。',
  'storage.help.reclaim': '「不建议删除」是运行时本体（Python/Node），删了 DSH 就跑不起来；「可再生」是缓存，删了会自动重建；「需确认」要你自己判断。',
  'storage.help.how': '要清理时直接对 Agent 说「清理存储」，它会调用 storage_report 给出账单、storage_cleanup 执行删除。看板只负责显示，不发起删除。',
  'storage.help.readonly': '看板是只读的，这是设计而非缺陷：浏览器端没有文件系统权限，也无法调用宿主，所以删除只能由 Agent 执行。',
  'storage.title': '存储占用',
  'storage.status.idle': '尚未读取报告',
  'storage.status.loading': '正在读取报告…',
  'storage.status.ready': '报告已载入',
  'storage.status.scanError': '主机端扫描失败',
  'storage.status.readError': '读取报告失败',
  'storage.refresh': '重新读取报告',
  'storage.refreshing': '读取中…',
  'storage.rescan': '请求重新扫描',
  'storage.empty': '还没有存储报告。点下面的按钮让主机端扫描一次。',
  'storage.summary.note': '所有数字都来自主机端扫描报告，面板不做估算。',
  'storage.summary.total': '磁盘占用合计',
  'storage.summary.totalNote': '各分类实测之和；未计量的分类不在其中。',
  'storage.summary.reclaimable': '可回收',
  'storage.summary.reclaimableNote': '回收计划里所有条目的合计，不代表它们都已被确认可删。',
  'storage.summary.noPlan': '报告里没有回收计划。',
  'storage.summary.generatedAt': '扫描时间',
  'storage.summary.scanTime': '扫描耗时',
  'storage.summary.ms': '{n} 毫秒',
  'storage.summary.sessions': '会话',
  'storage.summary.sessionsValue': '{n} 个（含 {subs} 个子会话）',
  'storage.summary.home': 'DSH 目录',
  'storage.summary.workspace': '工作区',
  'storage.reportError': '扫描器报告了错误',
  'storage.cost.title': '空间去向',
  'storage.cost.sub': '按实测大小从大到小排列；条形是相对最大一项的比例，百分比是占已计量合计的比例。',
  'storage.cost.share': '占 {pct}',
  'storage.cost.detailNote': '明细是实测的子目录；散落文件不单独列出，所以明细相加可能小于该行合计。',
  'storage.cost.unmeasured': '本次扫描未计量',
  'storage.cost.empty': '报告里没有可分类的实测数据。',
  'storage.cost.neverDetail': '以下文件由 DSH 运行时使用：删除后 DSH 将无法运行。',
  'storage.cost.attachments': '{count} 个对象，其中 {orphans} 个没有任何会话引用（{size}）',
  'storage.cost.more': '另有 {n} 项未显示',
  'storage.cost.files': '{n} 个文件',
  'storage.cost.profileActive': '使用中',
  'storage.sessions.title': '会话与占用',
  'storage.sessions.sub': '按工作区分组，组间与组内都按实测大小从大到小排列。',
  'storage.sessions.shareNote': '子会话与父会话共用同一份日志，因此列在父会话下面。',
  'storage.sessions.empty': '报告里没有会话目录。',
  'storage.sessions.unresolved': '{n} 个子会话没能匹配到父会话，单独列出。',
  'storage.sessions.attributionOff': '未能解压会话日志，子会话归属不可用。',
  'storage.sessions.subCount': '含 {n} 个子会话',
  'storage.group.unknown': '未记录工作区',
  'storage.group.subtotal': '{sessions} 个会话 · {size}',
  'storage.turns': '{n} 轮',
  'storage.turnsUnknown': '轮数未知',
  'storage.modified': '最后修改 {date}',
  'storage.badge.pinned': '已固定',
  'storage.badge.archived': '已归档',
  'storage.badge.unprojected': '无投影',
  'storage.badge.unprojectedTitle': '这个会话没有缓存投影，标题与轮数无法读取。',
  'storage.badge.subagent': '子会话',
  'storage.badge.orphan': '父会话未识别',
  'storage.action.open': '打开对话',
  'storage.action.reveal': '在访达中显示',
  'storage.subagent.otherCwd': '运行目录 {cwd}',
  'storage.plan.title': '回收计划',
  'storage.plan.sub': '{n} 项 · 合计 {size}',
  'storage.plan.scope': '计划只包含配置档案、浏览器缓存、无引用附件和已归档会话；运行时二进制不在其中。',
  'storage.plan.disclaimer': '条目与理由都来自扫描器；标为「仅建议」的条目只是线索，不是结论。',
  'storage.plan.empty': '这份报告里没有可回收项。',
  'storage.plan.select': '选择',
  'storage.plan.deselect': '取消选择',
  'storage.plan.confirmSelect': '再次点击确认',
  'storage.plan.armTitle': '这一项影响较大：需要点两次才会被选中。',
  'storage.plan.trash': '移到废纸篓',
  'storage.plan.trashing': '正在移到废纸篓…',
  'storage.plan.trashNote': '项目会被移到系统废纸篓，可在访达里「放回原处」还原。',
  'storage.plan.selected': '已选 {n} 项 · {size}',
  'storage.result.title': '上次回收结果',
  'storage.result.moved': '已移到废纸篓 {n} 项',
  'storage.result.failed': '失败 {n} 项',
  'storage.result.skipped': '跳过 {n} 项',
  'storage.chart.total': '总计',
  'storage.view.label': '显示方式',
  'storage.view.chart': '图表',
  'storage.view.list': '列表',
  'storage.workdir.chartContainers': '另有 {n} 个窗口是父目录，其空间已由下方的子窗口分别表示，不重复计入',
  'storage.workdir.chartNested': '另有 {n} 个窗口自有体积为 0，未画入图表',
  'storage.workdir.title': '其他窗口的产物',
  'storage.workdir.sub': '每个窗口在自己的工作目录里生成的文件和脚本，按体积排序。这些目录就是它们的实际位置。',
  'storage.workdir.sessions': '{n} 个会话',
  'storage.workdir.contains': '本行已扣除 {n} 个子窗口（{size}），它们单独列在下方',
  'storage.workdir.dedupe': '嵌套目录已去重，避免重复计算 {size}',
  'storage.workdir.notReclaimable': '注意：这些是你自己的项目文件，不属于 DSH 存储，永远不列为可回收。',
  'storage.workdir.flat': '没有子目录，文件直接放在根目录',
  'storage.workdir.allNested': '全部在子窗口内',
  'storage.workdir.missing': '这个目录已经不在了（会话记录仍在）',
  'storage.workdir.empty': '没有记录到任何工作目录',
  'storage.result.refreshHint': '重新读取报告即可刷新上面的列表。',
  'storage.category.runtimes': '运行时二进制',
  'storage.category.plugins': '插件配置档案',
  'storage.category.sessions': '会话日志',
  'storage.category.attachments': '附件对象',
  'storage.category.browserCache': '浏览器缓存',
  'storage.category.caches': '缓存与索引',
  'storage.category.workspace': '工作区文件',
  'storage.category.other': '其他（未计量）',
  'storage.reclaim.never': '不建议删除',
  'storage.reclaim.all': '可安全重建',
  'storage.reclaim.some': '需要自行判断',
  'storage.reclaim.unknown': '扫描器未标注',
  'storage.confidence.high': '高置信度',
  'storage.confidence.medium': '中置信度',
  'storage.confidence.low': '低置信度 · 仅建议',
  'storage.plan.kind.profile': '配置档案',
  'storage.plan.kind.browserCache': '浏览器缓存',
  'storage.plan.kind.attachment': '附件对象',
  'storage.plan.kind.session': '已归档会话',
  'storage.plan.kind.other': '其他',
}

const en = {
  'panel.title': 'Changelog & Vulnerabilities',
  'panel.sub': '{releases} releases · {entries} records',
  'rail.title': 'Releases',
  'rail.latest': 'latest',
  'rail.entries': '{n} entries',
  'view.changelog': 'Changelog',
  'view.security': 'Vulnerabilities',
  'search.placeholder': 'Search features, packages, ids…',
  'live.title': 'Latest official data',
  'live.refresh': 'Refresh now',
  'live.onOpen': 'auto-refreshes once a day',
  'live.refreshing': 'Refreshing…',
  'live.lastUpdated': 'updated {time}',
  'live.neverFetched': 'Official data not fetched yet (showing the bundled snapshot)',
  'live.error': 'Refresh failed',
  'live.rateLimited': 'GitHub API rate limit reached (60/hour unauthenticated); auto refresh turned off',
  'live.warning': 'Notice',
  'live.empty': 'No data yet. Use “Refresh now” to pull the official changelog.',
  'live.liveVersions': '{n} versions published officially',
  'live.showingLatest': 'showing the newest {n}; open older ones from the rail',
  'live.officialNotes': 'Official release',
  'live.noNotes': 'The project published no release notes for this version (it exists on npm, but the repository has no matching release).',
  'live.noChinese': 'The official notes for this version are English-only — there is no Chinese.',
  'live.version.current': 'Current version',
  'live.version.latest': 'Latest',
  'live.version.upToDate': 'up to date',
  'live.version.behind': 'update available',
  'live.version.ahead': 'ahead of the published release',
  'live.version.unknown': 'versions not comparable',
  'note.new': 'New',
  'note.improved': 'Improvements',
  'note.fixed': 'Bug fixes',
  'note.other': 'Other changes',
  'lang.label': 'Language',
  'lang.zh': '切换到中文',
  'lang.en': 'Switch to English',
  'category.agent': 'Agent',
  'category.tools': 'Tools',
  'category.sessions': 'Sessions',
  'category.ui': 'Interface',
  'category.plugins': 'Plugins',
  'category.platform': 'Platform',
  'category.security': 'Security',
  'security.title': 'Vulnerabilities & security advisories',
  'security.sub': 'Only verifiable public records, with the search coverage and the gaps stated plainly.',
  'severity.critical': 'Critical',
  'severity.high': 'High',
  'severity.medium': 'Medium',
  'severity.low': 'Low',
  'severity.info': 'Info',
  'severity.unknown': 'Unknown',
  'status.fixed': 'Fixed',
  'status.affected': 'Affected',
  'status.watched': 'Watched',
  'status.not-affected': 'Not affected',
  'adv.affected': 'Affected',
  'adv.fixedIn': 'Fixed in',
  'install.yes': 'Affects this install ({version})',
  'install.no': 'This install ({version}) is not affected',
  'install.unknown': 'Impact on this install unknown',
  'coverage.title': 'Search coverage',
  'coverage.searched': 'Searched',
  'coverage.notFound': 'Not found',
  'coverage.limitations': 'Could not verify',
  'coverage.checkedAt': 'Checked',
  'sources.title': 'Sources',
  'sources.apiOnly': '(API, machine-readable only)',
  'empty.features': 'No matching features under the current filter.',
  'empty.advisories': 'No matching advisories under the current filter.',
  'empty.release': 'No release data available.',
  'storage.help.title': 'How to use this',
  'storage.help.what': 'This shows what DSH leaves on disk and what each part costs. Every number comes from a real host-side scan; the panel estimates nothing.',
  'storage.help.reclaim': '“Not recommended” is the runtime itself (Python/Node) — deleting it stops DSH from running. “Regenerable” is cache that rebuilds itself. “Review” is your call.',
  'storage.help.how': 'To reclaim space, just ask the agent to “clean up storage”. It calls storage_report for the figures and storage_cleanup to do the deletion. This panel only displays; it never initiates a delete.',
  'storage.help.readonly': 'The dashboard is read-only by design, not by omission: the browser half has no filesystem authority and cannot call the host, so deletion can only run through the agent.',
  'storage.title': 'Storage on disk',
  'storage.status.idle': 'Report not read yet',
  'storage.status.loading': 'Reading the report…',
  'storage.status.ready': 'Report loaded',
  'storage.status.scanError': 'Host scan failed',
  'storage.status.readError': 'Could not read the report',
  'storage.refresh': 'Reload report',
  'storage.refreshing': 'Reading…',
  'storage.rescan': 'Rescan now',
  'storage.empty': 'No storage report yet. Use the button below to run a host-side scan.',
  'storage.summary.note': 'Every number comes from the host scan report; the panel estimates nothing.',
  'storage.summary.total': 'Total on disk',
  'storage.summary.totalNote': 'The sum of the measured categories; unmeasured ones are not included.',
  'storage.summary.reclaimable': 'Reclaimable',
  'storage.summary.reclaimableNote': 'The sum of every item in the reclaim plan — not all of them are confirmed safe to delete.',
  'storage.summary.noPlan': 'The report carries no reclaim plan.',
  'storage.summary.generatedAt': 'Scanned',
  'storage.summary.scanTime': 'Scan time',
  'storage.summary.ms': '{n} ms',
  'storage.summary.sessions': 'Conversations',
  'storage.summary.sessionsValue': '{n} ({subs} subagents)',
  'storage.summary.home': 'DSH home',
  'storage.summary.workspace': 'Workspace',
  'storage.reportError': 'The scanner reported an error',
  'storage.cost.title': 'Where the space goes',
  'storage.cost.sub': 'Largest measured first; each bar is relative to the biggest row and the percentage is of the measured total.',
  'storage.cost.share': '{pct} of the measured total',
  'storage.cost.detailNote': 'Detail rows are the measured subdirectories; loose files are not listed separately, so they may add up to less than the row\'s total.',
  'storage.cost.unmeasured': 'not measured by this scan',
  'storage.cost.empty': 'The report has no measured categories.',
  'storage.cost.neverDetail': 'These files belong to the DSH runtime; deleting them stops DSH from running.',
  'storage.cost.attachments': '{count} objects, {orphans} of them referenced by no session ({size})',
  'storage.cost.more': '{n} more not shown',
  'storage.cost.files': '{n} files',
  'storage.cost.profileActive': 'in use',
  'storage.sessions.title': 'Conversations and what they cost',
  'storage.sessions.sub': 'Grouped by workspace; groups and rows are ordered by measured size, largest first.',
  'storage.sessions.shareNote': 'Subagent sessions share the parent\'s log, so they are listed under it.',
  'storage.sessions.empty': 'The report lists no session directories.',
  'storage.sessions.unresolved': '{n} subagent sessions could not be matched to a parent and are listed on their own.',
  'storage.sessions.attributionOff': 'Session logs could not be decompressed, so subagent attribution is unavailable.',
  'storage.sessions.subCount': '{n} subagents',
  'storage.group.unknown': 'No recorded workspace',
  'storage.group.subtotal': '{sessions} conversations · {size}',
  'storage.turns': '{n} turns',
  'storage.turnsUnknown': 'turn count unknown',
  'storage.modified': 'modified {date}',
  'storage.badge.pinned': 'pinned',
  'storage.badge.archived': 'archived',
  'storage.badge.unprojected': 'no projection',
  'storage.badge.unprojectedTitle': 'This session has no cached projection, so its title and turn count cannot be read.',
  'storage.badge.subagent': 'subagent',
  'storage.badge.orphan': 'parent not identified',
  'storage.action.open': 'Open conversation',
  'storage.action.reveal': 'Show in Finder',
  'storage.subagent.otherCwd': 'ran in {cwd}',
  'storage.plan.title': 'Reclaim plan',
  'storage.plan.sub': '{n} items · {size} total',
  'storage.plan.scope': 'The plan only ever covers plugin profiles, browser cache, unreferenced attachments and archived sessions; runtime binaries are never in it.',
  'storage.plan.disclaimer': 'Items and reasons come from the scanner; anything marked “suggestion only” is a lead, not a verdict.',
  'storage.plan.empty': 'This report has nothing to reclaim.',
  'storage.plan.select': 'Select',
  'storage.plan.deselect': 'Deselect',
  'storage.plan.confirmSelect': 'Click again to confirm',
  'storage.plan.armTitle': 'This item matters: it takes two clicks to select it.',
  'storage.plan.trash': 'Move to Trash',
  'storage.plan.trashing': 'Moving to Trash…',
  'storage.plan.trashNote': 'Items go to the OS Trash and can be put back from Finder.',
  'storage.plan.selected': '{n} selected · {size}',
  'storage.result.title': 'Last reclaim result',
  'storage.result.moved': '{n} moved to the Trash',
  'storage.result.failed': '{n} failed',
  'storage.result.skipped': '{n} skipped',
  'storage.chart.total': 'Total',
  'storage.view.label': 'Display mode',
  'storage.view.chart': 'Charts',
  'storage.view.list': 'List',
  'storage.workdir.chartContainers': '{n} window(s) are parent directories whose space is shown by the child windows below, not counted twice',
  'storage.workdir.chartNested': '{n} window(s) hold no files of their own and are not charted',
  'storage.workdir.title': 'Files from other windows',
  'storage.workdir.sub': 'What each window generated in its own working directory, largest first. These directories are where those files actually live.',
  'storage.workdir.sessions': '{n} session(s)',
  'storage.workdir.contains': 'Excludes {n} nested window(s) ({size}), listed separately below',
  'storage.workdir.dedupe': 'Nested directories deduplicated; {size} is counted once',
  'storage.workdir.notReclaimable': 'Note: these are your own project files, not DSH storage, so they are never offered for reclamation.',
  'storage.workdir.flat': 'No subdirectories; files sit in the root',
  'storage.workdir.allNested': 'all inside nested windows',
  'storage.workdir.missing': 'This directory no longer exists (the session record remains)',
  'storage.workdir.empty': 'No working directory recorded',
  'storage.result.refreshHint': 'Reload the report to refresh the list above.',
  'storage.category.runtimes': 'Runtime binaries',
  'storage.category.plugins': 'Plugin profiles',
  'storage.category.sessions': 'Session logs',
  'storage.category.attachments': 'Attachment objects',
  'storage.category.browserCache': 'Browser cache',
  'storage.category.caches': 'Caches and indexes',
  'storage.category.workspace': 'Workspace files',
  'storage.category.other': 'Other (not measured)',
  'storage.reclaim.never': 'Do not delete',
  'storage.reclaim.all': 'Safe to regenerate',
  'storage.reclaim.some': 'Review before deleting',
  'storage.reclaim.unknown': 'Not stated by the scan',
  'storage.confidence.high': 'high confidence',
  'storage.confidence.medium': 'medium confidence',
  'storage.confidence.low': 'low confidence · suggestion only',
  'storage.plan.kind.profile': 'Plugin profile',
  'storage.plan.kind.browserCache': 'Browser cache',
  'storage.plan.kind.attachment': 'Attachment object',
  'storage.plan.kind.session': 'Archived session',
  'storage.plan.kind.other': 'Other',
}

/** Locale namespace owned by this plugin. */
const NS = 'changelogPanel'

// ── plugin body ─────────────────────────────────────────────────────────────

/**
 * Client plugin body: register the dictionaries, the sidebar icon, and the panel.
 * @param ctx - client root context.
 * @returns {void}
 */
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-changelog-panel: dictionaries')
  // `bind` is the official binding form (see dsh-client-ui-plugin-manager); it
  // returns the namespace-scoped translator the panel reads as its `t` prop.
  const t = () => ctx.locale.bind(NS)

  /** Panel-body registration; rebuilt on every (re)registration so `inject` closes over the current translator. */
  const mainSlot = () => ({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    // `ctx` travels so the panel can read the host report, which is where the
    // running DSH version lives.
    inject: () => ({ t: t(), locale: ctx.locale, ctx: ctx }),
  })
  /** Sidebar icon registration; `label` is resolved by the sidebar on every render. */
  const iconSlot = () => ({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 30,
    locale: NS,
    label: () => t()('panel.title'),
  })

  // ── storage dashboard ─────────────────────────────────────────────────────
  // A second panel under its own id. It shares the `main` keyed slot and the same
  // `sidebar.panellist` list, which is exactly what that pair of seats is for.
  const storageSlot = () => ({
    name: 'main',
    key: STORAGE_PANEL_ID,
    locale: NS,
    inject: () => ({
      t: t(),
      locale: ctx.locale,
      ctx: ctx,
      // The session list authorizes one file read; the Host resolves the workspace
      // root from the named session itself, so only the id crosses the wire.
      sessions: ctx.sessions,
      uiWorkspace: ctx.get('uiWorkspace'),
    }),
  })
  const storageIconSlot = () => ({
    name: 'sidebar.panellist',
    id: STORAGE_PANEL_ID,
    order: 31,
    locale: NS,
    label: () => t()('storage.title'),
  })

  // One effect owns both registrations so nothing is registered twice. A
  // registration's injected props are fixed at registration time, so a change of
  // GUI language would otherwise leave the panel on its original dictionary;
  // re-registering when the locale revision moves is the shape the shipped
  // plugins use.
  ctx.effect(
    () => {
      let disposers = []
      const register = () => {
        for (const dispose of disposers.splice(0)) {
          if (typeof dispose === 'function') dispose()
        }
        disposers = [
          ctx.slots.inject('main', () => ctx.slots.register(mainSlot(), ChangelogPanel)),
          ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(iconSlot(), ChangelogIcon)),
          ctx.slots.inject('main', () => ctx.slots.register(storageSlot(), StorageDashboard)),
          ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(storageIconSlot(), StorageIcon)),
        ]
      }
      register()
      const off = ctx.locale.subscribe(register)
      return () => {
        if (typeof off === 'function') off()
        for (const dispose of disposers.splice(0)) {
          if (typeof dispose === 'function') dispose()
        }
      }
    },
    'dsh-changelog-panel: locale-reactive registrations',
  )
}

export { apply, inject, PANEL_ID, NS, ChangelogPanel, ChangelogIcon, matches, groupByCategory, describeSweep, ensureStyles, CSS, isBrowsableUrl, activeLocaleId, pickLocale, pickText, pickTextList, translateTo }
