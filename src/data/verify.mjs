// verify.mjs — dataset integrity check for plugin/src/data/*.mjs
//
// Run: node plugin/src/data/verify.mjs                        (coverage reported, strict off)
//      DSHCL_STRICT_ZH=1 node plugin/src/data/verify.mjs      (every pair must have Chinese)
//      node plugin/src/data/verify.mjs --print-en-hash        (recompute the English corpus hash)
//
// Schema revision 2: reader-facing prose is a frozen { en, zh } pair produced by
// L() in text.mjs. This verifier checks, without any network access:
//   * module shape — text.mjs plus the four data modules are plain import-free
//     ESM and every export is a frozen array/object;
//   * localization — every bilingual field is an L() pair, no bilingual field is
//     still a plain string, no pair has an empty English side, every version /
//     CVE / GHSA / package identifier in the English appears verbatim in the
//     Chinese, and (under DSHCL_STRICT_ZH=1) every pair carries Chinese;
//   * schema — required fields, types, enums, ISO dates, no unknown keys;
//   * ids — unique in FEATURES, ADVISORIES and SOURCES, unique per row;
//   * citations — >=1 http(s) reference per advisory, every reference URL
//     present in SOURCES, no dead SOURCES entry;
//   * version consistency — FEATURES versions exist in RELEASES, exactly one
//     highlighted release equal to the installed build, channel matches the
//     version suffix, RELEASES dates match the npm registry facts;
//   * range honesty — `appliesToInstalled` agrees with the published ranges
//     (the two dependency hits are inside their ranges; every harness version
//     named by a "no" row is below the installed build);
//   * coverage — counts in ADVISORY_COVERAGE match the arrays they describe;
//   * English integrity — the ordered English corpus hashes to the constant
//     recorded below, so the localization pass provably did not alter one
//     character of English. If you intentionally edit English prose, re-run
//     `node plugin/src/data/verify.mjs --print-en-hash` and paste the new value;
//   * grounding — when the extracted install is present, every FEATURES package
//     exists, its manifest version matches the row version, and `source` equals
//     the owning package's `repository.directory` + /README.md.
//
// Exits 1 on any failure, after printing every failure.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'

const HERE = dirname(fileURLToPath(import.meta.url))

// ── the installed build and the grounding tree ─────────────────────────────
const INSTALLED_VERSION = '0.2.0-rc.2'
const GROUNDING_ROOT = '/tmp/dshx/root/node_modules/@deepseek-ai'
const grounding = existsSync(GROUNDING_ROOT)

// ── localization gates ─────────────────────────────────────────────────────
const STRICT_ZH = process.env.DSHCL_STRICT_ZH === '1' || process.env.DSHCL_STRICT_ZH === 'true'
const PRINT_EN_HASH = process.argv.includes('--print-en-hash')
/** SHA-256 of the ordered English corpus (see the header note to refresh it). */
const EN_CORPUS_SHA256 = '59fe4aa29fd9b0b4555289a25ad8e80d95450b8d28d7a2ea92055ab86e4f6e2e'

// ── tiny check harness ─────────────────────────────────────────────────────
const failures = []
const strictZhFailures = []
let passed = 0
let currentGroup = '(none)'

function group(title) {
  currentGroup = title
  console.log(`\n── ${title}`)
}

function ok(message) {
  passed += 1
  console.log(`   ✓ ${message}`)
}

function check(message, condition, detail) {
  if (condition) {
    ok(message)
  } else {
    failures.push(detail ? `${currentGroup}: ${message} — ${detail}` : `${currentGroup}: ${message}`)
    console.log(`   ✗ ${message}${detail ? ` — ${detail}` : ''}`)
  }
}

const isString = (v) => typeof v === 'string' && v.length > 0
const isArray = Array.isArray
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// ── bilingual pair helpers ─────────────────────────────────────────────────
const isPair = (v) => isPlainObject(v) && typeof v.en === 'string' && typeof v.zh === 'string'

const translation = new Map() // module → { pairs, translated, missing, plain }
function translationFor(moduleName) {
  if (!translation.has(moduleName)) {
    translation.set(moduleName, { pairs: 0, translated: 0, missing: 0, plain: 0 })
  }
  return translation.get(moduleName)
}

/** English text of a bilingual field, for downstream range/text checks. */
const en = (value) => (isPair(value) ? value.en : typeof value === 'string' ? value : '')

const enCorpus = []
/** Identifiers that PLAN §4 rule 1 says are never translated. */
function identifierTokens(text) {
  const re =
    /(@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|CVE-\d{4}-\d{4,}|GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}|https?:\/\/[^\s)]+|\d+\.\d+\.\d+(?:-[a-z]+\.\d+)?)/gi
  return [...new Set(text.match(re) || [])]
}

