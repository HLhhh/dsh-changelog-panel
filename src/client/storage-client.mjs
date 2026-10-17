/**
 * Browser half of the storage dashboard: registration, report loading, and the
 * reclaim action.
 *
 * Reading the report is the whole difficulty. A root-scoped panel has no Session
 * identity, and every `workspaceFiles` method requires a `WorkspaceFileScope`
 * (`sessionId` + `workspaceRoot`) that a global panel cannot synthesize. What it
 * CAN do is borrow one: the sessions snapshot is available to any panel, each row
 * carries the `cwd` the session runs in, and the host resolves an absolute path
 * against whichever own session the caller names. So the loader walks the known
 * sessions and keeps the first that successfully returns the report — resilient to
 * a session being archived or to this panel being opened before one exists.
 *
 * @module dsh-changelog-panel/storage-client
 */

/** Panel id: the panellist row and the keyed `main` entry share it. */
const STORAGE_PANEL_ID = 'storage'
/** Required cordis services. */
const STORAGE_INJECT = ['slots', 'locale', 'remote.workspaceFiles']

/**
 * Report location inside the reader's workspace.
 *
 * The host half writes the report twice (see `plugin/lib/index.js`): once under
 * `$DSH_HOME` for tooling, and once here. This copy is the one the browser can
 * reach — a workspace-relative path needs no knowledge of the host's home
 * directory, and `workspaceFiles.readBytes` resolves it against the session's own
 * workspace root.
 */
const STORAGE_REPORT_WORKSPACE_DIR = '.dsh-storage'
const STORAGE_REPORT_FILE = 'report.json'

/**
 * The read handed to `readBytes`: the report's workspace-relative path.
 * @param cwd - unused; kept so callers need not change if a second candidate is
 *   ever justified by evidence rather than by hope.
 * @returns one candidate.
 */
function reportCandidates(cwd) {
  const relative = STORAGE_REPORT_WORKSPACE_DIR + '/' + STORAGE_REPORT_FILE
  // Exactly one candidate, and it must be RELATIVE. The host's `relativePath`
  // refuses an absolute path whenever `baseFile` is supplied ("path must be
  // relative when baseFile is provided"), and a workspace-relative path resolved
  // against the session's own workspace root is already the correct absolute
  // target — the previous version's second candidate (absolute + baseFile) could
  // therefore never succeed and only wasted an attempt.
  return [{ path: relative, baseFile: null }]
}

/**
 * Readable form of a Remote failure envelope.
 *
 * Named apart from `live-data.mjs`'s `describeFailure`: both files are
 * concatenated into ONE bundle scope, so a shared name is not a link error — the
 * later declaration silently wins. That collision made this function replace the
 * live-data one, and the live changelog's rate-limit message lost its explanation
 * without anything failing to build.
 * @param error - the `error` of a refused result.
 * @returns a short description.
 */
function describeRemoteFailure(error) {
  if (error === null || error === undefined) return 'no reason given'
  if (typeof error === 'string') return error
  const code = error.code || error.kind || ''
  const message = error.message || error.detail || ''
  return (code ? code + ': ' : '') + String(message || JSON.stringify(error)).slice(0, 200)
}

/**
 * Readable form of an unexpected response body, so a shape mismatch is visible
 * instead of silent.
 * @param value - the decoded response value.
 * @returns a short description.
 */
function describeShape(value) {
  if (value === null || value === undefined) return String(value)
  if (typeof value !== 'object') return typeof value
  const keys = Object.keys(value)
  return 'keys=[' + keys.slice(0, 8).join(',') + ']'
}

/**
 * Decode whatever a Remote returned into text.
 *
 * Shape-tolerant by construction, in three ordered steps: unwrap one layer of the
 * common envelopes (`data`/`value`/`bytes`/`file`), normalize the payload to a
 * `Uint8Array` (from any typed array, `ArrayBuffer`, or plain array of byte
 * values — a JSON round trip turns a typed array into exactly that), then decode.
 *
 * The previous version enumerated shapes inline and got them wrong: a bare
 * `Uint8Array` decoded to null, so a report that had arrived intact was reported
 * as "not found". Correctness here is worth the explicit pipeline.
 * @param value - the response body, in whatever shape it arrived.
 * @returns the decoded text, or null when nothing readable is present.
 */
