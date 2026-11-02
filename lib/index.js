// Host half of the plugin.
//
// The changelog panel itself is browser-only. The one thing the browser cannot do
// is read the running application's version, so this half does exactly that: it
// detects the version at runtime and writes it to a small file the panel can read
// from its own workspace.
//
// It deliberately does NOT scan the disk, measure storage, register reclaim tools,
// or delete anything. An earlier revision shipped a storage dashboard plus reclaim
// tools; that feature was removed as incomplete, and this host half is all that
// remains of the host/worker channel — a version probe the panel needs in order to
// tell "you are on the newest release" from "this bundle is old".

import { mkdirSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { detectInstalledVersionInfo } from './app-version.js'

/** Stable Loader identity. */
export const name = 'dsh-changelog-panel'

/** Workspace-relative directory the browser half reads. */
export const VERSION_DIR = '.dsh-changelog'
/** The file name inside that directory. */
export const VERSION_FILE = 'version.json'

/** The DSH home this process is running against. */
function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/**
 * The workspace a reader most likely has open, read from the session index.
 *
 * `process.cwd()` cannot answer this — the host process runs from the plugin
 * directory — and the browser half can only read workspace-relative paths. The most
 * recently modified projection is a good proxy and costs one directory scan.
 * @returns an absolute workspace path, or null.
 */
function mostRecentWorkspace() {
  try {
    const dir = join(dshHome(), 'storages', 'session_projcache', 'sessions')
    let newest = null
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith('.json')) continue
      const path = join(dir, entry)
      const info = statSync(path)
      if (newest === null || info.mtimeMs > newest.mtimeMs) newest = { path, mtimeMs: info.mtimeMs }
    }
    if (newest === null) return null
    const doc = JSON.parse(readFileSync(newest.path, 'utf8'))
    const cwd = doc && doc.record && doc.record.identity && doc.record.identity.cwd
    return typeof cwd === 'string' && cwd !== '' ? cwd : null
  } catch {
    return null
  }
}

/**
 * Detect the running version and write it where the browser half can read it.
 *
 * A failure here must never take the profile down: it is a status readout, and the
 * panel degrades to the build-time fallback and renders "unknown".
 * @returns `{ ok, path, version, source, error }`.
 */
export function writeVersionFile() {
  let info = { version: null, source: 'error', checked: [] }
  try {
    info = detectInstalledVersionInfo()
  } catch {
    info = { version: null, source: 'error', checked: [] }
  }
  const workspace = mostRecentWorkspace()
  if (workspace === null) {
    return { ok: false, path: '', version: info.version, source: info.source, error: 'no workspace to write into' }
  }
  const path = join(workspace, VERSION_DIR, VERSION_FILE)
  const payload = {
    schemaVersion: 1,
    dshVersion: info.version === null ? 'unknown' : info.version,
    source: info.source,
    checked: info.checked.slice(0, 8),
    generatedAt: new Date().toISOString(),
  }
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(payload), 'utf8')
    return { ok: true, path, version: payload.dshVersion, source: payload.source, error: '' }
  } catch (error) {
    return {
      ok: false,
      path,
      version: info.version,
      source: info.source,
      error: String((error && error.message) || error),
    }
  }
}

/**
 * Loader-visible body: detect once at activation and log the outcome.
 * @param ctx - host plugin context.
 * @returns {void}
 */
export function apply(ctx) {
  const result = writeVersionFile()
  const logger = ctx && ctx.logger ? ctx.logger : console
  if (result.ok) {
    logger.info(`[changelog-panel] DSH ${result.version} (${result.source}) → ${result.path}`)
  } else {
    logger.warn(`[changelog-panel] version file not written: ${result.error}`)
  }
}