/**
 * Validate one bilingual field: it must be an L() pair (frozen { en, zh }), have
 * a non-empty English side, keep every identifier in the Chinese, and — under
 * the strict gate — carry Chinese. Returns the English text.
 */
function bilingual(moduleName, where, value) {
  const stats = translationFor(moduleName)
  if (typeof value === 'string') {
    stats.plain += 1
    check(
      `${where}: bilingual field is an L('en','zh') pair`,
      false,
      `still a plain string (${JSON.stringify(value.slice(0, 40))}…)`,
    )
    return value
  }
  if (!isPair(value)) {
    check(`${where}: bilingual field is an L('en','zh') pair`, false, `got ${JSON.stringify(value)}`)
    return ''
  }
  stats.pairs += 1
  enCorpus.push(`${moduleName}\u0000${where}\u0000${value.en}`)
  check(`${where}: pair is frozen (built with L)`, Object.isFrozen(value), 'hand-built object')
  check(`${where}: English side is non-empty`, value.en.length > 0)
  if (value.zh.trim() === '') {
    stats.missing += 1
    if (STRICT_ZH) strictZhFailures.push(`${where}: no Chinese translation`)
  } else {
    stats.translated += 1
  }
  for (const token of identifierTokens(value.en)) {
    check(
      `${where}: Chinese keeps identifier ${token}`,
      value.zh.includes(token),
      `zh=${JSON.stringify(value.zh.slice(0, 80))}…`,
    )
  }
  return value.en
}

// ── semver comparison (enough for x.y.z / x.y.z-tag.n) ─────────────────────
function parseVersion(text) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.(\d+))?$/.exec(String(text).trim())
  if (!m) return null
  return { major: +m[1], minor: +m[2], patch: +m[3], tag: m[4] || '', tagNo: m[5] === undefined ? -1 : +m[5] }
}

function compareVersions(a, b) {
  const x = parseVersion(a)
  const y = parseVersion(b)
  if (!x || !y) return NaN
  for (const key of ['major', 'minor', 'patch']) {
    if (x[key] !== y[key]) return x[key] < y[key] ? -1 : 1
  }
  if (x.tag === y.tag) return x.tagNo === y.tagNo ? 0 : x.tagNo < y.tagNo ? -1 : 1
  if (x.tag === '') return 1
  if (y.tag === '') return -1
  const rank = { alpha: 0, beta: 1, rc: 2 }
  const rx = rank[x.tag] ?? 9
  const ry = rank[y.tag] ?? 9
  return rx === ry ? 0 : rx < ry ? -1 : 1
}

// ── load the dataset ───────────────────────────────────────────────────────
// text.mjs must be in scope for the data modules, exactly as the build inlines
// it ahead of them; importing it and exposing L as a global reproduces that.
const DATA_FILES = ['text.mjs', 'releases.mjs', 'features.mjs', 'advisories.mjs', 'sources.mjs']
console.log('DSH changelog dataset verification (schema revision 2)')
console.log(`  data dir   ${HERE}`)
console.log(`  grounding  ${grounding ? GROUNDING_ROOT : '(absent — tree cross-checks skipped)'}`)
console.log(`  strict zh  ${STRICT_ZH ? 'ON (every pair must carry Chinese)' : 'off (set DSHCL_STRICT_ZH=1 to enforce)'}`)

const modules = {}
const rawText = {}
for (const file of DATA_FILES) {
  const path = join(HERE, file)
  if (!existsSync(path)) {
    failures.push(`module: ${file} is missing`)
    console.log(`   ✗ ${file} is missing`)
    continue
  }
  rawText[file] = readFileSync(path, 'utf8')
  if (file === 'text.mjs') {
    const textModule = await import(pathToFileURL(path).href)
    if (typeof textModule.L !== 'function') {
      failures.push('text.mjs must export the L(en, zh) helper')
      console.log('   ✗ text.mjs does not export L')
      continue
    }
    globalThis.L = textModule.L
  }
  modules[file] = await import(pathToFileURL(path).href)
}

group('module shape (plain import-free ESM, frozen exports)')
const EXPECTED_EXPORTS = {
  'text.mjs': ['L'],
  'releases.mjs': ['RELEASES'],
  'features.mjs': ['FEATURES'],
  'advisories.mjs': ['ADVISORIES', 'ADVISORY_COVERAGE'],
  'sources.mjs': ['SOURCES'],
}
const ALLOWED_EXPORT =
  /^export (?:const|function) (?:L|RELEASES|FEATURES|ADVISORIES|ADVISORY_COVERAGE|SOURCES)\b/
