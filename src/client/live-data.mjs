/**
 * Live official data for the changelog panel.
 *
 * Two public sources, both verified to allow browser use:
 *
 * - `https://registry.npmjs.org/@deepseek-ai/dsh-base` — every published
 *   version with its exact publish time, plus the dist-tags. Authoritative for
 *   "which releases exist", including the ones that never got release notes.
 * - `https://api.github.com/repos/deepseek-ai/deepseek-harness/releases` — the
 *   official release notes. These are **bilingual by construction**: every note
 *   carries a `[中文](#cn-…) | [English](#en-…)` header and two parallel
 *   sections, so the Chinese shown for a live release is the project's own
 *   Chinese, not our translation.
 *
 * Both return `access-control-allow-origin: *`, so the browser can call them
 * directly; no host half and no proxy are involved.
 *
 * Everything here is a pure function over fetched JSON so it can be tested
 * without a network.
 *
 * @module dsh-changelog-panel/live-data
 */

/** npm package whose version list defines "which releases exist". */
const NPM_PACKAGE = '@deepseek-ai/dsh-base'
/** GitHub repository that publishes the official release notes. */
const GITHUB_REPO = 'deepseek-ai/deepseek-harness'
/** Release tags are `<TAG_PREFIX><version>`. */
const TAG_PREFIX = 'dsh-v'

const RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=100`
const REGISTRY_URL = `https://registry.npmjs.org/${encodeURIComponent(NPM_PACKAGE)}`

const REQUEST_TIMEOUT_MS = 20000
/** GitHub's unauthenticated budget is 60 requests/hour; below this we back off. */
const RATE_LIMIT_FLOOR = 5

// ── release-note parsing ────────────────────────────────────────────────────

/** Heading text → the panel's category vocabulary. */
const CATEGORY_PATTERNS = [
  [/新增|new feature|features?\b/i, 'new'],
  [/体验优化|improvement|enhance/i, 'improved'],
  [/问题修复|bug\s*fix|fixes?\b/i, 'fixed'],
  [/其他变更|other change|chores?\b/i, 'other'],
]
/**
 * Order release-note categories render in. Named apart from the panel's own
 * `CATEGORY_ORDER` (feature topics) because both files are concatenated into one
 * bundle scope, where a shared name would be a redeclaration.
 */
const NOTE_CATEGORY_ORDER = ['new', 'improved', 'fixed', 'other']

