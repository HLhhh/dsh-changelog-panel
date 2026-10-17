/**
 * Live-refresh layer: the refresh state machine, its status line, the "which
 * version am I on" badge, and the fetched release-notes view.
 *
 * Split out of `index.mjs` so the network-facing behaviour can be reasoned about
 * (and tested) on its own. `tests/build.mjs` concatenates this file into one
 * scope with `live-data.mjs` and `index.mjs`, so it imports nothing:
 * `fetchLiveData`, `pickText`, `isArray`, `el` and `React` are plain in-scope
 * bindings, and so are the build-time `RELEASES` and `INSTALLED_VERSION`.
 *
 * Wiring status, checked against the current `index.mjs` and its stylesheet:
 *
 * - No new CSS classes. Every class used here already exists:
 *     .dshcl-ver (badge wrapper), .dshcl-verValue,
 *     .dshcl-verState with .dshcl-verStateOk / Behind / Ahead / Unknown,
 *     .dshcl-live, .dshcl-liveHead, .dshcl-liveTitle, .dshcl-liveControls,
 *     .dshcl-liveBtn,
 *     .dshcl-liveStatus with .dshcl-liveStatusOk / Warn / Error,
 *     .dshcl-liveWarn, .dshcl-liveRelease, .dshcl-liveReleaseHead,
 *     .dshcl-liveDate, .dshcl-liveNoteHead, .dshcl-liveItem,
 *     .dshcl-liveItemText, .dshcl-liveCredits,
 *   plus the shared .dshcl-group, .dshcl-items, .dshcl-count, .dshcl-pill,
 *   .dshcl-tag, .dshcl-empty, .dshcl-ref and .dshcl-ver (release version text).
 *
 * - No new dictionary keys. The keys consumed, all present in the dictionaries:
 *     live.title, live.refresh, live.refreshing, live.auto, live.autoOn,
 *     live.autoOff, live.interval, live.everyMinutes, live.everyHours,
 *     live.lastUpdated, live.neverFetched, live.error, live.rateLimited,
 *     live.warning, live.empty, live.liveVersions, live.officialNotes,
 *     live.noNotes, live.noChinese, live.version.current, live.version.latest,
 *     live.version.upToDate, live.version.behind, live.version.ahead,
 *     live.version.unknown, note.new, note.improved, note.fixed, note.other.
 *   The note.* labels go through `t()`, with `NOTE_CATEGORY_LABEL` (below) as the
 *   fallback for a bundle whose dictionary has not been extended yet.
 *
 * The only Chinese strings that live in this file are the four category labels in
 * `NOTE_CATEGORY_LABEL`; every other word comes from the panel's dictionaries.
 *
 * @module dsh-changelog-panel/fetched
 */

/** How many live releases the list renders; older ones stay reachable in the rail. */
const LIVE_LIST_LIMIT = 12

/**
 * Release-note categories: icon and label, in render order.
 *
 * Exported because these four labels are part of the feature's contract and are
 * the fallback when a dictionary key is missing; the panel's dictionaries win
 * wherever they define `note.<category>`.
 */
const NOTE_CATEGORY_LABEL = {
  new: { icon: '✨', zh: '新增', en: 'New features' },
  improved: { icon: '🎨', zh: '优化', en: 'Improvements' },
  fixed: { icon: '🐛', zh: '修复', en: 'Bug fixes' },
  other: { icon: '⚠️', zh: '其他', en: 'Other changes' },
}

/** Render order for `NOTE_CATEGORY_LABEL`. */
const NOTE_RENDER_ORDER = ['new', 'improved', 'fixed', 'other']

/** Tone name → status-line classes. Tones are the vocabulary `describeRefresh` returns. */
const LIVE_STATUS_CLASS = {
  idle: 'dshcl-liveStatus',
  busy: 'dshcl-liveStatus',
  ok: 'dshcl-liveStatus dshcl-liveStatusOk',
  warn: 'dshcl-liveStatus dshcl-liveStatusWarn',
  error: 'dshcl-liveStatus dshcl-liveStatusError',
}

// ── version comparison ──────────────────────────────────────────────────────

