// Model-facing storage tools.
//
// Why these exist as Agent tools rather than as buttons in the panel: a packaged
// `dsh.client` bundle has no client-to-host call channel, so a browser button can
// never delete a file. The Agent, by contrast, runs host-side by construction, and
// `ctx.tools.register(...)` is the same mechanism every shipped tool (`bash`,
// `todo_write`, `present`, `plugin_manager`) uses. Deletion therefore belongs to
// the Agent, and the panel is reduced to showing the inventory.
//
// Why the definitions are built by hand instead of with `defineTool`: that helper
// lives in `@deepseek-ai/dsh-tools`, which a plugin in the user's workspace cannot
// resolve (the framework's packages are inside the app bundle, and Node resolves
// bare specifiers from the importing file's real location). `defineTool` only
// normalizes a schema DSL into plain JSON Schema and wraps `execute` in argument
// validation; supplying the JSON Schema directly is the same contract, and the
// registry validates it with `assertSupportedJsonSchema` on registration.
//
// Every destructive path is validated against a FRESH scan rather than against the
// arguments the model passed. A stale report, a typo, or a hallucinated path must
// not be able to reach the filesystem: only a path the scanner itself just
// classified as reclaimable is eligible, and only inside an allowed root.

import { scanStorage, planCleanup, trashPaths } from './storage-scan.js'

/**
 * Wrap a declaration in the shape the tool registry accepts.
 *
 * Mirrors what `defineTool` produces for a declaration whose `parameters` and
 * `output.schema` are already JSON Schema: the registry consumes `parameters`,
 * `output.schema` and `output.render`, and validates arguments before `execute`.
 * @param declaration - `{ name, description, parameters, output, execute, presentCall }`.
 * @returns the registry-ready definition.
 */
function defineStorageTool(declaration) {
  const definition = {
    name: declaration.name,
    description: declaration.description,
    parameters: declaration.parameters,
    output: {
      schema: declaration.output.schema,
      render: declaration.output.render,
    },
    execute: declaration.execute,
  }
  if (typeof declaration.presentCall === 'function') definition.presentCall = declaration.presentCall
  return definition
}

/**
 * Roots a cleanup may touch.
 *
 * `trashPaths` refuses anything outside these, so a path that escapes the scan
 * (or one the model invented) dies here rather than in the trash.
 * @param home - absolute `$DSH_HOME`.
 * @param appSupport - absolute Electron support directory.
 * @returns the allowed root list.
 */
function safetyRoots(home, appSupport) {
  return [home, appSupport].filter((root) => typeof root === 'string' && root !== '')
}

/** Run a scan and attach the reclaim plan. */
function scanWithPlan(env) {
  const report = scanStorage(env)
  return { report, plan: planCleanup(report) }
}

/** One line per category, largest first, for the model-facing summary. */
function describeCategories(report) {
  return Object.entries(report.totals)
    .sort((a, b) => b[1] - a[1])
    .map(([key, bytes]) => `${key} ${(bytes / 1048576).toFixed(1)} MiB`)
    .join('; ')
}

/**
 * The reclaim candidates, in the compact shape both the model and the panel use.
 * @param plan - a `planCleanup` result.
 * @returns one entry per item, path included so the model can name it exactly.
 */
function describePlan(plan) {
  return plan.items.map((item) => ({
    id: item.id,
    kind: item.kind,
    path: item.path,
    bytes: item.bytes,
    confidence: item.confidence,
    needsConfirmation: item.needsConfirmation === true,
    reason: item.reason,
  }))
}

/**
 * The environment a host-side tool runs against.
 * @param storageEnv - the env `apply` built once, passed in rather than read
 *   from `ctx`: a Cordis `Context` refuses (`cannot set property … without
 *   provide`) any property the plugin did not `provide`, so the env cannot live
 *   on the context.
 * @returns `{ home, workspace, activeProfile }`.
 */
function toolEnv(storageEnv) {
  return {
    home: storageEnv.home,
    workspace: storageEnv.workspace(),
    activeProfile: storageEnv.activeProfile,
  }
}

