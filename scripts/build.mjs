// Build script: assembles the self-contained browser bundle `lib/client.js`.
//
// The dsh browser module system consumes a built `lib/client.js` per plugin and
// never compiles sources at runtime, so this script does the one transformation
// that is unavoidable: concatenate the data modules and the client source into a
// single lazy-CJS factory in the exact wrapper every shipped plugin bundle uses.
//
// Deterministic: no timestamps, no environment reads. Re-run before install.

import { readFileSync, writeFileSync, existsSync, openSync, readSync, closeSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { detectInstalledVersion as detectAppVersion } from '../lib/app-version.js'

const here = dirname(fileURLToPath(import.meta.url))
const pluginDir = join(here, '..')
const sourceDir = join(pluginDir, 'src')
const outFile = join(pluginDir, 'lib', 'client.js')

// `--data-dir <path>` lets the pipeline be verified before (or independently of)
// the authored dataset; without it the shipped dataset is used.
const dataDirArg = process.argv.indexOf('--data-dir')
const dataDir = dataDirArg === -1 ? join(sourceDir, 'data') : process.argv[dataDirArg + 1]
if (dataDirArg !== -1 && !dataDir) throw new Error('--data-dir needs a path')

/** Plugin id: one string, used by the bundle wrapper and the manifest alike. */
const PLUGIN_ID = 'dsh-changelog-panel'

/**
 * Version of the DSH build this bundle's data is about. The client manifest
 * carries no custom fields, so the value is baked in at build time instead of
 * read from the host.
 *
 * Detection order: `--installed-version <v>` → the packaged Electron app's asar
 * index (authoritative for this installation) → `unknown`. Override the app
 * location with `$DSH_APP_ASAR`.
 */
/**
 * The version to bake into the bundle as a fallback.
 *
 * Delegates to the host module so the build and the running app agree on how the
 * number is read. The bake is only a fallback now: the panel prefers the version
 * the host writes into its runtime report, because a baked number goes stale as
 * soon as the app is upgraded.
 * @returns the detected version, or 'unknown'.
 */
function detectInstalledVersion() {
  const flag = process.argv.indexOf('--installed-version')
  if (flag !== -1) {
    const value = process.argv[flag + 1]
    if (!value) throw new Error('--installed-version needs a value')
    return value
  }
  return detectAppVersion() || 'unknown'
}

const INSTALLED_VERSION = detectInstalledVersion()

/**
 * Data modules are inlined in this order; they must not import anything.
 *
 * `text.mjs` holds the `L()` helper that builds every localized string pair, so
 * it comes first and the rest of the modules call it without importing it.
 * It is optional while a dataset is still written against revision 1.
 */
const DATA_MODULES = ['text.mjs', 'releases.mjs', 'features.mjs', 'advisories.mjs', 'sources.mjs']
/** Modules whose absence is tolerated (the pre-revision-2 dataset). */
const OPTIONAL_MODULES = new Set(['text.mjs'])

const banner = (name) => `\t\t// ── ${name} ${'─'.repeat(Math.max(1, 58 - name.length))}`

function readSource(file) {
  const path = join(sourceDir, file)
  if (!existsSync(path)) throw new Error(`missing source file: ${path}`)
  return readFileSync(path, 'utf8')
}

/** Data modules come from the selected data dir; the client source from src/client. */
const readData = (file) => {
  const path = join(dataDir, file)
  if (!existsSync(path)) {
    if (OPTIONAL_MODULES.has(file)) return null
    throw new Error(`missing data module: ${path} (data dir: ${dataDir})`)
  }
  return readFileSync(path, 'utf8')
}

/**
 * Strip the top-level ESM import/export syntax a shared module file needs to be
 * loadable standalone. Named exports are collected into a module export map, so
 * the built bundle still exposes the same public surface to the module system.
 * @param text - module source.
 * @param file - file name, for error messages.
 * @returns the stripped source and the exported binding names.
 */
function stripModuleSyntax(text, file) {
  const exported = new Set()
  let out = text.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
  out = out.replace(/^export\s+default\s+/gm, 'const __default__ = ')
  out = out.replace(/^export\s+\{([^}]*)\}\s*;?\s*$/gm, (_match, names) => {
    for (const raw of names.split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop()
      if (name) exported.add(name)
    }
    return ''
  })
  out = out.replace(/^export\s+(const|let|var|function|class)\s+([A-Za-z0-9_$]+)/gm, (_match, kind, name) => {
    exported.add(name)
    return `${kind} ${name}`
  })
  if (/^\s*(import|export)\s/m.test(out)) {
    const line = out.split('\n').find((l) => /^\s*(import|export)\s/.test(l))
    throw new Error(`${file}: unhandled module syntax (data modules must be import-free): ${line.trim()}`)
  }
  return { code: out.trim(), exported: [...exported] }
}

