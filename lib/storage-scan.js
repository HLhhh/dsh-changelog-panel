// Host half of the storage panel: measure what DSH leaves on this machine, and
// reclaim it on request.
//
// Why this exists as a host plugin rather than client-only code: walking the tree
// needs (a) recursive filesystem access without one RPC per file, and (b) the
// authoritative session metadata, both of which the in-process Node half has and
// the browser half does not. Measured on the author's machine: a full scan of the
// DSH home, the workspace, and the Electron cache (including decompressing every
// session log to attribute subagent sessions) takes ~150 ms.
//
// The service this provides is deliberately garbage-collection shaped, because
// DSH itself does none:
//   - session logs accumulate forever and are never deleted by the harness
//     (`dsh-session-persistence-jsonl`: "Nothing deletes session files … the seam
//     has no deletion API"; "archive" only hides a session in the UI)
//   - attachments are never collected, including objects no session references
//
// @module dsh-changelog-panel/tools/storage

import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { homedir, platform } from 'node:os'
import { execFile, execFileSync } from 'node:child_process'

/** How long a resolved subagent id is looked up in a parent log. */
const SUBAGENT_ID_LENGTH = 8

/**
 * Cost categories, in the order the panel renders them. `reclaim` says whether
 * the category is a candidate for garbage collection at all; runtime binaries can
 * be large but deleting them breaks the harness, so they are never offered.
 */
const CATEGORIES = [
  { id: 'runtimes', reclaim: 'never' },
  { id: 'plugins', reclaim: 'some' },
  { id: 'sessions', reclaim: 'some' },
  { id: 'attachments', reclaim: 'some' },
  { id: 'browserCache', reclaim: 'all' },
  { id: 'caches', reclaim: 'all' },
  { id: 'workspace', reclaim: 'some' },
  { id: 'other', reclaim: 'never' },
]

/** Sum of file sizes under a path, and the file count. Missing paths measure 0. */
export function measure(path) {
  let bytes = 0
  let files = 0
  const walk = (current) => {
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const child = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(child)
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        try {
          // lstat through statSync on a symlink follows it; use lstat semantics by
          // ignoring link failures, which is what a broken link produces.
          bytes += statSync(child).size
          files += 1
        } catch {
          // A file that vanished mid-scan, or an unreadable link: not a failure of
          // the measurement, just one entry we could not size.
        }
      }
    }
  }
  walk(path)
  return { bytes, files }
}

/** Direct children of a directory with their measured size, largest first. */
export function childSizes(path) {
  let entries
  try {
    entries = readdirSync(path, { withFileTypes: true })
  } catch {
    return []
  }
  const rows = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const child = join(path, entry.name)
    const measured = measure(child)
    rows.push({ name: entry.name, path: child, bytes: measured.bytes, files: measured.files })
  }
  return rows.sort((a, b) => b.bytes - a.bytes)
}

/** Read a JSON file, or null when it is absent or unreadable. */
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Read the authoritative session index.
 *
 * `storages/workspace.json` holds the workspace and archived-session ids;
 * `storages/session_projcache/sessions/<id>.json` holds each session's real `cwd`,
 * its title, and its stats. Using `cwd` matters: the on-disk workspace directory
 * name encodes the path by replacing both `/` and `-` with `-`, which cannot be
 * reversed reliably, so the projection is the only accurate source.
 */
export function readSessionIndex(home) {
  const storages = join(home, 'storages')
  const workspaceDoc = readJson(join(storages, 'workspace.json')) || {}
  const globalDoc = workspaceDoc.global || {}
  const archived = new Set(globalDoc.archivedSessionIds || [])
  const pinned = new Set(globalDoc.pinnedSessionIds || [])
  const cacheDir = join(storages, 'session_projcache', 'sessions')
  const byId = new Map()
  let cacheEntries = []
  try {
    cacheEntries = readdirSync(cacheDir).filter((name) => name.endsWith('.json'))
  } catch {
    cacheEntries = []
  }
  for (const name of cacheEntries) {
    const id = name.slice(0, -'.json'.length)
    const doc = readJson(join(cacheDir, name))
    const record = doc && doc.record ? doc.record : null
    const identity = record && record.identity ? record.identity : {}
    const rows = record && record.rows ? record.rows : {}
    const val = (key) => (rows[key] && rows[key].val !== undefined ? rows[key].val : undefined)
    const stats = val('sessionStats') || {}
    const subagent = val('subagent') || null
    byId.set(id, {
      id,
      cwd: typeof identity.cwd === 'string' ? identity.cwd : '',
      createdAt: typeof identity.createdAt === 'number' ? identity.createdAt : null,
      title: typeof val('title') === 'string' ? val('title') : '',
      turns: typeof stats.turns === 'number' ? stats.turns : null,
      lastTurn: typeof stats.lastTurn === 'number' ? stats.lastTurn : null,
      subagentLabel: subagent && subagent.identity ? subagent.identity.label : null,
      archived: archived.has(id),
      pinned: pinned.has(id),
      projected: true,
    })
  }
  return { byId, archived, pinned, workspaceIds: globalDoc.workspaceIds || [], defaultWorkspaceId: globalDoc.defaultWorkspaceId || null }
}