/** Output schema for one reclaim candidate. */
const CANDIDATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    kind: { type: 'string' },
    path: { type: 'string' },
    bytes: { type: 'integer' },
    confidence: { type: 'string' },
    needsConfirmation: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['id', 'kind', 'path', 'bytes', 'confidence', 'needsConfirmation', 'reason'],
}

/** Output schema for one planned or rejected path. */
const PATH_REASON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    path: { type: 'string' },
    reason: { type: 'string' },
  },
  required: ['path', 'reason'],
}

/**
 * Register `storage_report`, `storage_cleanup` and `storage_open`.
 * @param ctx - host plugin context carrying the tools registry.
 * @param storageEnv - the shared roots `apply` built (`{ home, workspace, activeProfile }`).
 * @returns {void}
 */
export function registerStorageTools(ctx, storageEnv) {
  ctx.tools.register(
    defineStorageTool({
      name: 'storage_report',
      description:
        'Inventory what DSH stores on this machine: total size, per-category cost, the sessions each item belongs to, and which items may be reclaimed. Read-only. Use it before any cleanup so the figures and the candidate list are current, and report the numbers to the user rather than paraphrasing them.',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            totalBytes: { type: 'integer' },
            reclaimableBytes: { type: 'integer' },
            categories: { type: 'string' },
            sessions: { type: 'integer' },
            subagentsMapped: { type: 'integer' },
            scanMs: { type: 'integer' },
            candidates: { type: 'array', items: CANDIDATE_SCHEMA },
          },
          required: [
            'totalBytes',
            'reclaimableBytes',
            'categories',
            'sessions',
            'subagentsMapped',
            'scanMs',
            'candidates',
          ],
        },
        render: (_args, value) => [
          {
            type: 'text',
            text:
              `Storage inventory: ${(value.totalBytes / 1048576).toFixed(1)} MiB total, ` +
              `${(value.reclaimableBytes / 1048576).toFixed(1)} MiB reclaimable across ` +
              `${value.candidates.length} candidate(s). ${value.categories}. ` +
              `${value.sessions} session(s), ${value.subagentsMapped} attributed to a parent.`,
          },
        ],
      },
      execute() {
        const { report, plan } = scanWithPlan(toolEnv(storageEnv))
        return Promise.resolve({
          totalBytes: report.grandTotal,
          reclaimableBytes: plan.bytes,
          categories: describeCategories(report),
          sessions: report.sessions.length,
          subagentsMapped: report.subagents.mapped,
          scanMs: report.scanMs,
          candidates: describePlan(plan),
        })
      },
      presentCall: () => ({ card: 'generic', title: 'Scan storage', kind: 'other', rawInput: {} }),
    }),
  )

  ctx.tools.register(
    defineStorageTool({
      name: 'storage_cleanup',
      description:
        'Reclaim disk space by moving the named items to the OS Trash, where the user can restore them. Pass ids from a fresh `storage_report` (or the single entry "all" for every candidate). Nothing is deleted while `confirm` is false — call once with confirm false to show the user exactly what would go, then again with confirm true once they agree.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          items: {
            type: 'array',
            items: { type: 'string' },
            description: 'Candidate ids from storage_report, or the single entry "all".',
          },
          confirm: {
            type: 'boolean',
            description:
              'Must be true to actually move anything. False (or omitted) returns the plan without touching the filesystem.',
          },
        },
        required: ['items'],
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            dryRun: { type: 'boolean' },
            planned: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string' },
                  path: { type: 'string' },
                  bytes: { type: 'integer' },
                  reason: { type: 'string' },
                },
                required: ['id', 'path', 'bytes', 'reason'],
              },
            },
            bytes: { type: 'integer' },
            moved: { type: 'array', items: { type: 'string' } },
            failed: { type: 'array', items: PATH_REASON_SCHEMA },
            skipped: { type: 'array', items: PATH_REASON_SCHEMA },
            unknownIds: { type: 'array', items: { type: 'string' } },
          },
          required: ['dryRun', 'planned', 'bytes', 'moved', 'failed', 'skipped', 'unknownIds'],
        },
        render: (_args, value) => [
          {
            type: 'text',
            text: value.dryRun
              ? `Dry run: ${value.planned.length} item(s), ${(value.bytes / 1048576).toFixed(1)} MiB would be moved to the Trash. Nothing was touched.`
              : `Moved ${value.moved.length} item(s) to the Trash` +
                (value.failed.length > 0 ? `, ${value.failed.length} failed` : '') +
                (value.skipped.length > 0 ? `, ${value.skipped.length} skipped` : '') +
                '.',
          },
        ],
      },
      async execute(args) {
        const env = toolEnv(storageEnv)
        // Fresh scan: the plan a cleanup acts on is the one computed here, never one
        // the caller remembered from an earlier turn.
        const { report, plan } = scanWithPlan(env)
        const wanted = Array.isArray(args.items) ? args.items : []
        const all = wanted.length === 1 && wanted[0] === 'all'
        const byId = new Map(plan.items.map((item) => [item.id, item]))
        const unknownIds = []
        const chosen = []
        if (!all) {
          for (const id of wanted) {
            const item = byId.get(id)
            if (item === undefined) unknownIds.push(id)
            else if (!chosen.some((existing) => existing.id === item.id)) chosen.push(item)
          }
        }
        const selected = all ? plan.items : chosen
        const bytes = selected.reduce((sum, item) => sum + (item.bytes || 0), 0)
        const planned = selected.map((item) => ({
          id: item.id,
          path: item.path,
          bytes: item.bytes,
          reason: item.reason,
        }))
        if (args.confirm !== true) {
          return { dryRun: true, planned, bytes, moved: [], failed: [], skipped: [], unknownIds }
        }
        const result = await trashPaths(
          selected.map((item) => item.path),
          { roots: safetyRoots(env.home, report.host.appSupport) },
        )
        return {
          dryRun: false,
          planned,
          bytes,
          moved: result.moved,
          failed: result.failed.map((entry) => ({
            path: Array.isArray(entry.paths) ? entry.paths.join(', ') : String(entry.path || ''),
            reason: String(entry.reason || 'unknown'),
          })),
          skipped: result.skipped.map((entry) => ({
            path: String(entry.path || ''),
            reason: String(entry.reason || 'unknown'),
          })),
          unknownIds,
        }
      },
      presentCall: (args) => ({
        card: 'generic',
        title: args.confirm === true ? 'Reclaim storage' : 'Preview storage cleanup',
        kind: 'other',
        rawInput: args.items,
      }),
    }),
  )

  ctx.tools.register(
    defineStorageTool({
      name: 'storage_open',
      description:
        'Reveal a file or directory from the storage inventory in the OS file manager (Finder on macOS) so the user can inspect it themselves. Read-only; nothing is moved.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: {
            type: 'string',
            description: 'An absolute path from a storage_report candidate.',
          },
        },
        required: ['path'],
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string' },
            revealed: { type: 'boolean' },
          },
          required: ['path', 'revealed'],
        },
        render: (_args, value) => [
          { type: 'text', text: value.revealed ? `Revealed ${value.path}` : `Could not reveal ${value.path}` },
        ],
      },
      async execute(args) {
        const env = toolEnv(storageEnv)
        const { report, plan } = scanWithPlan(env)
        const roots = safetyRoots(env.home, report.host.appSupport)
        const allowed =
          plan.items.some((item) => item.path === args.path) ||
          roots.some((root) => typeof args.path === 'string' && args.path.startsWith(root + '/'))
        if (!allowed) throw new Error(`storage_open refuses "${args.path}": not part of the storage inventory`)
        const { spawnSync } = await import('node:child_process')
        const child = spawnSync('open', ['-R', args.path], { stdio: 'ignore' })
        return { path: args.path, revealed: child.status === 0 }
      },
      presentCall: (args) => ({ card: 'generic', title: 'Reveal in Finder', kind: 'other', rawInput: args.path }),
    }),
  )
}
