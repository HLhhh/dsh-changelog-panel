// Host half of the plugin.
//
// Three jobs, all Node-side:
//   1. the changelog panel's Loader row (a presence requirement, no runtime API)
//   2. the storage report: measure what DSH leaves on disk and write it where the
//      client half can read it
//   3. the storage Agent tools: `storage_report`, `storage_cleanup`, `storage_open`
//
// Why the report also goes through a file: the `host.call()` bridge documented for
// browser halves belongs to the `cordis_run` dynamic-plugin runner, not to a
// packaged `dsh.client` plugin. The client half therefore reads the JSON with
// `workspaceFiles.readBytes`, a workspace-relative path being the one form that
// needs no host-home knowledge.
//
// Why deletion is a tool rather than a panel button: a browser half has no
// filesystem authority and no client-to-host call channel, so it can never delete
// anything. The Agent runs host-side, so `storage_cleanup` is where reclaim
// belongs, and the panel is left showing the inventory.
//
// The scan is cheap — measured ~450 ms for 3 000+ files plus decompressing 23
// session logs to attribute subagent sessions — so it runs at activation instead
// of needing a background job. A plugin reload (or an app restart) rescans.

import { mkdirSync, writeFileSync, readdirSync, statSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { scanStorage, planCleanup } from './storage-scan.js'
import { detectInstalledVersionInfo } from './app-version.js'
import { registerStorageTools } from './storage-tools.js'

/** Stable Loader identity, following the shipped tool plugins. */
export const name = 'dsh-changelog-panel'
/** Services the host half reads: the tool registry, and the layout for its tools. */
export const inject = ['tools']

/** Where the client half looks for the report, relative to `$DSH_HOME`. */
export const REPORT_DIR = join('storages', 'dsh-storage-panel')
/** The report file name inside that directory. */
export const REPORT_FILE = 'report.json'
/** Workspace-relative directory the client half can actually read. */
export const WORKSPACE_REPORT_DIR = '.dsh-storage'
/** Workspace-relative report path handed to the client half. */
export const WORKSPACE_REPORT_PATH = join(WORKSPACE_REPORT_DIR, REPORT_FILE)

/** The DSH home this process is running against. */
function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/**
 * The workspace a reader most likely has open, read from the session index.
 *
 * `process.cwd()` cannot answer this — the host process runs from the plugin
 * directory — and a global panel has no Session identity to ask instead. The most
 * recently modified projection is a good proxy and costs one directory scan.
 * @returns an absolute workspace path, or null.
 */
function mostRecentWorkspace() {
  try {
    const dir = join(dshHome(), 'storages', 'session_projcache', 'sessions')
    let newest = null
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.json')) continue
      const path = join(dir, name)
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

/** Absolute path of the report the client reads. */
export function reportPath() {
  return join(dshHome(), REPORT_DIR, REPORT_FILE)
}

/**
 * Rescan and write the report.
 *
 * A failure here must not take the profile down: the panel is a diagnostic, and a
 * report carrying an `error` field is more useful than a failed boot.
 * @returns `{ ok, path, bytes, summary, error }`.
 */
export function writeReport() {
  const target = reportPath()
  try {
    // `process.cwd()` is the plugin's own directory, not the reader's workspace, so
    // the workspace root is taken from the session index: the most recently
    // modified projected session carries the `cwd` a human actually works in. The
    // per-session rows keep their own `cwd`, so grouping stays accurate regardless.
    const report = scanStorage({
      home: dshHome(),
      workspace: mostRecentWorkspace() || process.cwd(),
      activeProfile: process.env.DSH_PROFILE || '',
    })
    // Resolved at runtime, so the panel reports the app that is actually running
    // rather than the one this bundle was built against.
    let versionInfo = { version: null, source: 'error', checked: [] }
    try {
      versionInfo = detectInstalledVersionInfo()
    } catch {
      // Diagnostics only: a failed lookup must not cost the report its data.
      versionInfo = { version: null, source: 'error', checked: [] }
    }
    const dshVersion = versionInfo.version
    const payload = {
      ...report,
      plan: planCleanup(report),
      host: {
        ...report.host,
        dshVersion: dshVersion === null ? 'unknown' : dshVersion,
        // Provenance travels with the number so a report from another machine
        // explains itself: which source answered, and what was tried.
        dshVersionSource: versionInfo.source,
        dshVersionChecked: versionInfo.checked.slice(0, 8),
      },
    }
    const serialized = JSON.stringify(payload)
    mkdirSync(join(dshHome(), REPORT_DIR), { recursive: true })
    writeFileSync(target, serialized, 'utf8')
    // Also written into the workspace, because that is the only place the browser
    // half can read: a root-scoped panel has no Session identity, and the
    // `workspaceFiles` Remote API requires one, while `uiWorkspace.listDirectory`
    // returns entry names only — never file contents. A workspace-relative copy is
    // therefore the one path that needs no session scope at all.
    const workspaceCopy = join(report.host.workspace, WORKSPACE_REPORT_PATH)
    try {
      mkdirSync(dirname(workspaceCopy), { recursive: true })
      writeFileSync(workspaceCopy, serialized, 'utf8')
    } catch (error) {
      // The canonical copy is already written; the panel simply will not find the
      // workspace one and says so, rather than the scan failing.
      console.warn('[storage-panel] could not write the workspace copy: ' + String((error && error.message) || error))
    }
    return {
      ok: true,
      path: target,
      workspacePath: workspaceCopy,
      bytes: Buffer.byteLength(serialized, 'utf8'),
      summary: {
        grandTotal: payload.grandTotal,
        reclaimable: payload.plan.bytes,
        sessions: report.sessions.length,
        subagentsMapped: report.subagents.mapped,
        scanMs: report.scanMs,
        dshVersion: payload.host.dshVersion,
      },
    }
  } catch (error) {
    const message = String((error && error.message) || error)
    const failure = JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), error: message })
    // The failure is written to BOTH copies. Writing only the canonical one left the
    // workspace copy holding an older successful report, which the panel then showed
    // as if it were current — silent staleness is worse than a visible error.
    const copies = [target]
    try {
      const workspaceRoot = mostRecentWorkspace()
      if (workspaceRoot !== null) copies.push(join(workspaceRoot, WORKSPACE_REPORT_PATH))
    } catch {
      // Without a workspace root the canonical copy still carries the error.
    }
    let workspacePath = ''
    for (const [index, path] of copies.entries()) {
      try {
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, failure, 'utf8')
        if (index > 0) workspacePath = path
      } catch {
        // Writing the failure down also failed; the return value still reports it.
      }
    }
    return { ok: false, path: target, workspacePath, error: message }
  }
}