/**
 * Attribute subagent sessions to the session that spawned them.
 *
 * DSH stores no parent reference: a subagent session's projection carries only its
 * own label. The parent's log does contain the child id, so the mapping is
 * recovered by looking for each subagent id inside every MAIN session log.
 *
 * Every main session is a candidate regardless of which workspace directory it
 * lives in: a subagent runs in the same workspace as its parent, but a parent's
 * own directory grouping has nothing to do with the child's, and matching only
 * within one workspace left subagents unattributed. Session logs are
 * zstd-compressed JSONL, read through the injected `decompress`.
 * @param sessionDirs - every session directory with its measured size.
 * @param decompress - `(path) => string | null` reader for one session log.
 * @returns `{ parents: Map<childId, parentId>, scanned, unresolved }`.
 */
export function mapSubagents(sessionDirs, decompress) {
  const parents = new Map()
  const mains = sessionDirs.filter((entry) => entry.id.startsWith('session-'))
  const subs = sessionDirs.filter((entry) => !entry.id.startsWith('session-'))
  let scanned = 0
  for (const main of mains) {
    if (parents.size === subs.length) break
    const text = decompress(join(main.dir, 'session.v4.jsonl.zstd'))
    if (text === null) continue
    scanned += 1
    for (const sub of subs) {
      if (parents.has(sub.id)) continue
      if (text.includes(sub.id.slice(0, SUBAGENT_ID_LENGTH))) parents.set(sub.id, main.id)
    }
  }
  return { parents, scanned, unresolved: subs.filter((sub) => !parents.has(sub.id)).map((sub) => sub.id) }
}

