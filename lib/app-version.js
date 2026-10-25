// The DSH version this process is actually running.
//
// This has to be resolved at RUNTIME, not baked into the shipped bundle. An
// earlier version baked the number in at build time (reading app.asar while
// building), which meant that after the user upgraded the app the changelog panel
// kept showing the version it was built against — the exact drift this module
// exists to prevent.
//
// The running app carries its own version inside `app.asar`, which is not a
// directory: it is a single file whose first bytes are a header describing a JSON
// directory tree, with file bodies at recorded offsets. Reading it therefore needs
// the small parser below rather than `readFile`. The parser is shared with the
// build script, which still uses it to bake a fallback for standalone bundles.

import { closeSync, existsSync, openSync, readFileSync, readSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Package whose version identifies a DSH installation. */
const VERSION_PACKAGE = '@deepseek-ai/dsh-base'
/** macOS install location used when the process exposes no resources path. */
const DEFAULT_ASAR = '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar'
/** Sanity cap on the asar directory header, so a corrupt file cannot allocate wildly. */
const MAX_HEADER_BYTES = 64 * 1024 * 1024

/**
 * Candidate locations of the running app's `app.asar`, best first.
 *
 * `process.resourcesPath` and `process.execPath` are populated by Electron in the
 * main process, which is where the host half runs; the environment override and the
 * well-known path cover a plain Node process and unusual installs.
 * @returns distinct absolute paths, best first.
 */
function candidateAsarPaths() {
  const candidates = []
  const override = process.env && process.env.DSH_APP_ASAR
  if (typeof override === 'string' && override !== '') candidates.push(override)
  if (typeof process.resourcesPath === 'string' && process.resourcesPath !== '') {
    candidates.push(join(process.resourcesPath, 'app.asar'))
  }
  if (typeof process.execPath === 'string' && process.execPath !== '') {
    // .../Contents/MacOS/DeepSeek Harness → .../Contents/Resources/app.asar
    candidates.push(join(dirname(process.execPath), '..', 'Resources', 'app.asar'))
  }
  candidates.push(DEFAULT_ASAR)
  return [...new Set(candidates)]
}

/**
 * Candidate `Info.plist` paths for the running app bundle, best first.
 *
 * The plist is a real file OUTSIDE `app.asar`. That matters: inside Electron the
 * asar layer treats the archive as a directory, so `openSync` on it fails and the
 * archive route returns nothing (it did — the shipped report read
 * `dshVersion: "unknown"`). The bundle plist carries `CFBundleShortVersionString`,
 * which on this app equals the `@deepseek-ai/dsh-base` version.
 * @returns distinct absolute paths, best first.
 */
function candidateInfoPlists() {
  const candidates = []
  const override = process.env && process.env.DSH_APP_INFO_PLIST
  if (typeof override === 'string' && override !== '') candidates.push(override)
  if (typeof process.resourcesPath === 'string' && process.resourcesPath !== '') {
    // .../Contents/Resources → .../Contents/Info.plist
    candidates.push(join(dirname(process.resourcesPath), 'Info.plist'))
  }
  if (typeof process.execPath === 'string' && process.execPath !== '') {
    // .../Contents/MacOS/DeepSeek Harness → .../Contents/Info.plist
    candidates.push(join(dirname(process.execPath), '..', 'Info.plist'))
  }
  candidates.push('/Applications/DeepSeek Harness.app/Contents/Info.plist')
  return [...new Set(candidates)]
}

/**
 * Read `CFBundleShortVersionString` out of a plist.
 * @param plistPath - absolute path to `Info.plist`.
 * @returns the version, or null.
 */
function versionFromInfoPlist(plistPath) {
  try {
    if (!existsSync(plistPath)) return null
    const text = readFileSync(plistPath, 'utf8')
    const match = /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(text)
    if (match === null) return null
    const value = match[1].trim()
    return value === '' ? null : value
  } catch {
    return null
  }
}

/**
 * Parse the first JSON object in `text`, ignoring a leading guard byte.
 *
 * dsh package manifests carry a leading `;` (or a BOM) before the manifest, so a
 * plain `JSON.parse` on the raw body fails.
 * @param text - decoded file chunk.
 * @returns the parsed object, or null when no JSON object is present.
 */
function extractJsonAt(text) {
  const start = text.search(/\{/)
  if (start === -1) return null
  const end = rawValueEnd(text, start)
  if (end === null) return null
  try {
    return JSON.parse(text.slice(start, end))
  } catch {
    return null
  }
}

/**
 * Offset just past the JSON value starting at `from`.
 * @param text - the source text.
 * @param from - index of the opening brace.
 * @returns the exclusive end offset, or null when the value never closes.
 */
function rawValueEnd(text, from) {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = from; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{' || char === '[') depth += 1
    else if (char === '}' || char === ']') {
      depth -= 1
      if (depth === 0) return index + 1
    }
  }
  return null
}

/**
 * Read one file entry out of an asar archive.
 *
 * Layout: `[u32 prefix][u32 pickleSize][u32 headerSize][u32 jsonSize][json…]` with
 * the JSON starting at byte 16 and file bodies after it. The padding between the
 * JSON and the data section is not documented consistently, so the recorded
 * `offset` is used and the read is bounded past the entry.
 * @param asarPath - path to the `.asar` file.
 * @param segments - path segments inside the archive.
 * @returns the entry text, or null.
 */
function readAsarEntry(asarPath, segments) {
  // Electron patches `fs` so a path ending in `.asar` is treated as a DIRECTORY;
  // `openSync` on the archive itself then throws "ENOENT, not found in <archive>".
  // This call therefore sits inside the try (an earlier version had it outside,
  // and the throw became the whole report's failure), and `process.noAsar` asks
  // Electron to hand back the real file for the duration of the open.
  let previousNoAsar
  let fd = null
  try {
    if (!existsSync(asarPath)) return null
    if (typeof process.noAsar === 'boolean') {
      previousNoAsar = process.noAsar
      process.noAsar = true
    }
    fd = openSync(asarPath, 'r')
    const header = Buffer.alloc(16)
    if (readSync(fd, header, 0, 16, 0) !== 16) return null
    const jsonSize = header.readUInt32LE(12)
    if (!(jsonSize > 0 && jsonSize < MAX_HEADER_BYTES)) return null
    const index = Buffer.alloc(jsonSize)
    if (readSync(fd, index, 0, jsonSize, 16) !== jsonSize) return null
    let node = JSON.parse(index.toString('utf8'))
    for (const key of segments) {
      node = node && node.files ? node.files[key] : null
      if (!node) return null
    }
    const dataBase = 16 + jsonSize + Number(node.offset)
    // Read past the entry so the buffer can never truncate the JSON.
    const size = Number(node.size) + 4096
    const body = Buffer.alloc(size)
    const read = readSync(fd, body, 0, size, dataBase)
    if (read <= 0) return null
    return body.subarray(0, read).toString('utf8')
  } catch {
    return null
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd)
      } catch {
        // Closing a descriptor that never opened is not a failure worth raising.
      }
    }
    if (previousNoAsar !== undefined) process.noAsar = previousNoAsar
  }
}

