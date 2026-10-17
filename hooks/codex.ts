// Building and recognizing the `codex exec` command the plugin runs.

export type CodexTier = 'safe' | 'full'
export const TIERS: readonly CodexTier[] = ['safe', 'full']
export const isTier = (s: unknown): s is CodexTier => TIERS.includes(s as CodexTier)

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
    '-m',
    shellQuote(run.model),
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

// `codex` in command position (line start, after ; & | ( ` or a quote, or after npx/env/sudo/...), bare or by path.
// Not a path segment (~/.codex/sessions) or a word in prose ("fix codex runs").
export function isCodexCommand(command: string): boolean {
  return /(^|[\n;&|(`'"]\s*|\b(npx|exec|env|sudo|time|nohup|xargs|command)\s+(\S+=\S*\s+)*)(\S*\/)?codex(\s|$)/.test(command)
}

// True when `path` is `root` or inside it; both already resolved (realPath).
export function isInside(path: string, root: string): boolean {
  const r = root.endsWith('/') ? root : `${root}/`
  return path === root || path.startsWith(r)
}