/**
 * Split a version into its numeric core and its prerelease identifiers.
 *
 * Build metadata (`+sha`) is dropped, as semver's precedence rules require, and a
 * value with no numeric core returns null rather than 0.0.0: pretending `abc` is
 * a version would show a bogus "update available" badge instead of admitting the
 * comparison cannot be made.
 * @param version - a semver-ish string.
 * @returns `{ core: number[], pre: (string|number)[] }`, or null.
 */
function parseVersion(version) {
  if (typeof version !== 'string') return null
  const text = version.trim().replace(/^v/i, '')
  if (text === '' || !/^[0-9]/.test(text)) return null
  const withoutBuild = text.split('+')[0]
  const sections = withoutBuild.split('-')
  const parts = sections[0].split('.')
  if (!parts.every((part) => /^[0-9]+$/.test(part))) return null
  const core = parts.map(Number)
  // Everything after the first hyphen is prerelease, hyphens included:
  // '1.0.0-alpha-1' carries one identifier, not two.
  const pre = sections.length > 1
    ? sections
        .slice(1)
        .join('-')
        .split('.')
        .filter((part) => part !== '')
        .map((part) => (/^[0-9]+$/.test(part) ? Number(part) : part))
    : []
  return { core: core, pre: pre }
}

/**
 * Compare two versions by semver precedence.
 *
 * Deliberately small — it only orders published tags — but the prerelease rules
 * are the part that matters and are implemented properly: a prerelease sorts
 * below its release (`0.2.0-rc.2 < 0.2.0`), numeric identifiers compare
 * numerically (`0.2.0-rc.10 > 0.2.0-rc.2`) and rank below alphanumeric ones, and
 * a longer prerelease wins when the shorter is its prefix.
 * @param a - left version.
 * @param b - right version.
 * @returns -1, 0 or 1; null when either side is unparseable.
 */
function compareVersions(a, b) {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) return null

  const width = Math.max(left.core.length, right.core.length)
  for (let index = 0; index < width; index += 1) {
    const one = left.core[index] === undefined ? 0 : left.core[index]
    const two = right.core[index] === undefined ? 0 : right.core[index]
    if (one !== two) return one < two ? -1 : 1
  }

  // A version with a prerelease tag sorts before the same core without one.
  if (left.pre.length === 0 && right.pre.length === 0) return 0
  if (left.pre.length === 0) return 1
  if (right.pre.length === 0) return -1

  const preWidth = Math.max(left.pre.length, right.pre.length)
  for (let index = 0; index < preWidth; index += 1) {
    const one = left.pre[index]
    const two = right.pre[index]
    if (one === undefined) return -1
    if (two === undefined) return 1
    if (one === two) continue
    const oneNumeric = typeof one === 'number'
    const twoNumeric = typeof two === 'number'
    if (oneNumeric && twoNumeric) return one < two ? -1 : 1
    // Numeric identifiers always sort before alphanumeric ones.
    if (oneNumeric !== twoNumeric) return oneNumeric ? -1 : 1
    return String(one) < String(two) ? -1 : 1
  }
  return 0
}

/**
 * How the installed build relates to the newest known release.
 *
 * `tone` doubles as the class suffix (`dshcl-verStateOk` …), which is why it
 * repeats `relation` rather than being derived a second time at the call site.
 * @param installed - the installed version, or '' when unknown.
 * @param newest - the newest known version, or '' when unknown.
 * @returns `{ relation, tone }`, relation being ok|behind|ahead|unknown.
 */
function versionRelation(installed, newest) {
  const order = compareVersions(installed, newest)
  if (order === null) return { relation: 'unknown', tone: 'unknown' }
  if (order === 0) return { relation: 'ok', tone: 'ok' }
  return order < 0 ? { relation: 'behind', tone: 'behind' } : { relation: 'ahead', tone: 'ahead' }
}

// ── refresh state ───────────────────────────────────────────────────────────

/**
 * Seed the refresh state.
 *
 * A cache restored here is the payload of the last successful fetch, so a
 * reopened panel shows data immediately instead of an empty state; the reader
 * then refreshes when they want fresh numbers.
 * @param cached - a payload restored from `localStorage`, if any.
 * @returns the initial state; an absent or malformed cache yields the idle seed.
 */