/** Every session directory on disk, with its measured size. */
export function readSessionDirs(home) {
  const root = join(home, 'sessions')
  const rows = []
  let workspaces = []
  try {
    workspaces = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  } catch {
    return rows
  }
  for (const workspace of workspaces) {
    const workspacePath = join(root, workspace.name)
    let sessions = []
    try {
      sessions = readdirSync(workspacePath, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    } catch {
      continue
    }
    for (const session of sessions) {
      const dir = join(workspacePath, session.name)
      const measured = measure(dir)
      let modified = null
      try {
        modified = statSync(dir).mtimeMs
      } catch {
        modified = null
      }
      rows.push({
        id: session.name,
        dir,
        workspaceDir: workspace.name,
        bytes: measured.bytes,
        files: measured.files,
        modified,
      })
    }
  }
  return rows
}

/**
 * Measure every attachment object and whether any session still references it.
 *
 * The store is content-addressed and deduplicated, and DSH never collects it —
 * including objects whose only referencing session is gone. That makes
 * "unreferenced object" the one unambiguous attachment-level reclaim signal.
 */
/** Escape a literal for use inside a RegExp alternation. */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function readAttachments(home, sessionDirs, decompress) {
  const root = join(home, 'attachments', 'v1', 'objects')
  const objects = []
  let shards = []
  try {
    shards = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  } catch {
    return { objects, orphans: [], totalBytes: 0 }
  }
  for (const shard of shards) {
    const shardPath = join(root, shard.name)
    let files = []
    try {
      files = readdirSync(shardPath, { withFileTypes: true }).filter((entry) => entry.isFile())
    } catch {
      continue
    }
    for (const file of files) {
      const path = join(shardPath, file.name)
      let bytes = 0
      let modified = null
      try {
        const info = statSync(path)
        bytes = info.size
        modified = info.mtimeMs
      } catch {
        continue
      }
      objects.push({ hash: file.name, path, bytes, modified, referenced: false })
    }
  }
  // Reference test: an object's hash appears in a session log when it is used.
  //
  // Scanned with ONE compiled alternation per session rather than one `includes`
  // per object. The obvious loop is O(sessions x objects) full-text passes, and
  // with 146 objects across 40 logs it measured 2064 ms — 90% of the whole scan,
  // which is why the panel took over two seconds to open. Matching every hash in a
  // single pass returns the same answers for roughly the cost of one transcript
  // read per session.
  const pending = new Set(objects.filter((object) => !object.referenced).map((object) => object.hash))
  const byHash = new Map()
  for (const object of objects) byHash.set(object.hash, object)
  for (const session of sessionDirs) {
    if (pending.size === 0) break
    const text = decompress(join(session.dir, 'session.v4.jsonl.zstd'), true)
    if (text === null) continue
    const pattern = new RegExp('(?:' + [...pending].map(escapeRegExp).join('|') + ')', 'g')
    let match
    while ((match = pattern.exec(text)) !== null) {
      const hash = match[0]
      const object = byHash.get(hash)
      if (object !== undefined) object.referenced = true
      pending.delete(hash)
      if (pending.size === 0) break
    }
  }
  const orphans = objects.filter((object) => !object.referenced)
  return {
    objects,
    orphans,
    totalBytes: objects.reduce((sum, object) => sum + object.bytes, 0),
    orphanBytes: orphans.reduce((sum, object) => sum + object.bytes, 0),
  }
}

/**
 * Build the whole inventory.
 *
 * `decompress` is injected so the scan can be tested without zstd, and `home` and
 * `workspace` so it can run against a fixture tree.
 * @returns the report the panel renders.
 */
/**
 * Measure a directory and its direct children's subtrees in ONE traversal.
 *
 * `measure(path)` followed by `childSizes(path)` walks the whole tree twice — once
 * for the total, once per child — which took this scan from ~570 ms to ~2400 ms for
 * five working directories. One walk that attributes each file to its top-level
 * child, plus a small pass for the files sitting directly in the root, gives the
 * same numbers for about half the syscalls.
 *
 * @param path - the directory to walk.
 * @param limit - how many children to describe.
 * @returns `{ bytes, files, children }` with children largest first.
 */
function measureTree(path, limit) {
  let bytes = 0
  let files = 0
  const children = []
  let entries
  try {
    entries = readdirSync(path, { withFileTypes: true })
  } catch {
    return { bytes: 0, files: 0, children: [] }
  }
  for (const entry of entries) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) {
      const measured = measure(child)
      bytes += measured.bytes
      files += measured.files
      children.push({ name: entry.name, path: child, bytes: measured.bytes, files: measured.files })
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      try {
        bytes += statSync(child).size
        files += 1
      } catch {
        // A file that vanished mid-scan is one unmeasured entry, not a failure.
      }
    }
  }
  children.sort((a, b) => b.bytes - a.bytes)
  return { bytes, files, children: children.slice(0, limit) }
}

/**
 * Group sessions by their working directory and measure each one.
 *
 * This answers "what did the other windows put on disk, and where". The grouping
 * key is the session's own `cwd` from the projection index — the authoritative
 * record of where a window ran — never the encoded session-directory name, which
 * cannot be decoded back (it maps both `/` and `-` to `-`).
 *
 * These directories hold the reader's own work, so nothing here is ever offered
 * for reclamation. The point is location and size, not garbage collection: an
 * earlier version of this scan covered only the newest workspace and silently left
 * four other windows — about 43 MiB of generated files and scripts — out of the
 * inventory entirely.
 *
 * @param sessions - the scanned session rows, each carrying `cwd`.
 * @param limit - how many child entries to describe per directory.
 * @returns one row per working directory, largest first.
 */