/**
 * The running DSH version, read from the app this process belongs to.
 *
 * Prefers the `@deepseek-ai/dsh-base` manifest, which is the version every release
 * note and every registry comparison is expressed in; falls back to the app's own
 * top-level manifest so a layout change does not silently report "unknown".
 * @param asarPaths - candidate archives; injectable so the failure path is testable.
 * @param plistPaths - candidate bundle plists; injectable for the same reason.
 * @returns a version string, or null when the app cannot be read.
 */
export function detectInstalledVersion(asarPaths = candidateAsarPaths(), plistPaths = candidateInfoPlists()) {
  // Detection is diagnostics: it may return null, but it must never throw. A throw
  // here once aborted the entire storage report, turning the panel's data into an
  // error envelope because a version lookup failed.
  try {
    // 1. The bundle plist: a real file Electron's asar layer cannot shadow.
    for (const plistPath of plistPaths) {
      const value = versionFromInfoPlist(plistPath)
      if (value !== null) return value
    }
    // 2. The asar manifest: exact for a plain Node process, and a second chance for
    //    an Electron build whose plist is missing.
    for (const asarPath of asarPaths) {
      const base = readAsarEntry(asarPath, ['dsh', 'node_modules', '@deepseek-ai', 'dsh-base', 'package.json'])
      if (base !== null) {
        const manifest = extractJsonAt(base)
        if (manifest && manifest.name === VERSION_PACKAGE && typeof manifest.version === 'string') {
          return manifest.version
        }
      }
      const app = readAsarEntry(asarPath, ['package.json'])
      if (app !== null) {
        const manifest = extractJsonAt(app)
        if (manifest && typeof manifest.version === 'string' && manifest.version !== '') return manifest.version
      }
    }
  } catch {
    return null
  }
  return null
}

/**
 * The asar path a detection would use, for diagnostics.
 * @returns candidate paths, best first.
 */
export function asarCandidates() {
  return candidateAsarPaths()
}

/**
 * The plist paths a detection would use, for diagnostics.
 * @returns candidate paths, best first.
 */
export function infoPlistCandidates() {
  return candidateInfoPlists()
}