function createLiveState(cached) {
  const restored = cached && isArray(cached.releases) && cached.releases.length > 0 ? cached : null
  return {
    status: restored ? 'ok' : 'idle',
    data: restored,
    error: '',
    lastAttemptAt: restored && typeof restored.fetchedAt === 'string' ? restored.fetchedAt : null,
    rateLimited: false,
    warnings: restored && isArray(restored.warnings) ? restored.warnings : [],
  }
}

/**
 * Turn a thrown fetch failure into a message a reader can act on.
 *
 * The transport's own wording is English, exactly like the warnings
 * `live-data.mjs` returns; the status line puts the localized `live.error` label
 * in front of it, so a driver string is never the whole story the reader sees.
 * @param error - the value `fetchLiveData` threw.
 * @returns a one-line message.
 */
function describeRefreshError(error) {
  if (!error) return 'unknown error'
  if (error.name === 'AbortError') return 'refresh aborted'
  if (typeof error.message === 'string' && error.message !== '') return error.message
  return String(error)
}

/**
 * Fetch once and fold the outcome into the state.
 *
 * The caller marks the state `loading` itself before applying this updater,
 * because the in-flight transition has to be visible while the request runs and
 * React state updates are asynchronous:
 *
 *     setLive((current) => ({ ...current, status: 'loading' }))
 *     setLive(await runRefresh({ signal })(currentState))
 *
 * A failed refresh keeps the previous payload: losing the data a reader is
 * already looking at because a network call failed would be worse than showing
 * slightly stale data with a warning.
 * @param options - `{ signal }`, an AbortSignal that cancels the request.
 * @returns an async state reducer `(state) => nextState`.
 */
function runRefresh(options) {
  const signal = options && options.signal
  return async (state) => {
    const previous = state || createLiveState()
    const attemptedAt = new Date().toISOString()
    try {
      const data = await fetchLiveData({ signal: signal })
      return {
        ...previous,
        status: 'ok',
        data: data,
        error: '',
        rateLimited: data && data.rateLimited === true,
        warnings: isArray(data && data.warnings) ? data.warnings : [],
        lastAttemptAt: attemptedAt,
      }
    } catch (error) {
      return {
        ...previous,
        status: 'error',
        error: describeRefreshError(error),
        lastAttemptAt: attemptedAt,
      }
    }
  }
}

// ── describing the state ────────────────────────────────────────────────────

/**
 * A short timestamp in the reader's own time zone, with an explicit offset.
 *
 * The alternative was UTC, which is friendlier to tests and screenshots but asks
 * a reader to convert in their head the one number they actually want ("when did
 * this last update"). The offset is printed rather than named so the output does
 * not depend on a locale-aware formatter.
 * @param iso - an ISO timestamp, or anything else.
 * @param language - 'zh' or 'en'; only the punctuation differs.
 * @returns `YYYY-MM-DD HH:mm UTC±HH:MM`, or '' when the value is not a usable date.
 */
function formatTimestamp(iso, language) {
  if (typeof iso !== 'string' || iso === '') return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const pad = (value) => String(value).padStart(2, '0')
  const stamp =
    at.getFullYear() +
    '-' +
    pad(at.getMonth() + 1) +
    '-' +
    pad(at.getDate()) +
    ' ' +
    pad(at.getHours()) +
    ':' +
    pad(at.getMinutes())
  // getTimezoneOffset is minutes BEHIND UTC, so its sign is inverted here.
  const offsetMinutes = -at.getTimezoneOffset()
  const sign = offsetMinutes < 0 ? '-' : '+'
  const absolute = Math.abs(offsetMinutes)
  const zone = 'UTC' + sign + pad(Math.floor(absolute / 60)) + ':' + pad(absolute % 60)
  return language === 'zh' ? stamp + '（' + zone + '）' : stamp + ' ' + zone
}

/**
 * Build the status line for the refresh controls.
 *
 * `lastAttemptAt` is reported for every state that has one — including a failed
 * or an in-flight attempt — because "when did we last try" is the fact that makes
 * a stale panel trustworthy or not.
 * @param state - the refresh state.
 * @param t - the panel's translator, bound to the display language.
 * @param language - 'zh' or 'en'.
 * @returns `{ label, tone, detail, canRefresh }`, tone being one of
 *   'idle' | 'busy' | 'ok' | 'warn' | 'error'.
 */