function decodeReport(value) {
  const unwrap = (input) => {
    let current = input
    for (let depth = 0; depth < 3; depth += 1) {
      if (current === null || typeof current !== 'object' || isByteLike(current)) return current
      const next = current.data ?? current.value ?? current.bytes ?? current.file
      if (next === undefined || next === current) return current
      current = next
    }
    return current
  }
  // Shape tests, NOT `instanceof`: a value that crosses a realm boundary — the
  // sandbox, a worker, or a serialization boundary — is not an instance of THIS
  // realm's `ArrayBuffer`, which is why a bare ArrayBuffer used to decode to null.
  const isBinary = (input) =>
    typeof input === 'object' &&
    input !== null &&
    typeof input.byteLength === 'number' &&
    !Array.isArray(input)
  const isByteLike = (input) =>
    typeof input === 'string' || Array.isArray(input) || isBinary(input)
  const toBytes = (input) => {
    if (typeof input === 'string') return null
    if (Array.isArray(input)) return Uint8Array.from(input.map((byte) => Number(byte) & 255))
    if (!isBinary(input)) return null
    try {
      if (typeof input.byteOffset === 'number') {
        // A view (typed array / DataView) names its own window into the buffer.
        return new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength))
      }
      return new Uint8Array(input.slice(0))
    } catch {
      try {
        return new Uint8Array(input)
      } catch {
        return null
      }
    }
  }
  const payload = unwrap(value)
  if (payload === null || payload === undefined) return null
  if (typeof payload === 'string') return payload
  const bytes = toBytes(payload)
  if (bytes === null) return null
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    return null
  }
}

/**
 * Read the report, trying each session as the source of a readable scope.
 * @param ctx - client plugin context.
 * @param signal - cancellation.
 * @returns `{ report, path, error }`.
 */
async function loadStorageReport(ctx, signal) {
  // Reading `ctx.remote` throws when `remote` was not injected, and a throw here
  // would take down the whole render tree — the reported failure. Everything about
  // this read is therefore treated as a value, never an exception.
  let remote = null
  try {
    remote = ctx.remote && ctx.remote.workspaceFiles
  } catch (error) {
    return { report: null, error: 'the remote service is not injected: ' + String((error && error.message) || error) }
  }
  if (!remote || typeof remote.readBytes !== 'function') {
    return { report: null, error: 'the workspaceFiles remote is unavailable in this composition' }
  }
  let sessions = []
  let sessionsError = ''
  try {
    const snapshot = ctx.sessions && ctx.sessions.list ? ctx.sessions.list.getSnapshot() : null
    const byId = snapshot && snapshot.byId ? snapshot.byId : {}
    sessions = Object.keys(byId)
      .map((id) => byId[id])
      .filter(Boolean)
    if (sessions.length === 0 && snapshot) {
      sessionsError = 'the session list is empty'
    }
  } catch (error) {
    // `ctx.sessions` throws when `sessions` was not injected — a distinct failure
    // from "there are no sessions", and worth reporting as itself.
    sessionsError = 'the sessions service is not injected: ' + String((error && error.message) || error)
  }
  // The snapshot already carries a stable order; try them all rather than
  // depending on a field that may not be present on every row.

  const attempted = []
  const reasons = []
  for (const session of sessions) {
    for (const candidate of reportCandidates(session.cwd)) {
      const key = candidate.path
      if (attempted.indexOf(key) !== -1) continue
      attempted.push(key)
      try {
        const options = candidate.baseFile ? { baseFile: candidate.baseFile } : {}
        const result = await remote.readBytes(session.id, candidate.path, options, signal)
        // Every reason a read can fail is recorded verbatim. Swallowing them cost
        // three round trips with the reader: the panel said only "not found" while
        // the real cause — an error envelope, a refusal, an unreadable body — was
        // thrown away here.
        if (result && result.ok === false) {
          reasons.push(key + ': refused — ' + describeRemoteFailure(result.error))
          continue
        }
        const value = result && result.value !== undefined ? result.value : result
        const text = decodeReport(value)
        if (text === null || text === '') {
          reasons.push(key + ': response carried no readable body (' + describeShape(value) + ')')
          continue
        }
        const report = JSON.parse(text)
        if (report && typeof report === 'object') return { report, path: key, error: '' }
        reasons.push(key + ': the body parsed but was not an object')
      } catch (error) {
        reasons.push(key + ': threw — ' + String((error && error.message) || error))
      }
    }
  }
  return {
    report: null,
    path: attempted.length > 0 ? attempted[0] : '',
    // The counts are part of the message on purpose: whether the panel could see
    // any session, and how many read attempts it made, are the two facts that
    // separate "no scope to read with" from "scope fine, file absent".
    error:
      sessions.length === 0
        ? sessionsError || 'no session is available to authorize a file read'
        : 'the report was not found. ' +
          attempted.length +
          ' attempt(s), ' +
          sessions.length +
          ' session(s) visible. ' +
          reasons.join(' | '),
  }
}