for (const file of DATA_FILES) {
  const text = rawText[file]
  if (text === undefined) continue
  const badLine = text
    .split('\n')
    .find((line) => /^\s*(import|export)\s/.test(line) && !ALLOWED_EXPORT.test(line))
  check(`${file} declares only its top-level exports`, badLine === undefined, badLine && badLine.trim())
  const io = text
    .split('\n')
    .find((line) => /(?:^|[^.\w])(?:require\s*\(|process\.|readFileSync|writeFileSync|fetch\s*\(|XMLHttpRequest)/.test(line))
  check(`${file} performs no import, I/O or network call`, io === undefined, io && io.trim())
  const exported = modules[file]
  for (const name of EXPECTED_EXPORTS[file]) {
    check(`${file} exports ${name}`, exported && name in exported)
  }
}

const L = globalThis.L
group('text.mjs (the L helper)')
check('L returns a frozen pair', Object.isFrozen(L('English', '中文')))
check('L keeps both sides', L('English', '中文').en === 'English' && L('English', '中文').zh === '中文')
check('L records a missing Chinese side as an empty string', L('English').zh === '' && L('English').en === 'English')
check('L never throws on a missing argument', L('English', undefined).zh === '')

const RELEASES = modules['releases.mjs']?.RELEASES
const FEATURES = modules['features.mjs']?.FEATURES
const ADVISORIES = modules['advisories.mjs']?.ADVISORIES
const ADVISORY_COVERAGE = modules['advisories.mjs']?.ADVISORY_COVERAGE
const SOURCES = modules['sources.mjs']?.SOURCES

check('RELEASES is a frozen array', isArray(RELEASES) && Object.isFrozen(RELEASES))
check('FEATURES is a frozen array', isArray(FEATURES) && Object.isFrozen(FEATURES))
check('ADVISORIES is a frozen array', isArray(ADVISORIES) && Object.isFrozen(ADVISORIES))
check('SOURCES is a frozen array', isArray(SOURCES) && Object.isFrozen(SOURCES))
check('ADVISORY_COVERAGE is a frozen object', isPlainObject(ADVISORY_COVERAGE) && Object.isFrozen(ADVISORY_COVERAGE))

if (failures.length) {
  console.log('\nFAILED checks:')
  for (const f of failures) console.log(`  ✗ ${f}`)
  console.log(`\nFAILED — ${failures.length} problem(s): dataset could not be loaded`)
  process.exit(1)
}

// ── RELEASES ───────────────────────────────────────────────────────────────
group('releases.mjs')
const RELEASE_KEYS = ['version', 'channel', 'date', 'title', 'summary', 'highlight']
const CHANNELS = ['rc', 'stable', 'beta', 'alpha']
const REGISTRY_DATES = {
  '0.0.1-rc.1': '2026-08-10',
  '0.1.0-rc.2': '2026-08-13',
  '0.1.5-rc.3': '2026-09-22',
  '0.1.7-rc.2': '2026-09-24',
  '0.2.0-rc.1': '2026-09-28',
  '0.2.0-rc.2': '2026-09-29',
  '0.2.1-alpha.1': '2026-10-03',
}
check('>= 3 release rows', RELEASES.length >= 3, `got ${RELEASES.length}`)
const releaseVersions = new Set()
const highlighted = []
for (const row of RELEASES) {
  const where = `release ${row && row.version}`
  check(`${where}: exact key set`, isPlainObject(row) && Object.keys(row).length === RELEASE_KEYS.length && RELEASE_KEYS.every((k) => k in row), isPlainObject(row) ? Object.keys(row).join(',') : typeof row)
  check(`${where}: version parses`, parseVersion(row.version) !== null)
  check(`${where}: version unique`, !releaseVersions.has(row.version))
  releaseVersions.add(row.version)
  check(`${where}: channel in enum`, CHANNELS.includes(row.channel))
  const suffix = parseVersion(row.version)
  const expectedChannel = suffix && suffix.tag ? suffix.tag : 'stable'
  check(`${where}: channel matches version suffix`, row.channel === expectedChannel, `channel=${row.channel}`)
  check(`${where}: date is ISO`, ISO_DATE.test(row.date))
  check(`${where}: date matches npm registry publish date`, REGISTRY_DATES[row.version] === row.date, `registry=${REGISTRY_DATES[row.version]} dataset=${row.date}`)
  check(`${where}: title is bilingual`, isPair(row.title))
  check(`${where}: summary is bilingual`, isPair(row.summary))
  bilingual('releases', `${where}.title`, row.title)
  bilingual('releases', `${where}.summary`, row.summary)
  check(`${where}: highlight is boolean`, typeof row.highlight === 'boolean')
  if (row.highlight) highlighted.push(row)
}
check('exactly one highlighted release', highlighted.length === 1, `got ${highlighted.length}`)
check(`highlighted release is the installed build ${INSTALLED_VERSION}`, highlighted[0]?.version === INSTALLED_VERSION, `got ${highlighted[0]?.version}`)
check('every release version has a known registry date', RELEASES.every((r) => r.version in REGISTRY_DATES))

// ── FEATURES ───────────────────────────────────────────────────────────────
group('features.mjs')
const FEATURE_KEYS = ['id', 'version', 'category', 'title', 'summary', 'packages', 'source']
const CATEGORIES = ['agent', 'ui', 'tools', 'sessions', 'security', 'platform', 'plugins']
const SOURCE_PATH = /^packages\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\/README\.md$/
check('25–40 feature rows', FEATURES.length >= 25 && FEATURES.length <= 40, `got ${FEATURES.length}`)
const featureIds = new Set()
const categoryCounts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]))
for (const row of FEATURES) {
  const where = `feature ${row && row.id}`
  check(`${where}: exact key set`, isPlainObject(row) && Object.keys(row).length === FEATURE_KEYS.length && FEATURE_KEYS.every((k) => k in row), isPlainObject(row) ? Object.keys(row).join(',') : typeof row)
  check(`${where}: id is kebab-case`, isString(row.id) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.id))
  check(`${where}: id unique`, !featureIds.has(row.id))
  featureIds.add(row.id)
  check(`${where}: version is the installed build`, row.version === INSTALLED_VERSION, `got ${row.version}`)
  check(`${where}: version exists in RELEASES`, releaseVersions.has(row.version))
  check(`${where}: category in enum`, CATEGORIES.includes(row.category))
  if (CATEGORIES.includes(row.category)) categoryCounts[row.category] += 1
  check(`${where}: title is bilingual`, isPair(row.title))
  check(`${where}: summary is bilingual`, isPair(row.summary))
  const title = bilingual('features', `${where}.title`, row.title)
  const summary = bilingual('features', `${where}.summary`, row.summary)
  check(`${where}: English title <= 60 chars`, isString(title) && title.length <= 60, `len=${title.length}`)
  const sentences = (summary.match(/[.!?](?:\s|$)/g) || []).length
  check(`${where}: English summary is 1–3 sentences`, isString(summary) && summary.length >= 40 && sentences <= 3, `len=${summary.length} sentences=${sentences}`)
  check(`${where}: packages is a non-empty unique array`, isArray(row.packages) && row.packages.length > 0 && new Set(row.packages).size === row.packages.length)
  check(`${where}: every package is an @deepseek-ai name`, row.packages.every((p) => isString(p) && p.startsWith('@deepseek-ai/')))
  check(`${where}: citation is a repo-relative README path`, isString(row.source) && SOURCE_PATH.test(row.source), row.source)
}
for (const category of CATEGORIES) {
  check(`category "${category}" has at least one row`, categoryCounts[category] > 0, `got ${categoryCounts[category]}`)
}
console.log(`   · rows per category: ${CATEGORIES.map((c) => `${c} ${categoryCounts[c]}`).join(', ')}`)