function describeRefresh(state, t, language) {
  const current = state || createLiveState()
  const rows = current.data && isArray(current.data.releases) ? current.data.releases : []
  const warnings = isArray(current.warnings) ? current.warnings : []
  const stamp = formatTimestamp(current.lastAttemptAt, language)
  const timePart = stamp ? t('live.lastUpdated', { time: stamp }) : ''
  // A rate limit or a previous failure still allows a manual retry — the budget
  // may have reset and the reader may know something we do not — so only an
  // in-flight request takes the button away.
  const canRefresh = current.status !== 'loading'

  if (current.status === 'loading') {
    return { label: t('live.refreshing'), tone: 'busy', detail: timePart, canRefresh: false }
  }
  if (current.status === 'error') {
    return {
      label: t('live.error'),
      tone: 'error',
      detail: [timePart, current.error].filter(Boolean).join(' · '),
      canRefresh: canRefresh,
    }
  }
  if (current.status === 'ok' && current.rateLimited) {
    // Distinct from a plain failure: the data is still good, but the notes source
    // is out of budget, and the panel says exactly that instead of "refresh
    // failed" or a silent success.
    return { label: t('live.rateLimited'), tone: 'warn', detail: timePart, canRefresh: canRefresh }
  }
  if (current.status === 'ok') {
    // A lost source is surfaced as a count, not as a different tone: the fetch
    // did succeed, and only rate limiting is a state the reader must act on.
    const detail = warnings.length > 0 ? timePart + ' · ' + t('live.warning') + ' ' + warnings.length : timePart
    return { label: t('live.liveVersions', { n: rows.length }), tone: 'ok', detail: detail, canRefresh: canRefresh }
  }
  return { label: t('live.neverFetched'), tone: 'idle', detail: timePart, canRefresh: canRefresh }
}

// ── version badge ───────────────────────────────────────────────────────────

/**
 * The version this build was made from.
 *
 * The bare identifier is guarded because the bundle is also exercised standalone,
 * and the build bakes in the literal 'unknown' when it cannot read the packaged
 * app — a placeholder that must not be compared as a version.
 * The runtime value (`props.installedVersion`, read from the host report) always
 * wins; the build-time bake is only a fallback.
 * @param props - slot props, optionally carrying `installedVersion`.
 * @returns a version string, or '' when it is unknown.
 */
function installedVersionOf(props) {
  // Runtime first. The bundle also bakes a version in, but that is a build-time
  // snapshot: after the user upgrades the app it names a release they no longer
  // run. The baked value survives only as the fallback for a standalone render.
  const provided = props && typeof props.installedVersion === 'string' ? props.installedVersion : ''
  if (provided !== '' && provided !== 'unknown') return provided
  const baked = typeof INSTALLED_VERSION !== 'undefined' ? INSTALLED_VERSION : ''
  if (typeof baked === 'string' && baked !== '' && baked !== 'unknown') return baked
  return ''
}

/**
 * The newest version known from either source: live data first, then the dataset.
 *
 * Not `RELEASES[0]`: the bundled dataset is authored newest-first but flags the
 * installed build with `highlight`, so array order is presentation rather than a
 * guarantee — the comparator decides, which also covers a live payload whose
 * first row is malformed.
 * @param state - the refresh state, or a live payload.
 * @returns a version string, or '' when neither source has one.
 */
function newestKnownVersion(state) {
  const payload = state && isArray(state.releases) ? state : state && state.data ? state.data : null
  const liveRows = payload && isArray(payload.releases) ? payload.releases : []
  for (const row of liveRows) {
    if (row && typeof row.version === 'string' && row.version !== '') return row.version
  }
  const bundled = typeof RELEASES !== 'undefined' && isArray(RELEASES) ? RELEASES : []
  let best = ''
  for (const row of bundled) {
    const version = row && typeof row.version === 'string' ? row.version : ''
    if (version === '') continue
    if (best === '' || compareVersions(version, best) === 1) best = version
  }
  return best
}

/**
 * The compact "current version" display for the panel header.
 *
 * Shows the installed build, the newest version known from either source, and the
 * relation between them. When either side is unknown the badge says the versions
 * are not comparable instead of claiming the install is current: "we could not
 * compare" and "you are up to date" are different statements and only one of them
 * is true here.
 * @param props - `{ state, t, language }`, plus an optional `installedVersion`.
 * @returns the badge element.
 */