export function scanWorkdirs(sessions, limit = 12) {
  const byPath = new Map()
  for (const session of sessions) {
    const cwd = typeof session.cwd === 'string' ? session.cwd.trim() : ''
    if (cwd === '') continue
    const entry = byPath.get(cwd)
    if (entry === undefined) {
      byPath.set(cwd, { path: cwd, sessionIds: [session.id] })
    } else {
      entry.sessionIds.push(session.id)
    }
  }
  const rows = []
  let scanned = 0
  let unreadable = 0
  for (const entry of byPath.values()) {
    if (!existsSync(entry.path)) {
      unreadable += 1
      rows.push({
        path: entry.path,
        bytes: 0,
        files: 0,
        sessionCount: entry.sessionIds.length,
        sessionIds: entry.sessionIds,
        exists: false,
        children: [],
      })
      continue
    }
    const measured = measureTree(entry.path, limit)
    scanned += 1
    rows.push({
      path: entry.path,
      bytes: measured.bytes,
      files: measured.files,
      sessionCount: entry.sessionIds.length,
      sessionIds: entry.sessionIds,
      exists: true,
      children: measured.children,
    })
  }
  rows.sort((a, b) => b.bytes - a.bytes)

  // Nested working directories would otherwise be counted twice: a window opened
  // at a parent of another window's directory contains that window's files, so the
  // parent's own measure is the part that belongs to no nested window. `ownBytes`
  // is that remainder, and `contains` names the inner rows it excludes.
  for (const row of rows) {
    const nested = rows.filter(
      (other) => other !== row && other.exists && row.exists && other.path.startsWith(row.path + '/'),
    )
    row.contains = nested.map((other) => other.path)
    row.nestedBytes = nested.reduce((sum, other) => sum + other.bytes, 0)
    row.ownBytes = Math.max(0, row.bytes - row.nestedBytes)
  }
  // The headline never double-counts, so it sums each row's non-nested part.
  const ownTotal = rows.reduce((sum, row) => sum + (row.ownBytes === undefined ? row.bytes : row.ownBytes), 0)

  return { rows, scanned, unreadable, ownTotal }
}