// ── ADVISORIES ─────────────────────────────────────────────────────────────
group('advisories.mjs')
const ADVISORY_KEYS = [
  'id', 'status', 'severity', 'title', 'summary', 'affected', 'fixedIn',
  'published', 'references', 'packages', 'source', 'verified', 'appliesToInstalled',
]
const STATUSES = ['fixed', 'affected', 'watched', 'not-affected']
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info', 'unknown']
const APPLIES = ['yes', 'no', 'unknown']
const ID_PREFIX = /^(CVE-\d{4}-\d{4,}|GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}|DSH-[A-Z0-9-]+|DEP-[A-Z0-9-]+)$/
check('>= 3 advisory rows', ADVISORIES.length >= 3, `got ${ADVISORIES.length}`)
const advisoryIds = new Set()
for (const row of ADVISORIES) {
  const where = `advisory ${row && row.id}`
  check(`${where}: exact key set`, isPlainObject(row) && Object.keys(row).length === ADVISORY_KEYS.length && ADVISORY_KEYS.every((k) => k in row), isPlainObject(row) ? Object.keys(row).join(',') : typeof row)
  check(`${where}: id unique`, !advisoryIds.has(row.id))
  advisoryIds.add(row.id)
  check(`${where}: id has a known prefix`, isString(row.id) && ID_PREFIX.test(row.id))
  check(`${where}: status in enum`, STATUSES.includes(row.status))
  check(`${where}: severity in enum`, SEVERITIES.includes(row.severity))
  check(`${where}: title is bilingual`, isPair(row.title))
  check(`${where}: summary is bilingual`, isPair(row.summary))
  bilingual('advisories', `${where}.title`, row.title)
  bilingual('advisories', `${where}.summary`, row.summary)
  check(`${where}: affected is a non-empty bilingual array`, isArray(row.affected) && row.affected.length > 0)
  ;(row.affected || []).forEach((entry, i) => bilingual('advisories', `${where}.affected[${i}]`, entry))
  check(`${where}: fixedIn is a version or null`, row.fixedIn === null || (isString(row.fixedIn) && parseVersion(row.fixedIn) !== null))
  check(`${where}: published is an ISO date or null`, row.published === null || ISO_DATE.test(row.published))
  check(`${where}: verified is an ISO date`, ISO_DATE.test(row.verified))
  check(`${where}: appliesToInstalled in enum`, APPLIES.includes(row.appliesToInstalled))
  check(`${where}: packages is a non-empty string array`, isArray(row.packages) && row.packages.length > 0 && row.packages.every(isString))
  check(`${where}: source names where the fact came from`, isString(row.source) && row.source.length >= 20)
  check(`${where}: has >= 1 reference`, isArray(row.references) && row.references.length >= 1)
  ;(row.references || []).forEach((ref, i) => {
    check(`${where}: reference ${i} has a bilingual label`, isPair(ref.label))
    bilingual('advisories', `${where}.references[${i}].label`, ref.label)
    let url = null
    try {
      url = new URL(ref.url)
    } catch {
      /* handled by the next check */
    }
    check(`${where}: reference ${i} is an http(s) URL`, url !== null && (url.protocol === 'https:' || url.protocol === 'http:'), ref.url)
  })
}