function renderVersionBadge(props) {
  const t = props.t
  const installed = installedVersionOf(props)
  const newest = newestKnownVersion(props.state)
  const { relation, tone } = versionRelation(installed, newest)
  const rows = props.state && props.state.data && isArray(props.state.data.releases) ? props.state.data.releases : []
  const source = rows.length > 0 ? 'live' : 'bundled'
  const stateLabel = {
    ok: t('live.version.upToDate'),
    behind: t('live.version.behind'),
    ahead: t('live.version.ahead'),
    unknown: t('live.version.unknown'),
  }[relation]
  // The tooltip carries what the header row has no space for: both versions and
  // where "newest" came from — a live fetch or the bundled snapshot.
  const title =
    t('live.version.current') +
    ' ' +
    (installed || '—') +
    ' · ' +
    t('live.version.latest') +
    ' ' +
    (newest || '—') +
    (source === 'bundled' ? ' · ' + t('live.neverFetched') : '')
  return el(
    'div',
    { className: 'dshcl-ver', title: title },
    el('span', { className: 'dshcl-verValue' }, installed || '—'),
    newest
      ? el(
          'span',
          { className: 'dshcl-verState dshcl-verState' + tone[0].toUpperCase() + tone.slice(1) },
          stateLabel + ' · ' + t('live.version.latest') + ' ' + newest,
        )
      : el('span', { className: 'dshcl-verState dshcl-verStateUnknown' }, stateLabel),
  )
}

// ── release notes ───────────────────────────────────────────────────────────

/**
 * The visible label for one note category.
 *
 * The dictionaries own the wording — they are the panel's translated surface —
 * and `NOTE_CATEGORY_LABEL` is the fallback for a bundle whose dictionary has not
 * been extended yet. `translateTo` answers a key it cannot resolve with the key
 * itself, which is the signal used here.
 * @param category - a category key, possibly one the panel does not know.
 * @param language - 'zh' or 'en'.
 * @param t - the panel's translator.
 * @returns the label to display.
 */
function noteCategoryLabel(category, language, t) {
  const known = Object.prototype.hasOwnProperty.call(NOTE_CATEGORY_LABEL, category)
  const meta = known ? NOTE_CATEGORY_LABEL[category] : NOTE_CATEGORY_LABEL.other
  const key = 'note.' + (known ? category : 'other')
  const text = t(key)
  return text === key ? (language === 'zh' ? meta.zh : meta.en) : text
}

/**
 * Put one release's note groups in display order, dropping empty ones.
 *
 * `live-data.mjs` sorts already, but a heading the official notes repeat (two
 * "新增" sections in one release) must keep its original relative order, which a
 * plain category sort would lose — hence the index tiebreak.
 * @param groups - parsed note groups.
 * @returns the ordered groups.
 */
function orderNoteGroups(groups) {
  const rank = (category) => {
    const at = NOTE_RENDER_ORDER.indexOf(category)
    return at === -1 ? NOTE_RENDER_ORDER.length : at
  }
  return groups
    .filter((group) => group && isArray(group.items) && group.items.length > 0)
    .map((group, index) => ({ group: group, index: index }))
    .sort((left, right) => rank(left.group.category) - rank(right.group.category) || left.index - right.index)
    .map((entry) => entry.group)
}

/** Sort key for a live release row: its exact publish time when present. */
function stampOf(row) {
  if (!row) return ''
  if (typeof row.publishedAt === 'string' && row.publishedAt !== '') return row.publishedAt
  return typeof row.date === 'string' ? row.date : ''
}

/**
 * Newest release first.
 *
 * `live-data.mjs` already sorts by publish time; this repeats the promise at the
 * render boundary, where a hand-built state (a fixture, a restored cache, a
 * future producer) may hand the rows over in another order. ISO strings compare
 * correctly as strings, and rows without a date keep their order at the end.
 * @param rows - live release rows.
 * @returns a sorted copy.
 */
function newestFirst(rows) {
  return rows
    .map((row, index) => ({ row: row, index: index }))
    .sort((left, right) => {
      const a = stampOf(left.row)
      const b = stampOf(right.row)
      if (a === b) return left.index - right.index
      return a < b ? 1 : -1
    })
    .map((entry) => entry.row)
}

/**
 * One note item: its text in the reader's language, plus attribution tags.
 * @param props - `{ item, language }`.
 * @returns the list item element.
 */
