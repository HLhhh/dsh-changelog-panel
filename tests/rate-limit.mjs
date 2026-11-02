// Sandbox reproduction of the GitHub-quota bug, with no dependencies.
//
// Reported: on a machine that is not logged in to GitHub (unauthenticated API,
// 60 requests/hour per IP) the panel errored — "GitHub API rate limit reached" —
// although the npm registry had answered and the version list was complete.
//
// This file stubs the global `fetch`, so it reproduces the condition without
// spending real quota and runs in plain Node (`npm test`). It asserts the transport
// contract only; the rendered panel is covered by the maintainer's local suite.
//
// Three details are load-bearing and each once produced the false alarm:
//   1. a GitHub 403 does not fail the refresh while npm answered;
//   2. only a response that REPORTS `x-ratelimit-remaining: 0` is quota exhaustion
//      (a missing header used to be coerced to 0, and every 403 claimed the quota);
//   3. a refused npm request is never described as a GitHub rate limit.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const live = await import(join(root, 'src/client/live-data.mjs'))
const registryFixture = JSON.parse(readFileSync(join(root, 'tests/fixtures/npm-registry.json'), 'utf8'))
const releasesFixture = JSON.parse(readFileSync(join(root, 'tests/fixtures/github-releases.json'), 'utf8'))

let passed = 0
const failures = []
const check = (label, condition, detail) => {
  if (condition) {
    passed += 1
    console.log(`PASS  ${label}${detail === undefined ? '' : `  [${detail}]`}`)
  } else {
    failures.push(label)
    console.log(`FAIL  ${label}${detail === undefined ? '' : `  [${detail}]`}`)
  }
}

/** A Response-like object for the mocked transport. */
function reply({ ok, status, body, headers = {} }) {
  return {
    ok,
    status,
    headers: { get: (name) => (Object.prototype.hasOwnProperty.call(headers, name) ? headers[name] : null) },
    json: async () => body,
  }
}

const registryOk = () => reply({ ok: true, status: 200, body: registryFixture })
const githubOk = () => reply({ ok: true, status: 200, body: releasesFixture, headers: { 'x-ratelimit-remaining': '42' } })
const github403 = (remaining) =>
  reply({
    ok: false,
    status: 403,
    headers: remaining === undefined ? {} : { 'x-ratelimit-remaining': String(remaining) },
    body: { message: 'API rate limit exceeded' },
  })
const networkDown = () => {
  throw new Error('Failed to fetch')
}

/** Run fetchLiveData against a mocked transport. */
async function fetchWith(transport) {
  const previous = globalThis.fetch
  globalThis.fetch = transport
  try {
    return await live.fetchLiveData({})
  } finally {
    globalThis.fetch = previous
  }
}

const isRegistry = (url) => String(url).includes('registry.npmjs.org')

// 1. Quota exhausted on GitHub, npm answered: the refresh still yields versions.
const quota = await fetchWith((url) => (isRegistry(url) ? registryOk() : github403(0)))
check('a GitHub rate limit does not fail the refresh', quota.releases.length > 0, `${quota.releases.length} releases`)
check('the npm source is recorded healthy', quota.sources.registry.ok === true)
check('the notes source is classified as rate-limited', quota.sources.releases.kind === 'rate-limited')
check(
  'the diagnostic states the cause and the budget',
  quota.warnings.some((warning) => /rate limit/i.test(warning) && /60/.test(warning)),
  quota.warnings.join(' | '),
)

// 2. A 403 that is NOT an exhausted budget must not be reported as one.
const budgetLeft = await fetchWith((url) => (isRegistry(url) ? registryOk() : github403(12)))
check('a 403 with budget left is a refusal, not exhaustion', budgetLeft.sources.releases.kind === 'refused', budgetLeft.sources.releases.kind)
const noHeader = await fetchWith((url) => (isRegistry(url) ? registryOk() : github403(undefined)))
check('a 403 without a quota header is a refusal', noHeader.sources.releases.kind === 'refused', noHeader.sources.releases.kind)
check(
  'a missing quota header never reads as zero',
  !noHeader.warnings.some((warning) => /rate limit/i.test(warning)),
  noHeader.warnings.join(' | '),
)

// 3. Transport failures and source attribution.
const offline = await fetchWith((url) => (isRegistry(url) ? registryOk() : networkDown()))
check('a network-failed notes source does not fail the refresh', offline.releases.length > 0)
check('a network-failed notes source is classified as network', offline.sources.releases.kind === 'network')

const npmRefused = await fetchWith((url) => (isRegistry(url) ? github403(0) : githubOk()))
check(
  'a refused npm request is never called a GitHub rate limit',
  npmRefused.warnings.some((warning) => /npm registry/i.test(warning)) &&
    !npmRefused.warnings.some((warning) => /npm registry[^;]*GitHub/i.test(warning)),
  npmRefused.warnings.join(' | '),
)

let both = null
try {
  await fetchWith(() => github403(0))
} catch (error) {
  both = error
}
check('both sources failing is still a thrown refresh failure', both !== null && /rate limit/i.test(both.message))

console.log(`\n${passed}/${passed + failures.length} checks passed`)
if (failures.length > 0) {
  console.log(`\n${failures.length} check(s) failed`)
  for (const label of failures) console.log(`  - ${label}`)
  process.exit(1)
}