/**
 * The dashboard: load the host's report and show the inventory.
 * @param props - composed slot props plus the injected storage face.
 * @returns the panel element.
 */
function StorageDashboard(props) {
  React.useEffect(() => {
    ensureStyles()
  }, [])
  const t = props.t
  const language = props.language === 'zh' ? 'zh' : 'en'
  const [state, setState] = React.useState({ status: 'idle', report: null, path: '', error: '' })
  const busyRef = React.useRef(false)
  // Chart first: the reader who could not read the tables asked for shapes, and a
  // proportion is understood faster as a bar than as a column of numbers. The list
  // view stays available because exact figures matter when deciding what to delete.
  const [view, setView] = React.useState('chart')

  const load = React.useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    setState((current) => ({ ...current, status: 'loading', error: '' }))
    try {
      const loaded = await loadStorageReport(props.ctx, undefined)
      setState({
        status: loaded.report ? 'ready' : 'error',
        report: loaded.report,
        path: loaded.path,
        error: loaded.report ? '' : loaded.error,
      })
    } catch (error) {
      setState((current) => ({ ...current, status: 'error', error: String((error && error.message) || error) }))
    } finally {
      busyRef.current = false
    }
  }, [props.ctx])

  // Read once when the dashboard is opened: the report is a snapshot on disk, and
  // the host rewrites it on every plugin load, so a mount read is the current one.
  const openedRef = React.useRef(false)
  React.useEffect(() => {
    if (openedRef.current) return
    openedRef.current = true
    void load()
  }, [load])

  const plan = state.report && state.report.plan ? state.report.plan : { items: [] }

  // The storage panel must supply the SAME layout scaffolding the changelog panel
  // does: `.dshcl-root` (`height: 100%`) → `.dshcl-body` (`flex: 1`, `min-height: 0`)
  // → `.dshcl-main` (`overflow: auto`). Without them the dashboard rendered as a
  // bare `.dshcl-storage` block with no bounded height and no scroll container, so
  // a long report simply overflowed and the reader could not scroll it at all.
  return el(
    'div',
    { className: 'dshcl-root', 'data-dsh-plugin': 'dsh-changelog-panel' },
    el(
      'div',
      { className: 'dshcl-body' },
      el(
        'main',
        { className: 'dshcl-main dshcl-storageMain' },
        renderStoragePanel({
      report: state.report,
      plan: plan,
      t: t,
      language: language,
      busy: state.status === 'loading',
      error: state.error,
      onRefresh: () => {
        void load()
      },
      onRescan: null,
      // Chart or list. The panel is still a viewer: reclaim runs through the
      // `storage_cleanup` Agent tool, which is the only half with filesystem
      // authority, so there is no selection state and no trash action to wire.
      view: view,
      onView: setView,
      selected: [],
      onToggle: null,
      onTrash: null,
      trashing: false,
      result: null,
      canReveal: false,
          onOpenSession: (sessionId) => {
            if (props.uiWorkspace && typeof props.uiWorkspace.openSession === 'function') props.uiWorkspace.openSession(sessionId)
          },
        }),
      ),
    ),
  )
}

/** Sidebar glyph: a stacked-drive mark. */
function StorageIcon(iconProps) {
  const size = (iconProps && iconProps.size) || 16
  return el(
    'svg',
    { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
    el('rect', { x: '2.4', y: '2.6', width: '11.2', height: '4.4', rx: '1.2', stroke: 'currentColor', strokeWidth: '1.2' }),
    el('rect', { x: '2.4', y: '9', width: '11.2', height: '4.4', rx: '1.2', stroke: 'currentColor', strokeWidth: '1.2' }),
    el('path', { d: 'M4.8 4.8h.01M4.8 11.2h.01', stroke: 'currentColor', strokeWidth: '1.4', strokeLinecap: 'round' }),
  )
}

export {
  StorageDashboard,
  StorageIcon,
  loadStorageReport,
  reportCandidates,
  decodeReport,
  describeRemoteFailure,
  describeShape,
  STORAGE_PANEL_ID,
  STORAGE_INJECT,
  STORAGE_REPORT_WORKSPACE_DIR,
  STORAGE_REPORT_FILE,
}