export function scanStorage(options = {}) {
  const home = options.home || process.env.DSH_HOME || join(homedir(), '.dsh')
  const workspace = options.workspace || process.cwd()
  const appSupport = options.appSupport || join(homedir(), 'Library', 'Application Support', '@deepseek-ai', 'dsh-desktop')
  const decompress = options.decompress || defaultDecompress
  const startedAt = Date.now()

  const runtimesPath = join(home, 'dsh-runtimes')
  const profilesPath = join(home, 'profiles')
  const sessionsPath = join(home, 'sessions')
  const attachmentsPath = join(home, 'attachments')

  const runtimes = { bytes: 0, files: 0, children: [] }
  const runtimeMeasured = measure(runtimesPath)
  const runtimeDeps = join(runtimesPath, 'dsh-primary-runtime', 'dependencies')
  runtimes.bytes = runtimeMeasured.bytes
  runtimes.files = runtimeMeasured.files
  runtimes.children = childSizes(runtimeDeps)

  const activeProfile = options.activeProfile || process.env.DSH_PROFILE || ''
  // Evidence, not a guess. An earlier rule ("not active and declares no bundles")
  // missed the profile the user actually wanted reclaimed, because a copied test
  // profile still declares its bundles. These three signals are checkable facts:
  //   - whether a session ever ran under it (the session directories are derived
  //     from the workspace path, not the profile, so activity is read from the
  //     profile's own session_locks below)
  //   - whether the desktop host ever activated it (`.plugin-manager`)
  //   - whether its name marks it as a test copy
  const TEST_PROFILE_PATTERN = /(?:^|[-_])(test|tmp|temp|copy|bak|backup|try|scratch|experiment)(?:$|[-_])/i
  const profileRows = childSizes(profilesPath).map((row) => {
    const manifest = readJson(join(row.path, 'package.json')) || {}
    const bundles = (manifest.dsh && manifest.dsh.profile && manifest.dsh.profile.bundles) || []
    const name = basename(row.path)
    let manifestMtime = null
    try {
      manifestMtime = statSync(join(row.path, 'package.json')).mtimeMs
    } catch {
      manifestMtime = null
    }
    return {
      ...row,
      name,
      bundles,
      isActive: name === activeProfile,
      namedLikeTest: TEST_PROFILE_PATTERN.test(name),
      hasPluginManagerState: existsSync(join(row.path, '.plugin-manager')),
      manifestMtime,
    }
  })

  const sessionDirs = readSessionDirs(home)
  const index = readSessionIndex(home)
  const mapping = mapSubagents(sessionDirs, decompress)
  const attachments = readAttachments(home, sessionDirs, decompress)

  const sessions = sessionDirs.map((row) => {
    const meta = index.byId.get(row.id) || {}
    const isSubagent = !row.id.startsWith('session-')
    const parentId = mapping.parents.get(row.id) || null
    return {
      id: row.id,
      dir: row.dir,
      bytes: row.bytes,
      modified: row.modified,
      isSubagent,
      parentId,
      parent: parentId ? index.byId.get(parentId) || null : null,
      cwd: meta.cwd || '',
      title: meta.title || '',
      turns: meta.turns === undefined ? null : meta.turns,
      archived: meta.archived === true,
      pinned: meta.pinned === true,
      projected: meta.projected === true,
      subagentLabel: meta.subagentLabel || null,
    }
  })

  const browserMeasured = measure(appSupport)
  const browserChildren = childSizes(appSupport)

  const cacheMeasured = measure(join(home, 'cache'))
  const storagesMeasured = measure(join(home, 'storages'))
  const workspaceSizes = childSizes(workspace).slice(0, 12)

  // Every window, not just the newest workspace. Reported alongside the totals
  // rather than inside `grandTotal`: these are the reader's own project files, so
  // adding them would inflate "space DSH occupies" with work DSH merely wrote.
  const workdirScan = scanWorkdirs(sessions)
  const workdirs = {
    rows: workdirScan.rows,
    scanned: workdirScan.scanned,
    unreadable: workdirScan.unreadable,
    // `totalBytes` is the naive sum (nested content counted twice); `ownBytes` is
    // the honest one. The panel shows `ownBytes` and labels the nested remainder.
    totalBytes: workdirScan.rows.reduce((sum, row) => sum + row.bytes, 0),
    ownBytes: workdirScan.ownTotal,
  }

  const totals = {
    runtimes: runtimes.bytes,
    plugins: profileRows.reduce((sum, row) => sum + row.bytes, 0),
    sessions: sessions.reduce((sum, row) => sum + row.bytes, 0),
    attachments: attachments.totalBytes,
    browserCache: browserMeasured.bytes,
    caches: cacheMeasured.bytes + storagesMeasured.bytes,
    workspace: workspaceSizes.reduce((sum, row) => sum + row.bytes, 0),
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    scanMs: Date.now() - startedAt,
    host: { home, workspace, appSupport, platform: platform() },
    totals,
    grandTotal: totals.runtimes + totals.plugins + totals.sessions + totals.attachments + totals.browserCache + totals.caches + totals.workspace,
    categories: CATEGORIES,
    runtimes,
    profiles: profileRows,
    sessions,
    subagents: { mapped: mapping.parents.size, scanned: mapping.scanned, unresolved: mapping.unresolved },
    attachments: {
      totalBytes: attachments.totalBytes,
      // `bytes` mirrors `totalBytes`: the panel reads `bytes`, and a missing key there
      // rendered as NaN in the attachments row for three revisions.
      bytes: attachments.totalBytes,
      orphanBytes: attachments.orphanBytes,
      count: attachments.objects.length,
      orphanCount: attachments.orphans.length,
      orphans: attachments.orphans.map((object) => ({ hash: object.hash, path: object.path, bytes: object.bytes })),
    },
    browserCache: { bytes: browserMeasured.bytes, files: browserMeasured.files, children: browserChildren },
    caches: { bytes: cacheMeasured.bytes + storagesMeasured.bytes, breakdown: { cache: cacheMeasured.bytes, storages: storagesMeasured.bytes } },
    workspace: { path: workspace, children: workspaceSizes },
    workdirs,
  }
}

/**
 * Decompress one session log.
 *
 * `zstd` is preferred and `python3`'s standard library is not an option (it has no
 * zstd module), so a missing CLI is reported as a null read rather than an error:
 * the scan degrades to "could not attribute subagents" and says so.
 * @param path - the `.zstd` file.
 * @param quiet - suppress the warning for the repeated attachment pass.
 * @returns the log text, or null.
 */
export function defaultDecompress(path, quiet) {
  if (!existsSync(path)) return null
  try {
    return execFileSync('zstd', ['-d', '-c', path], { maxBuffer: 512 * 1024 * 1024 }).toString('utf8')
  } catch {
    if (!quiet) warnOnce('zstd CLI unavailable; subagent attribution and attachment reference checks are skipped')
    return null
  }
}

const warned = new Set()
function warnOnce(message) {
  if (warned.has(message)) return
  warned.add(message)
  console.warn('[storage] ' + message)
}