// appliesToInstalled must agree with the published ranges, never with severity.
const DEP_RANGE_EXPECTATIONS = {
  'GHSA-6qxp-vccf-f47h': { installed: '2.0.0', gte: '2.0.0', lt: '2.2.0' },
  'GHSA-ch52-4w7c-c8xp': { installed: '4.2.0', gte: '0.0.0', lte: '4.2.0' },
}
for (const row of ADVISORIES) {
  const where = `advisory ${row.id}`
  const text = row.affected.map(en).join(' | ')
  // Versions named as an affected range; the separate "installed here" note is
  // not a range and must never be read as one.
  const rangeText = row.affected
    .filter((line) => !/installed here/i.test(en(line)))
    .map(en)
    .join(' | ')
  const named = [...new Set(identifierTokens(rangeText).filter((t) => parseVersion(t) && t.startsWith('0.')))].filter(
    (version) => version !== INSTALLED_VERSION,
  )
  if (row.appliesToInstalled === 'yes') {
    const expected = DEP_RANGE_EXPECTATIONS[row.id]
    check(`${where}: "yes" row is a known installed-dependency hit`, expected !== undefined, 'no range expectation declared in verify.mjs')
    if (!expected) continue
    check(`${where}: names the installed version ${expected.installed}`, text.includes(expected.installed))
    const lowOk = expected.gte === undefined || compareVersions(expected.installed, expected.gte) >= 0
    const highOk = expected.lt === undefined
      ? expected.lte === undefined || compareVersions(expected.installed, expected.lte) <= 0
      : compareVersions(expected.installed, expected.lt) < 0
    check(`${where}: installed ${expected.installed} is inside its affected range`, lowOk && highOk, `range gte=${expected.gte} lt=${expected.lt} lte=${expected.lte}`)
    if (row.fixedIn) {
      check(`${where}: installed version is below the fix ${row.fixedIn}`, compareVersions(expected.installed, row.fixedIn) < 0)
    }
    check(`${where}: status is "affected"`, row.status === 'affected', `got ${row.status}`)
  } else if (row.appliesToInstalled === 'no') {
    check(`${where}: status is consistent with "no"`, row.status === 'fixed' || row.status === 'not-affected', `got ${row.status}`)
    if (row.fixedIn) {
      check(`${where}: fix ${row.fixedIn} is at or before the installed build`, compareVersions(row.fixedIn, INSTALLED_VERSION) <= 0, `installed ${INSTALLED_VERSION}`)
    }
    if (row.id.startsWith('DSH-')) {
      check(`${where}: hardening fact is marked fixed in this build`, row.status === 'fixed' && row.fixedIn === INSTALLED_VERSION, `status=${row.status} fixedIn=${row.fixedIn}`)
    } else {
      // Every harness version the record names must really be below the installed build.
      check(`${where}: names at least one harness version`, named.length > 0, rangeText)
      for (const version of named) {
        check(`${where}: named version ${version} is below ${INSTALLED_VERSION}`, compareVersions(version, INSTALLED_VERSION) < 0)
      }
      if (row.fixedIn) {
        check(`${where}: the fixed version ${row.fixedIn} is one of the named versions`, named.includes(row.fixedIn), rangeText)
      }
    }
  }
}
const affectedNow = ADVISORIES.filter((a) => a.appliesToInstalled === 'yes')
console.log(`   · ${ADVISORIES.length} rows — affects this install: ${affectedNow.map((a) => a.id).join(', ') || 'none'}`)
for (const row of ADVISORIES) console.log(`   · ${row.id.padEnd(24)} ${row.status.padEnd(12)} ${row.severity.padEnd(8)} applies=${row.appliesToInstalled}`)

