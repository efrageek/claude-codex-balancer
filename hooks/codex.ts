// Building and recognizing the `codex exec` command the plugin runs.

export type CodexTier = 'safe' | 'full'
export const TIERS: readonly CodexTier[] = ['safe', 'full']
export const isTier = (s: unknown): s is CodexTier => TIERS.includes(s as CodexTier)

// The tier a job runs in: what the model asked for, else the one the person picked in the band.
export function pickTier(requested: string | undefined, isTrusted: boolean): string {
  return requested ?? (isTrusted ? 'full' : 'safe')
}

// The band's effort is a ceiling: a job may ask for less, never more. Unknown levels pass through for the caller to reject.
export function capEffort(requested: string | undefined, ceiling: string, order: readonly string[]): string {
  if (!requested) return ceiling
  const at = order.indexOf(requested)
  const max = order.indexOf(ceiling)
  return at > max && max >= 0 ? ceiling : requested
}

// Highest supported level not above the request; undefined when none fits.
export function fitEffort(effort: string, supported: readonly string[], order: readonly string[]): string | undefined {
  if (supported.includes(effort)) return effort
  return [...order].reverse().find(l => supported.includes(l) && order.indexOf(l) <= order.indexOf(effort))
}

export function shellQuote(s: string): string {
  return `'${s.replaceAll("'", `'\\''`)}'`
}

export type CodexRun = {
  model: string
  effort: string
  dir: string
  prompt: string
  tier: CodexTier
  writableDirs?: readonly string[]
  isNetworked?: boolean
}

// safe: no user config, so none of its plugins, MCP servers or hooks; full: the user's whole Codex.
// Both stay in the workspace-write sandbox; no tier ever passes danger-full-access or --dangerously-*.
export function codexCommand(run: CodexRun): string {
  const isFull = run.tier === 'full'
  return [
    'codex exec',
    isFull ? '' : '--ignore-user-config',
    run.model ? `-m ${shellQuote(run.model)}` : '',
    '-c',
    shellQuote(`model_reasoning_effort="${run.effort}"`),
    isFull && run.isNetworked ? `-c ${shellQuote('sandbox_workspace_write.network_access=true')}` : '',
    '-s workspace-write -C',
    shellQuote(run.dir),
    ...(isFull ? (run.writableDirs ?? []).map(d => `--add-dir ${shellQuote(d)}`) : []),
    '--',
    shellQuote(run.prompt),
    '< /dev/null',
  ]
    .filter(Boolean)
    .join(' ')
}

// `codex` or `codex.js` as a standalone word anywhere (so `timeout 20 codex`, `$(which codex)` and wrappers count),
// or a path ending in /codex or /codex.js. Not a path segment (~/.codex/sessions, codex-mod) or part of a name (codex_run).
// Best effort: prose like `-m "fix codex runs"` is refused too, and a determined bypass still meets the permission prompt.
export function isCodexCommand(command: string): boolean {
  return /(^|[^\w./-])codex(\.js)?(?=$|[\s;&|)`'"])|\/codex(\.js)?(?=$|[\s;&|)`'"])/.test(command)
}

// Minutes a running job has been silent, once that reaches `stallMs`; undefined while it is fine or done.
// Silence counts from Codex's last write to its rollout, or from the start while it has none yet.
export function stalledFor(now: number, startedAt: number, lastWriteMs: number | undefined, isDone: boolean, stallMs: number) {
  if (isDone) return undefined
  const silent = now - (lastWriteMs ?? startedAt)
  return silent >= stallMs ? Math.floor(silent / 60_000) : undefined
}

// A pgrep -f pattern for the Codex process of a job: `exec ... -C <dir>` with the dir taken literally.
export function codexProcessPattern(dir: string): string {
  return `exec .*-C ${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`
}

// True when `path` is `root` or inside it; both already resolved (realPath).
export function isInside(path: string, root: string): boolean {
  const r = root.endsWith('/') ? root : `${root}/`
  return path === root || path.startsWith(r)
}

export function homeRisk(path: string, home: string): string | undefined {
  path = path.toLowerCase()
  home = home.toLowerCase()
  if (isInside(home, path)) return 'is too broad (it holds your home folder).'
  if (isInside(path, home) && path.slice(home.length + 1).startsWith('.')) return 'is inside a hidden folder under your home.'
}