function LiveNoteItem(props) {
  const item = props.item
  const credits = isArray(item.credits) ? item.credits : []
  return el(
    'li',
    { className: 'dshcl-liveItem' },
    el('span', { className: 'dshcl-liveItemText' }, pickText(item.text, props.language)),
    credits.length > 0
      ? el(
          'span',
          { className: 'dshcl-liveCredits' },
          credits.map((handle, index) =>
            el('span', { className: 'dshcl-tag', key: handle + '#' + index }, '@' + handle),
          ),
        )
      : null,
  )
}

/**
 * One release's official notes, grouped by category.
 * @param props - `{ groups, t, language }`.
 * @returns the grouped notes element.
 */
function LiveNoteGroups(props) {
  const groups = orderNoteGroups(isArray(props.groups) ? props.groups : [])
  return el(
    'div',
    null,
    groups.map((group, index) => {
      const meta = NOTE_CATEGORY_LABEL[group.category] || NOTE_CATEGORY_LABEL.other
      const items = isArray(group.items) ? group.items : []
      return el(
        'div',
        // Keyed by position, not by category: the official notes may repeat one
        // category, and two sections with the same key would confuse React.
        { className: 'dshcl-group', key: 'group' + index },
        el(
          'div',
          { className: 'dshcl-liveNoteHead' },
          el('span', { 'aria-hidden': 'true' }, meta.icon),
          el('span', null, noteCategoryLabel(group.category, props.language, props.t)),
          el('span', { className: 'dshcl-count' }, '· ' + items.length),
        ),
        el(
          'ul',
          { className: 'dshcl-items' },
          items.map((item, itemIndex) =>
            el(LiveNoteItem, {
              key: item && item.key ? item.key : 'item' + itemIndex,
              item: item,
              language: props.language,
            }),
          ),
        ),
      )
    }),
  )
}

/**
 * One live release: version, dist-tags, publish date, and its official notes.
 *
 * "The project never published notes for this version" and "the notes exist but
 * carry no Chinese" are different facts, and the reader asked about both, so each
 * version states its own case in the reader's language instead of showing an
 * unexplained gap. Notes that exist only in English are still rendered in the
 * Chinese view (`pickText` falls back), which is why the English-only notice
 * explains the text below it rather than replacing it.
 * @param props - `{ row, t, language }`.
 * @returns the release element.
 */
function renderLiveRelease(props) {
  const row = props.row
  const t = props.t
  const language = props.language === 'zh' ? 'zh' : 'en'
  const notes = row.notes || null
  const groups = notes && isArray(notes.groups) ? notes.groups : []
  const hasNotes = Boolean(notes && notes.hasNotes && groups.length > 0)
  return el(
    'div',
    { className: 'dshcl-liveRelease' },
    el(
      'div',
      { className: 'dshcl-liveReleaseHead' },
      el('span', { className: 'dshcl-ver' }, row.version),
      isArray(row.latestFor) && row.latestFor.length > 0
        ? row.latestFor.map((tag) => el('span', { className: 'dshcl-pill', key: tag }, tag))
        : null,
      row.date ? el('span', { className: 'dshcl-liveDate' }, row.date) : null,
      notes && notes.url
        ? el(
            'a',
            { className: 'dshcl-ref', href: notes.url, target: '_blank', rel: 'noreferrer noopener' },
            t('live.officialNotes'),
          )
        : null,
    ),
    hasNotes ? null : el('p', { className: 'dshcl-liveWarn' }, t('live.noNotes')),
    hasNotes && notes.hasChinese === false
      ? el('p', { className: 'dshcl-liveWarn' }, t('live.noChinese'))
      : null,
    hasNotes ? el(LiveNoteGroups, { groups: groups, t: t, language: language }) : null,
  )
}

// ── the live section ────────────────────────────────────────────────────────

/**
 * The refresh control cluster on its own, so the panel can mount it in its
 * non-scrolling header.
 *
 * The reported bug was that the refresh button travelled with each release's
 * notes: the control sat above the content it refreshes inside the scrolling
 * column, so scrolling a long release pushed it out of reach. Splitting it from
 * `renderLiveNotes` lets the header own it while the section keeps the status
 * line that explains it.
 * @param props - `{ state, t, language, onRefresh }`.
 * @returns the control cluster.
 */