// ── ADVISORY_COVERAGE ──────────────────────────────────────────────────────
group('advisory coverage')
const COVERAGE_KEYS = ['installedVersion', 'checkedAt', 'summary', 'searched', 'notFound', 'limitations', 'counts', 'sources']
check('coverage has the documented keys', isPlainObject(ADVISORY_COVERAGE) && COVERAGE_KEYS.every((k) => k in ADVISORY_COVERAGE), Object.keys(ADVISORY_COVERAGE).join(','))
check('installedVersion is the installed build', ADVISORY_COVERAGE.installedVersion === INSTALLED_VERSION, `got ${ADVISORY_COVERAGE.installedVersion}`)
check('checkedAt is an ISO date', ISO_DATE.test(ADVISORY_COVERAGE.checkedAt))
check('summary is bilingual', isPair(ADVISORY_COVERAGE.summary))
check('summary is honest-length', en(ADVISORY_COVERAGE.summary).length >= 120, `len=${en(ADVISORY_COVERAGE.summary).length}`)
bilingual('coverage', 'coverage.summary', ADVISORY_COVERAGE.summary)
check('searched is a non-empty array', isArray(ADVISORY_COVERAGE.searched) && ADVISORY_COVERAGE.searched.length >= 3)
check('notFound is a non-empty array', isArray(ADVISORY_COVERAGE.notFound) && ADVISORY_COVERAGE.notFound.length >= 3)
check('limitations is a non-empty array', isArray(ADVISORY_COVERAGE.limitations) && ADVISORY_COVERAGE.limitations.length >= 3)
const sourceIds = new Set(SOURCES.map((s) => s.id))
;(ADVISORY_COVERAGE.searched || []).forEach((entry, i) => {
  check(`coverage search ${i} names a real source id`, isString(entry.sourceId) && sourceIds.has(entry.sourceId), entry.sourceId)
  check(`coverage search ${i} is bilingual`, isPair(entry.query) && isPair(entry.result))
  bilingual('coverage', `coverage.searched[${i}].query`, entry.query)
  bilingual('coverage', `coverage.searched[${i}].result`, entry.result)
})
;(ADVISORY_COVERAGE.notFound || []).forEach((entry, i) => bilingual('coverage', `coverage.notFound[${i}]`, entry))
;(ADVISORY_COVERAGE.limitations || []).forEach((entry, i) => bilingual('coverage', `coverage.limitations[${i}]`, entry))
const counts = ADVISORY_COVERAGE.counts || {}
const countOf = (predicate) => ADVISORIES.filter(predicate).length
check('counts.advisories matches ADVISORIES.length', counts.advisories === ADVISORIES.length, `${counts.advisories} vs ${ADVISORIES.length}`)
check('counts.affectingInstalled matches the "yes" rows', counts.affectingInstalled === affectedNow.length, `${counts.affectingInstalled} vs ${affectedNow.length}`)
check('counts.hardeningFacts matches the DSH- rows', counts.hardeningFacts === countOf((a) => a.id.startsWith('DSH-')), `${counts.hardeningFacts} vs ${countOf((a) => a.id.startsWith('DSH-'))}`)
check('counts.dependencyRecords matches the GHSA- rows', counts.dependencyRecords === countOf((a) => a.id.startsWith('GHSA-')), `${counts.dependencyRecords} vs ${countOf((a) => a.id.startsWith('GHSA-'))}`)
check('counts.dshProductRecords matches the CVE- rows', counts.dshProductRecords === countOf((a) => a.id.startsWith('CVE-')), `${counts.dshProductRecords} vs ${countOf((a) => a.id.startsWith('CVE-'))}`)

