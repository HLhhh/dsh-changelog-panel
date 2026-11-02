/**
 * Read the installed DSH version the host half wrote into this workspace.
 *
 * The browser cannot see the app bundle, so the host half (`lib/index.js`) detects
 * the running version and drops `{ dshVersion }` into `.dsh-changelog/version.json`.
 * This module is the browser side of that handoff.
 *
 * The read itself is the awkward part: a root-scoped panel has no Session identity,
 * and every `workspaceFiles` method requires a `WorkspaceFileScope`. What a panel
 * CAN do is borrow one — the sessions snapshot is available, and the host resolves a
 * workspace-relative path against whichever session the caller names. The loader
 * therefore walks the known sessions and keeps the first that returns the file.
 *
 * @module dsh-changelog-panel/installed-version
 */

/** Workspace-relative location written by the host half. */
const VERSION_RELATIVE = '.dsh-changelog/version.json'

/**
 * Decode whatever a Remote returned into text.
 *
 * Shape-tolerant by construction: the gateway may hand back a `Uint8Array`, a plain
 * array of byte values (a JSON round trip turns a typed array into one), a string,
 * or any of those nested under `data`/`value`. Reading the wrong shape silently
 * yields "version unknown", so this accepts all of them.
 * @param value - the response body, in whatever shape it arrived.
 * @returns the decoded text, or null.
 */
function decodeVersionBody(value) {
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
  // Shape tests, not `instanceof`: a value crossing a realm boundary is not an
  // instance of THIS realm's ArrayBuffer.
  const isBinary = (input) =>
    typeof input === 'object' && input !== null && typeof input.byteLength === 'number' && !Array.isArray(input)
  const isByteLike = (input) => typeof input === 'string' || Array.isArray(input) || isBinary(input)
  const toBytes = (input) => {
    if (typeof input === 'string') return null
    if (Array.isArray(input)) return Uint8Array.from(input.map((byte) => Number(byte) & 255))
    if (!isBinary(input)) return null
    try {
      if (typeof input.byteOffset === 'number') {
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
 * Read the version file, trying each session as the source of a readable scope.
 * @param ctx - client plugin context.
 * @param signal - cancellation.
 * @returns `{ version, source, error }`; version is '' when it could not be read.
 */
async function loadInstalledVersion(ctx, signal) {
  let remote = null
  try {
    remote = ctx && ctx.remote && ctx.remote.workspaceFiles
  } catch (error) {
    return { version: '', source: 'error', error: 'remote unavailable: ' + String((error && error.message) || error) }
  }
  if (!remote || typeof remote.readBytes !== 'function') {
    return { version: '', source: 'error', error: 'workspaceFiles remote unavailable' }
  }
  let sessionIds = []
  try {
    const snapshot = ctx.sessions && ctx.sessions.list ? ctx.sessions.list.getSnapshot() : null
    sessionIds = snapshot && snapshot.byId ? Object.keys(snapshot.byId) : []
  } catch {
    sessionIds = []
  }
  for (const sessionId of sessionIds) {
    try {
      const result = await remote.readBytes(sessionId, VERSION_RELATIVE, {}, signal)
      if (result && result.ok === false) continue
      const value = result && result.value !== undefined ? result.value : result
      const text = decodeVersionBody(value)
      if (text === null || text === '') continue
      const payload = JSON.parse(text)
      const version = payload && typeof payload.dshVersion === 'string' ? payload.dshVersion : ''
      if (version !== '' && version !== 'unknown') {
        return {
          version: version,
          source: typeof payload.source === 'string' ? payload.source : '',
          error: '',
        }
      }
      // A file explicitly saying "unknown" is a real answer: stop looking.
      if (version === 'unknown') return { version: '', source: typeof payload.source === 'string' ? payload.source : '', error: '' }
    } catch {
      // One unusable scope is expected; try the next session.
    }
  }
  return { version: '', source: '', error: 'version file not readable' }
}

export { loadInstalledVersion, VERSION_RELATIVE }