const dataBlocks = DATA_MODULES.flatMap((file) => {
  const text = readData(file)
  return text === null ? [] : [[file, stripModuleSyntax(text, file).code]]
})
/**
 * Client source files, concatenated in order. `live-data.mjs` defines the live
 * fetching and parsing helpers that `index.mjs` renders, so it comes first.
 */
const CLIENT_SOURCES = [
  'client/live-data.mjs',
  'client/fetched.mjs',
  'client/storage-panel.mjs',
  'client/storage-client.mjs',
  'client/index.mjs',
]
const clientBlocks = CLIENT_SOURCES.map((file) => [file, stripModuleSyntax(readSource(file), file)])
const clientExports = [...new Set(clientBlocks.flatMap(([, block]) => block.exported))]

/**
 * Fail the build on a top-level name declared by more than one client source.
 *
 * The sources are concatenated into ONE scope, where a duplicate `function` or
 * `const` is either a redeclaration error or — for a function — a silent override
 * of the earlier definition. A real collision (`describeFailure` in both
 * live-data.mjs and storage-client.mjs) shipped undetected because nothing here
 * checked, and it quietly broke the live changelog's rate-limit message.
 */
function assertNoClientCollisions(blocks) {
  const owners = new Map()
  const declaration = /^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm
  for (const [file, block] of blocks) {
    for (const match of block.code.matchAll(declaration)) {
      const name = match[1]
      if (owners.has(name)) {
        throw new Error(
          `client source name collision: "${name}" is declared in both ${owners.get(name)} and ${file}. ` +
            'They share one bundle scope, so rename one of them.',
        )
      }
      owners.set(name, file)
    }
  }
}
assertNoClientCollisions(clientBlocks)

const body = [
  '// @generated by scripts/build.mjs — do not edit lib/client.js by hand.',
  '// Source of truth: src/client/index.mjs and src/data/*.mjs',
  '',
  'window.__ModuleLoader__.load({',
  `\tid: ${JSON.stringify(PLUGIN_ID)},`,
  '\tfactory: (require) => {',
  '\t\tvar module = { exports: {} };',
  '\t\tvar exports = module.exports;',
  '\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
  '\t\tconst React = require("react");',
  `\t\tconst INSTALLED_VERSION = ${JSON.stringify(INSTALLED_VERSION)};`,
  '',
  ...dataBlocks.flatMap(([file, text]) => [banner(file), text, '']),
  ...clientBlocks.flatMap(([file, block]) => [banner(file), block.code, '']),
  '// public surface of the plugin bundle',
  ...clientExports.map((name) => `\t\texports.${name} = ${name};`),
  '',
  '\t\treturn module.exports;',
  '\t}',
  '});',
  '',
].join('\n')

writeFileSync(outFile, body, 'utf8')

const lines = body.split('\n').length
const bytes = Buffer.byteLength(body, 'utf8')
console.log(`built ${outFile}`)
console.log(`  data dir: ${dataDir}`)
console.log(`  installed DSH version baked in: ${INSTALLED_VERSION}`)
console.log(`  ${DATA_MODULES.length} data modules + client source → ${lines} lines, ${bytes} bytes`)