// ── SOURCES ────────────────────────────────────────────────────────────────
group('sources.mjs')
const SOURCE_KEYS = ['id', 'label', 'url', 'kind', 'note']
const KINDS = ['official', 'registry', 'repo', 'advisory-db']
check('>= 5 source rows', SOURCES.length >= 5, `got ${SOURCES.length}`)
const sourceUrls = new Set()
for (const row of SOURCES) {
  const where = `source ${row && row.id}`
  check(`${where}: exact key set`, isPlainObject(row) && Object.keys(row).length === SOURCE_KEYS.length && SOURCE_KEYS.every((k) => k in row), isPlainObject(row) ? Object.keys(row).join(',') : typeof row)
  check(`${where}: id is kebab-case and unique`, isString(row.id) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.id) && !sourceUrls.has(`id:${row.id}`))
  sourceUrls.add(`id:${row.id}`)
  check(`${where}: url starts with http`, isString(row.url) && /^https?:\/\//.test(row.url), row.url)
  let parsed = null
  try {
    parsed = new URL(row.url)
  } catch {
    /* handled next */
  }
  check(`${where}: url is well formed`, parsed !== null)
  sourceUrls.add(row.url)
  check(`${where}: kind in enum`, KINDS.includes(row.kind))
  check(`${where}: label is bilingual`, isPair(row.label))
  check(`${where}: note is bilingual`, isPair(row.note))
  bilingual('sources', `${where}.label`, row.label)
  bilingual('sources', `${where}.note`, row.note)
}
const coverageSourceIds = new Set(ADVISORY_COVERAGE.sources || [])
for (const id of coverageSourceIds) {
  check(`coverage.sources id "${id}" exists in SOURCES`, sourceIds.has(id))
}
const advisoryRefUrls = new Set()
for (const row of ADVISORIES) {
  for (const ref of row.references || []) advisoryRefUrls.add(ref.url)
}
for (const url of advisoryRefUrls) {
  check(`advisory reference is declared in SOURCES: ${url}`, sourceUrls.has(url))
}
for (const row of SOURCES) {
  const cited = advisoryRefUrls.has(row.url)
  const declared = coverageSourceIds.has(row.id)
  check(`source ${row.id} is cited by an advisory or declared in coverage`, cited || declared, 'dead source entry')
}
console.log(`   · ${SOURCES.length} sources, ${advisoryRefUrls.size} cited by advisories, ${coverageSourceIds.size} declared for the sweep`)

// ── translation coverage ───────────────────────────────────────────────────
group('translation coverage (schema revision 2)')
let totalPairs = 0
let totalTranslated = 0
let totalMissing = 0
let totalPlain = 0
for (const [moduleName, stats] of translation) {
  totalPairs += stats.pairs
  totalTranslated += stats.translated
  totalMissing += stats.missing
  totalPlain += stats.plain
  check(`${moduleName}: no bilingual field is left as a plain string`, stats.plain === 0, `${stats.plain} plain string(s)`)
  console.log(
    `   · ${moduleName.padEnd(11)} ${stats.pairs} pairs, ${stats.translated} with Chinese, ${stats.missing} without, ${stats.plain} plain strings`,
  )
}
console.log(
  `   · ${'TOTAL'.padEnd(11)} ${totalPairs} pairs, ${totalTranslated} with Chinese, ${totalMissing} without, ${totalPlain} plain strings — strict gate ${STRICT_ZH ? 'ON' : 'OFF (DSHCL_STRICT_ZH=1 to enforce)'}`,
)

// ── English corpus integrity ───────────────────────────────────────────────
group('English corpus integrity')
const corpusHash = createHash('sha256').update(enCorpus.join('\n')).digest('hex')
if (PRINT_EN_HASH) {
  console.log(`   · ${enCorpus.length} English strings, sha256 ${corpusHash}`)
  console.log('   · paste this value into EN_CORPUS_SHA256 at the top of verify.mjs')
}
check('English corpus is unchanged from the pre-translation baseline', corpusHash === EN_CORPUS_SHA256, `expected ${EN_CORPUS_SHA256}, computed ${corpusHash}`)