/**
 * Loader-visible body. The scan runs once at activation so the panel has data the
 * first time it is opened; the tools are registered against a shared environment
 * object so `storage-tools.js` needs no knowledge of how `$DSH_HOME` is derived.
 * @param ctx - host plugin context carrying the tool registry.
 * @returns {void}
 */
export function apply(ctx) {
  // Shared environment for the tools: one definition of "where DSH lives", so the
  // report writer and the cleanup tool can never disagree about the roots.
  //
  // Passed as an argument rather than parked on `ctx`: a Cordis `Context` is a
  // Proxy whose `set` trap refuses any property that was not `provide`d
  // (`cannot set property "storageEnv" without provide`), and `apply` runs
  // inside the plugin's fiber, where that refusal is a hard throw. That throw
  // aborted this host half at activation — the fiber ended `failed`, the report
  // was never written again, and the panel kept reading a stale workspace copy.
  const storageEnv = {
    home: dshHome(),
    activeProfile: process.env.DSH_PROFILE || '',
    workspace: mostRecentWorkspace,
  }

  const logger = ctx && ctx.logger ? ctx.logger : console
  try {
    registerStorageTools(ctx, storageEnv)
  } catch (error) {
    // A missing `tools` service must not take the profile down: the panel and the
    // report still work, and the reason is logged.
    logger.warn(`[storage-panel] tools not registered: ${String((error && error.message) || error)}`)
  }

  const result = writeReport()
  if (result.ok) {
    logger.info(
      `[storage-panel] inventory written to ${result.path} — ` +
        `DSH ${result.summary.dshVersion}, ` +
        `${(result.summary.grandTotal / 1048576).toFixed(1)} MiB total, ` +
        `${(result.summary.reclaimable / 1048576).toFixed(1)} MiB reclaimable, ${result.summary.scanMs} ms`,
    )
  } else {
    logger.warn(`[storage-panel] inventory scan failed: ${result.error}`)
  }
}