function renderRefreshControls(props) {
  const t = props.t
  const language = props.language === 'zh' ? 'zh' : 'en'
  const state = props.state || createLiveState()
  const status = describeRefresh(state, t, language)
  return el(
    'div',
    { className: 'dshcl-liveControls', 'data-live-controls': 'true' },
    el(
      'button',
      {
        type: 'button',
        className: 'dshcl-liveBtn',
        disabled: !status.canRefresh,
        // The button carries the status as its tooltip, so the reason it is
        // disabled (or what it will do) is reachable without extra chrome.
        title: status.detail || t('live.refresh'),
        onClick: () => {
          if (typeof props.onRefresh === 'function') props.onRefresh()
        },
      },
      status.canRefresh ? t('live.refresh') : t('live.refreshing'),
    ),
    // The last-refresh time belongs next to the control that sets it, and in the
    // header it stays visible while the release notes scroll.
    el(
      'span',
      { className: 'dshcl-liveStatus ' + LIVE_STATUS_CLASS[status.tone] },
      el('span', null, status.label),
      status.detail ? el('span', { className: 'dshcl-liveDate' }, ' · ' + status.detail) : null,
    ),
  )
}

/**
 * The whole live section: controls, status, warnings, and the fetched releases.
 *
 * Purely presentational — it never fetches. The panel owns the state machine: it
 * holds `createLiveState()`, marks the state `loading` and applies `runRefresh()`
 * when a control fires
 * is true. `onToggleAuto` receives the next boolean and `onSetInterval` receives
 * milliseconds, so the panel can store both without re-deriving them from the DOM.
 * @param props - `{ state, t, language, onRefresh, onToggleAuto, onSetInterval }`.
 * @returns the section element.
 */
function renderLiveNotes(props) {
  const t = props.t
  const language = props.language === 'zh' ? 'zh' : 'en'
  const state = props.state || createLiveState()
  const status = describeRefresh(state, t, language)
  const warnings = isArray(state.warnings) ? state.warnings : []
  const rows = newestFirst(state.data && isArray(state.data.releases) ? state.data.releases : [])
  return el(
    'section',
    { className: 'dshcl-live' },
    el(
      'div',
      { className: 'dshcl-liveHead' },
      el('span', { className: 'dshcl-liveTitle' }, t('live.title')),
      // The control cluster itself lives in the panel header (see
      // renderRefreshControls) so it does not travel with a long release's notes.
      el('span', { className: LIVE_STATUS_CLASS[status.tone] }, status.label),
      status.detail ? el('span', { className: 'dshcl-liveDate' }, '· ' + status.detail) : null,
    ),
    warnings.length > 0
      ? el(
          'ul',
          { className: 'dshcl-liveWarn' },
          warnings.map((warning, index) => el('li', { key: 'warn' + index }, warning)),
        )
      : null,
    rows.length === 0
      ? el('p', { className: 'dshcl-liveWarn' }, t('live.empty'))
      : el(
          'div',
          null,
          el(
            'p',
            { className: 'dshcl-liveTitle' },
            t('live.liveVersions', { n: rows.length }),
            // Say that the list is capped, so a reader does not conclude the
            // older releases are missing. They are reachable in the rail.
            rows.length > LIVE_LIST_LIMIT
              ? el('span', { className: 'dshcl-liveDate' }, ' · ' + t('live.showingLatest', { n: LIVE_LIST_LIMIT }))
              : null,
          ),
          // Capping keeps the DOM bounded: one release can carry 90+ items and the
          // registry lists 30+ versions, which is a very large tree for a section
          // whose question is "what changed lately". Older versions stay reachable
          // in the rail.
          rows.slice(0, LIVE_LIST_LIMIT).map((row, index) =>
            renderLiveRelease({ row: row, t: t, language: language, key: row.version || index }),
          ),
        ),
  )
}

export {
  renderVersionBadge,
  renderLiveNotes,
  renderRefreshControls,
  renderLiveRelease,
  createLiveState,
  runRefresh,
  describeRefresh,
  NOTE_CATEGORY_LABEL,
  compareVersions,
  parseVersion,
  versionRelation,
  newestKnownVersion,
  formatTimestamp,
  LIVE_LIST_LIMIT,
}