// ── grounding against the extracted install ────────────────────────────────
group('grounding (extracted 0.2.0-rc.2 install)')
if (!grounding) {
  console.log('   · grounding tree absent — package, manifest and source-path cross-checks skipped')
} else {
  const dirs = readdirSync(GROUNDING_ROOT).filter((name) => {
    try {
      return statSync(join(GROUNDING_ROOT, name)).isDirectory()
    } catch {
      return false
    }
  })
  check('288 first-party packages in the extracted tree', dirs.length === 288, `got ${dirs.length}`)
  const manifests = new Map()
  let atInstalled = 0
  for (const name of dirs) {
    const manifestPath = join(GROUNDING_ROOT, name, 'package.json')
    if (!existsSync(manifestPath)) continue
    // The extracted manifests can be truncated mid-file, so read the two fields
    // structurally from the head instead of requiring a whole valid JSON parse.
    const head = readFileSync(manifestPath, 'utf8').slice(0, 4000)
    const version = /"version"\s*:\s*"([^"]+)"/.exec(head)?.[1]
    const repoDir =
      /"repository"\s*:\s*\{[^}]*?"directory"\s*:\s*"([^"]+)"/.exec(head)?.[1] ??
      /"directory"\s*:\s*"([^"]+)"/.exec(head)?.[1]
    manifests.set(name, { version, repoDir })
    if (version === INSTALLED_VERSION) atInstalled += 1
  }
  check('279 packages carry version 0.2.0-rc.2', atInstalled === 279, `got ${atInstalled}`)
  check('every features package exists in the install', FEATURES.every((row) => row.packages.every((pkg) => {
    const name = pkg.slice('@deepseek-ai/'.length)
    return manifests.has(name) && existsSync(join(GROUNDING_ROOT, name, 'package.json'))
  })))
  // Only the cited package must ship a README: some shipped packages are pure
  // build artifacts (for example @deepseek-ai/dsh-web-frontend) with no README.
  check('the cited package of every row ships the README it cites', FEATURES.every((row) => {
    const name = row.packages[0].slice('@deepseek-ai/'.length)
    return existsSync(join(GROUNDING_ROOT, name, 'README.md'))
  }))
  let sourcePathsChecked = 0
  for (const row of FEATURES) {
    const name = row.packages[0].slice('@deepseek-ai/'.length)
    const manifest = manifests.get(name)
    check(`feature ${row.id}: owning package ${row.packages[0]} is installed`, manifest !== undefined)
    if (!manifest) continue
    check(`feature ${row.id}: package ${row.packages[0]} is at ${INSTALLED_VERSION}`, manifest.version === INSTALLED_VERSION, `got ${manifest.version}`)
    check(`feature ${row.id}: ${row.packages[0]} declares repository.directory`, isString(manifest.repoDir), 'manifest truncated before the repository block')
    if (!isString(manifest.repoDir)) continue
    sourcePathsChecked += 1
    check(
      `feature ${row.id}: source is ${manifest.repoDir}/README.md`,
      row.source === `${manifest.repoDir}/README.md`,
      `source=${row.source} repoDir=${manifest.repoDir}`,
    )
  }
  check('every feature source path was checked against its manifest', sourcePathsChecked === FEATURES.length, `${sourcePathsChecked}/${FEATURES.length}`)
  for (const row of ADVISORIES) {
    if (!row.id.startsWith('DSH-')) continue
    const name = row.packages[0].slice('@deepseek-ai/'.length)
    check(`advisory ${row.id}: cited README exists in the install`, manifests.has(name) && existsSync(join(GROUNDING_ROOT, name, 'README.md')))
  }
  for (const row of ADVISORIES) {
    for (const pkg of row.packages) {
      if (pkg.startsWith('@deepseek-ai/')) continue
      check(`advisory ${row.id}: dependency ${pkg} is installed`, existsSync(join('/tmp/dshx/root/node_modules', pkg, 'package.json')))
    }
  }
  console.log(`   · ${dirs.length} packages checked, ${atInstalled} at ${INSTALLED_VERSION}`)
}

// ── strict-Chinese gate and summary ────────────────────────────────────────
if (STRICT_ZH) {
  group('strict Chinese gate (DSHCL_STRICT_ZH=1)')
  check('every bilingual field carries Chinese', strictZhFailures.length === 0, `${strictZhFailures.length} missing`)
  for (const failure of strictZhFailures) console.log(`   ✗ ${failure}`)
}

console.log('\n──────── summary ────────')
console.log(`  releases   ${RELEASES.length} rows, installed ${INSTALLED_VERSION} highlighted`)
console.log(`  features   ${FEATURES.length} rows — ${CATEGORIES.map((c) => `${c} ${categoryCounts[c]}`).join(', ')}`)
console.log(`  advisories ${ADVISORIES.length} rows — ${countOf((a) => a.id.startsWith('CVE-'))} CVE, ${countOf((a) => a.id.startsWith('GHSA-'))} GHSA, ${countOf((a) => a.id.startsWith('DSH-'))} hardening; affects this install: ${affectedNow.length}`)
console.log(`  sources    ${SOURCES.length} entries`)
console.log(`  coverage   checked ${ADVISORY_COVERAGE.checkedAt} against ${ADVISORY_COVERAGE.installedVersion}`)
console.log(`  translation ${totalTranslated}/${totalPairs} pairs carry Chinese${totalMissing ? ` (${totalMissing} missing)` : ''}; ${totalPlain} bilingual fields still plain strings; strict gate ${STRICT_ZH ? 'ON' : 'off'}`)
console.log(`  english    corpus sha256 ${corpusHash.slice(0, 16)}… ${corpusHash === EN_CORPUS_SHA256 ? '(matches baseline)' : '(DRIFTED)'}`)
console.log(`  checks     ${passed} passed, ${failures.length + strictZhFailures.length} failed`)

if (failures.length || strictZhFailures.length) {
  console.log('\nFAILED checks:')
  for (const failure of strictZhFailures) console.log(`  ✗ ${failure}`)
  for (const failure of failures) console.log(`  ✗ ${failure}`)
  console.log(`\nFAILED — ${failures.length + strictZhFailures.length} problem(s) in plugin/src/data`)
  process.exit(1)
}
console.log('\nOK — schema, localization, citations, ranges and grounding all valid')