/** Strip markdown emphasis and inline code, keeping the words. */
function stripInline(text) {
  return String(text)
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Split `@handle` mentions from an item's prose.
 *
 * The English notes write attribution as `… by @handle`, so the lead-in word has
 * to go with the handle; removing only the mention leaves a dangling "by".
 * @param text - one item's text.
 * @returns `{ text, credits }`.
 */
function splitCredits(text) {
  const credits = []
  const body = String(text).replace(
    /(?:\s*\b(?:by|thanks to|credit(?:s)? to)\s*)?@([A-Za-z0-9][A-Za-z0-9-]*)/gi,
    (_match, handle) => {
      credits.push(handle)
      return ''
    },
  )
  return {
    text: body
      .replace(/\s+([,，。.；;：:])/g, '$1')
      // The Chinese notes separate attribution with an em dash ("… — @handle"),
      // which would otherwise be left dangling once the handle is removed.
      .replace(/[\s,，、;；:：]*(?:—|–|-{1,2})[\s]*$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim(),
    credits,
  }
}

/** Map a heading to a category key, defaulting to `other`. */
function categoryOf(heading) {
  for (const [pattern, key] of CATEGORY_PATTERNS) if (pattern.test(heading)) return key
  return 'other'
}

/**
 * Block-level normalization before line parsing.
 *
 * The official notes are hand-written HTML-in-markdown and do **not** reliably
 * put one element per line: an `<h3>` heading can be glued to the end of the
 * previous bullet, and anchors share a line with their heading. Splitting on the
 * tags themselves makes the line grammar trustworthy; parsing line-by-line
 * without this swallowed headings into bullet text.
 * @param section - raw section text.
 * @returns one element per line.
 */
function toBlockLines(section) {
  return String(section)
    .replace(/<h([1-6])\b/gi, '\n<h$1')
    .replace(/<\/h[1-6]>/gi, '</h3>\n')
    .replace(/<a\s+id=/gi, '\n<a id=')
    // Both heading styles occur in the same note: the first category is an HTML
    // `<h3>`, every later one is markdown `###`. Missing the second style merged
    // all four categories into the first, which is exactly what happened before
    // this line existed.
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '\n### ')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

/** Parse one language section into categorized items. */
function parseSection(section) {
  const groups = []
  let current = null
  const openGroup = (text) => {
    current = { category: categoryOf(text), heading: text, items: [] }
    groups.push(current)
    return current
  }
  for (const line of toBlockLines(section)) {
    // A heading of any level, possibly with trailing prose on the same line.
    const headingMatches = [...line.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)]
    if (headingMatches.length > 0) {
      for (const match of headingMatches) {
        const text = stripInline(match[1])
        if (text !== '') openGroup(text)
      }
      continue
    }
    const markdownHeading = /^###\s+(.*)$/.exec(line)
    if (markdownHeading) {
      const text = stripInline(markdownHeading[1])
      if (text !== '') openGroup(text)
      continue
    }
    // Navigation links and anchors are structural, never content.
    if (/^<a\s/i.test(line) || /^\[/.test(line) || /^<\/?(?:p|div|ul|ol|li|br)\b/i.test(line)) continue
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    if (bullet) {
      const item = splitCredits(stripInline(bullet[1]))
      if (item.text === '') continue
      if (current === null) openGroup('')
      current.items.push(item)
      continue
    }
    // A continuation line extends the bullet above it.
    if (current !== null && current.items.length > 0) {
      const last = current.items[current.items.length - 1]
      const extra = splitCredits(stripInline(line))
      if (extra.text !== '') {
        last.text = (last.text + ' ' + extra.text).trim()
        last.credits = last.credits.concat(extra.credits)
      }
    }
  }
  return groups.filter((group) => group.items.length > 0)
}

/**
 * Anchors that mark the start of each language half.
 *
 * The project has used at least three shapes across its history, and all three
 * occur in the published notes, so a narrow pattern silently drops real Chinese:
 *   `<h3 id="cn-v0.2.0-rc.2-community">`   (current, suffixed)
 *   `<h2 id="chinese">`                    (`0.1.3-alpha.2`)
 *   `<h3 id="cn">`                         (`0.1.0-rc.7`)
 * Matching only the first form left two releases with no Chinese at all.
 */
const ZH_ANCHOR = /<h[1-6][^>]*\bid="[^"]*\b(?:cn|zh|chinese)\b[^"]*"/i
const EN_ANCHOR = /<h[1-6][^>]*\bid="[^"]*\b(?:en|eng|english)\b[^"]*"/i

/**
 * Split a release body into its Chinese and English halves.
 *
 * The notes link both languages at the top and mark each half with an anchored
 * heading; a body with no Chinese anchor yields `null` and the caller falls back
 * rather than guessing.
 * @param body - the raw `body` field of a GitHub release.
 * @returns `{ zh, en }` section text, each possibly empty, or null.
 */
function splitBilingual(body) {
  if (typeof body !== 'string' || body === '') return null
  const cnAt = body.search(ZH_ANCHOR)
  const enAt = body.search(EN_ANCHOR)
  if (cnAt === -1 && enAt === -1) return null
  // An English-only note is a real note. Returning null here would classify it as
  // "the project published nothing", which hides content and states a falsehood;
  // the panel has a separate message for "notes exist but carry no Chinese".
  if (cnAt === -1) return { zh: '', en: body.slice(enAt) }
  if (enAt === -1) return { zh: body.slice(cnAt), en: '' }
  return cnAt < enAt
    ? { zh: body.slice(cnAt, enAt), en: body.slice(enAt) }
    : { zh: body.slice(cnAt), en: body.slice(enAt, cnAt) }
}

/**
 * Parse one GitHub release into the panel's row shape.
 * @param release - a raw GitHub release object.
 * @returns a parsed release row, or null when the tag is not one of ours.
 */
function parseGithubRelease(release) {
  if (!release || typeof release.tag_name !== 'string') return null
  if (release.tag_name.indexOf(TAG_PREFIX) !== 0) return null
  const version = release.tag_name.slice(TAG_PREFIX.length)
  const split = splitBilingual(release.body)
  const zh = split ? parseSection(split.zh) : []
  const en = split ? parseSection(split.en) : []
  return {
    version,
    tag: release.tag_name,
    title: typeof release.name === 'string' && release.name !== '' ? release.name : version,
    publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
    url: typeof release.html_url === 'string' ? release.html_url : null,
    prerelease: release.prerelease === true,
    /** Categories present in the Chinese notes, with English wording filled in per item. */
    groups: mergeLanguages(zh, en),
    /** Whether the official notes carry Chinese at all. */
    hasChinese: zh.length > 0,
    /** Whether the official notes exist in any language. */
    hasNotes: zh.length > 0 || en.length > 0,
  }
}

/**
 * Merge the two language sections into one ordered group list.
 *
 * Sections are aligned by position, which is how the project writes them, and
 * each item keeps both languages so the panel's language switch works on live
 * data exactly as it does on the bundled dataset.
 * @param zh - parsed Chinese groups.
 * @param en - parsed English groups.
 * @returns merged groups.
 */
function mergeLanguages(zh, en) {
  const byCategory = new Map()
  const push = (group, index, language) => {
    const key = group.category + '#' + index
    if (!byCategory.has(key)) {
      byCategory.set(key, { category: group.category, heading: { zh: '', en: '' }, items: [] })
    }
    const target = byCategory.get(key)
    target.heading[language] = group.heading
    return target
  }
  zh.forEach((group, index) => {
    const target = push(group, index, 'zh')
    group.items.forEach((item, itemIndex) => {
      const other = en[index] && en[index].items[itemIndex]
      target.items.push({
        key: group.category + '-' + index + '-' + itemIndex,
        text: { zh: item.text, en: other ? other.text : '' },
        credits: item.credits.length > 0 ? item.credits : other ? other.credits : [],
      })
    })
  })
  // English sections with no Chinese counterpart (a partially translated note).
  en.forEach((group, index) => {
    if (zh[index]) return
    const target = push(group, index, 'en')
    group.items.forEach((item, itemIndex) => {
      target.items.push({
        key: group.category + '-' + index + '-' + itemIndex,
        text: { zh: '', en: item.text },
        credits: item.credits,
      })
    })
  })
  return [...byCategory.values()]
    .filter((group) => group.items.length > 0)
    .sort((a, b) => NOTE_CATEGORY_ORDER.indexOf(a.category) - NOTE_CATEGORY_ORDER.indexOf(b.category))
}

// ── merging the two sources ─────────────────────────────────────────────────

/**
 * Build the live release list from the registry and the release notes.
 *
 * The registry is the spine: it knows every published version and its exact
 * date. Notes are attached where they exist. A version with no release notes is
 * kept and flagged, because "no official notes exist" is information the reader
 * needs, not a row to silently drop.
 * @param registry - parsed npm registry document.
 * @param releases - parsed GitHub release rows.
 * @returns `{ releases, distTags }`.
 */
function mergeReleases(registry, releases) {
  const times = registry && registry.time && typeof registry.time === 'object' ? registry.time : {}
  const versions = registry && registry.versions && typeof registry.versions === 'object' ? registry.versions : {}
  const byVersion = new Map(releases.map((row) => [row.version, row]))

  const rows = Object.keys(versions)
    .filter((version) => typeof times[version] === 'string')
    .sort((a, b) => (times[a] < times[b] ? 1 : times[a] > times[b] ? -1 : 0))
    .map((version) => {
      const notes = byVersion.get(version)
      return {
        version,
        date: times[version].slice(0, 10),
        publishedAt: times[version],
        latestFor: distTagsFor(registry, version),
        notes: notes
          ? { groups: notes.groups, url: notes.url, hasChinese: notes.hasChinese, hasNotes: notes.hasNotes }
          : null,
      }
    })

  // A release note for a version the registry does not list (e.g. an
  // unpublished tag) is still worth showing, so it is appended.
  for (const row of releases) {
    if (rows.some((entry) => entry.version === row.version)) continue
    rows.push({
      version: row.version,
      date: row.publishedAt ? row.publishedAt.slice(0, 10) : '',
      publishedAt: row.publishedAt,
      latestFor: [],
      notes: { groups: row.groups, url: row.url, hasChinese: row.hasChinese, hasNotes: row.hasNotes },
    })
  }
  // Rows appended from a note-only version have no registry date; sort them last
  // so the list is still strictly newest-first rather than "dated, then leftovers".
  rows.sort((a, b) => {
    const left = a.publishedAt || ''
    const right = b.publishedAt || ''
    if (left === right) return 0
    if (left === '') return 1
    if (right === '') return -1
    return left < right ? 1 : -1
  })
  return { releases: rows, distTags: (registry && registry['dist-tags']) || {} }
}

/**
 * Which dist-tags point at a version.
 * @param registry - parsed npm registry document.
 * @param version - version to test.
 * @returns tag names.
 */
function distTagsFor(registry, version) {
  const tags = (registry && registry['dist-tags']) || {}
  return Object.keys(tags).filter((tag) => tags[tag] === version)
}

// ── fetching ────────────────────────────────────────────────────────────────

/** Fetch JSON with a timeout and a caller-supplied abort signal. */
async function fetchJson(url, signal) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = setTimeout(() => {
    if (controller) controller.abort()
  }, REQUEST_TIMEOUT_MS)
  const onAbort = () => {
    if (controller) controller.abort()
  }
  if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', onAbort)
  try {
    const response = await fetch(url, {
      signal: controller ? controller.signal : signal,
      headers: { accept: 'application/json' },
    })
    const remaining = Number(response.headers && response.headers.get && response.headers.get('x-ratelimit-remaining'))
    const body = await response.json().catch(() => null)
    return { ok: response.ok, status: response.status, body, remaining: Number.isFinite(remaining) ? remaining : null }
  } finally {
    clearTimeout(timer)
    if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', onAbort)
  }
}

/** Turn a failed fetch into a message a reader can act on. */
function describeFailure(source, status, remaining) {
  if (status === 403 || status === 429) {
    return remaining === 0
      ? `${source}: GitHub API rate limit reached (60 requests/hour without a token). Try again later.`
      : `${source}: request refused (HTTP ${status}).`
  }
  return `${source}: HTTP ${status}`
}

/**
 * Fetch the live official data.
 *
 * The two sources are independent: a failing registry still yields whatever
 * notes were fetched, and vice versa. Rate-limit exhaustion on GitHub is
 * reported as a distinct, actionable status instead of a generic error.
 * @param options - `{ signal }`.
 * @returns `{ releases, distTags, fetchedAt, warnings, rateLimited, latest }`.
 */
async function fetchLiveData(options) {
  const signal = options && options.signal
  const warnings = []
  let rateLimited = false
  let latest = null

  let registry = null
  try {
    const result = await fetchJson(REGISTRY_URL, signal)
    if (result.ok && result.body) registry = result.body
    else warnings.push(describeFailure('npm registry', result.status, result.remaining))
  } catch (error) {
    warnings.push('npm registry: ' + (error && error.message ? error.message : 'request failed'))
  }

  let releases = []
  try {
    const result = await fetchJson(RELEASES_URL, signal)
    if (result.ok && Array.isArray(result.body)) {
      releases = result.body.map(parseGithubRelease).filter(Boolean)
      if (result.remaining !== null && result.remaining <= RATE_LIMIT_FLOOR) rateLimited = true
    } else if (result.status === 403 || result.status === 429) {
      rateLimited = true
      warnings.push(describeFailure('GitHub releases', result.status, result.remaining))
    } else {
      warnings.push(describeFailure('GitHub releases', result.status, result.remaining))
    }
  } catch (error) {
    warnings.push('GitHub releases: ' + (error && error.message ? error.message : 'request failed'))
  }

  const merged = mergeReleases(registry, releases)
  // Both sources failing is a failed refresh, not a successful empty one: the
  // caller must be able to keep showing the data it already has and say so,
  // instead of replacing it with "0 versions".
  if (registry === null && releases.length === 0) {
    throw new Error(warnings.length > 0 ? warnings.join('; ') : 'no source returned data')
  }
  if (merged.releases.length > 0) latest = merged.releases[0].version
  return {
    releases: merged.releases,
    distTags: merged.distTags,
    latest,
    rateLimited,
    warnings,
    fetchedAt: new Date().toISOString(),
  }
}

export {
  fetchLiveData,
  mergeReleases,
  parseGithubRelease,
  parseSection,
  toBlockLines,
  splitBilingual,
  stripInline,
  splitCredits,
  categoryOf,
  distTagsFor,
  NOTE_CATEGORY_ORDER,
  NPM_PACKAGE,
  GITHUB_REPO,
  REGISTRY_URL,
  RELEASES_URL,
}