/** Candidate cleanup items, each with the reason it is safe. */
export function planCleanup(report, options = {}) {
  const items = []
  for (const profile of report.profiles || []) {
    if (profile.isActive) continue
    // Offered, never assumed: a whole profile holds the reader's plugin set, so the
    // panel describes why it looks unused and lets the human decide.
    const signals = []
    if (profile.namedLikeTest) signals.push('name reads as a test copy')
    if (profile.bundles.length > 0) signals.push(profile.bundles.length + ' bundles declared')
    if (!profile.hasPluginManagerState) signals.push('never activated by the host')
    if (typeof profile.manifestMtime === 'number') signals.push('manifest last changed ' + new Date(profile.manifestMtime).toISOString().slice(0, 10))
    items.push({
      id: 'profile:' + profile.name,
      kind: 'profile',
      path: profile.path,
      bytes: profile.bytes,
      confidence: profile.namedLikeTest ? 'high' : 'low',
      reason: signals.join('; '),
      needsConfirmation: true,
    })
  }
  if (report.browserCache && report.browserCache.bytes > 0) {
    items.push({
      id: 'browser-cache',
      kind: 'browserCache',
      path: report.host.appSupport,
      bytes: report.browserCache.bytes,
      confidence: 'high',
      reason: 'Chromium cache and GPUCache are regenerated on demand',
    })
  }
  for (const orphan of report.attachments.orphans || []) {
    items.push({
      id: 'attachment:' + orphan.hash.slice(0, 12),
      kind: 'attachment',
      path: orphan.path,
      bytes: orphan.bytes,
      confidence: 'medium',
      reason: 'no session log references this object',
    })
  }
  const minBytes = typeof options.sessionMinBytes === 'number' ? options.sessionMinBytes : 0
  const archived = (report.sessions || []).filter(
    (session) => session.archived && !session.isSubagent && session.bytes >= minBytes,
  )
  for (const session of archived) {
    items.push({
      id: 'session:' + session.id,
      kind: 'session',
      path: session.dir,
      bytes: session.bytes,
      confidence: 'medium',
      reason: 'archived session; its log stays on disk because DSH never deletes it',
      title: session.title,
    })
  }
  const byKind = items.reduce((acc, item) => {
    acc[item.kind] = (acc[item.kind] || 0) + item.bytes
    return acc
  }, {})
  return { items, bytes: items.reduce((sum, item) => sum + item.bytes, 0), byKind }
}

/**
 * Move paths to the OS trash.
 *
 * Trash rather than unlink is the whole safety story: every action is reversible
 * from Finder, and nothing here can destroy data the reader cannot get back. The
 * service refuses anything outside the roots it measured, so a malformed plan
 * cannot reach an unrelated path.
 * @param paths - absolute paths to move.
 * @param options - `{ roots, timeoutMs }`.
 * @returns `{ moved, failed, skipped }`.
 */
export function trashPaths(paths, options = {}) {
  const roots = (options.roots || []).filter((root) => typeof root === 'string' && root !== '')
  const moved = []
  const failed = []
  const skipped = []
  for (const path of paths) {
    if (typeof path !== 'string' || path === '') {
      skipped.push({ path: String(path), reason: 'empty path' })
      continue
    }
    const allowed = roots.length === 0 || roots.some((root) => path === root || path.startsWith(root + '/'))
    if (!allowed) {
      skipped.push({ path, reason: 'outside the scanned roots' })
      continue
    }
    if (!existsSync(path)) {
      skipped.push({ path, reason: 'already gone' })
      continue
    }
    moved.push(path)
  }
  return new Promise((resolve) => {
    if (moved.length === 0) {
      resolve({ moved: [], failed, skipped })
      return
    }
    // One Finder call per batch: the scripting bridge is the slow part, and a
    // batch keeps a many-item cleanup to a single round trip.
    const lines = moved.map((path) => `delete POSIX file ${JSON.stringify(path)}`).join('\n')
    execFile(
      'osascript',
      ['-e', `tell application "Finder"\n${lines}\nend tell`],
      { timeout: options.timeoutMs || 120000 },
      (error, stdout, stderr) => {
        if (error) {
          failed.push({ paths: moved, reason: String(stderr || error.message).trim() })
          resolve({ moved: [], failed, skipped })
          return
        }
        resolve({ moved, failed, skipped, output: String(stdout).trim() })
      },
    )
  })
}

export { CATEGORIES }
