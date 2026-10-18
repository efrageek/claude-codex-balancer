export type Mode = 'off' | 'auto' | 'light' | 'medium' | 'full'
export type Win = { kind: string; percentUsed: number; resetsAt?: string; minutes?: number }
export type CodexModel = { slug: string; efforts: string[] }
export type CodexJob = {
  id: string
  dir: string
  model: string
  effort: string
  startedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    balancer: {
      mode: Mode
      codexModel: string
      codexEffort: string
      claude: Win[]
      codex: Win[]
      codexReadAt: number
      codexCredits: number
      /** Band shows only its control row. */
      isCompact: boolean
      /** Codex tier the person unlocked for this session; never persisted. */
      trust: 'safe' | 'full'
      models: CodexModel[]
      jobs: CodexJob[]
      /** Jobs unfolded in the transcript pane. */
      expanded: string[]
      /** Bumped while the pane is open, so it re-reads a rollout Codex is still writing. */
      tick: number
    }
  }
}
