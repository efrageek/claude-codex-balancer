// Turns a Codex session rollout (~/.codex/sessions/**/*.jsonl) into Markdown for the transcript pane.

export const MAX_MD = 90_000
const OUT_LINES = 12
const CMD_LINES = 8
const DIFF_LINES = 30

// A fence longer than any backtick run inside, so command output never closes it early.
function fence(text: string, lang = ''): string {
  const run = Math.max(2, ...(text.match(/`+/g) ?? []).map(s => s.length))
  const f = '`'.repeat(run + 1)
  return `${f}${lang}\n${text.replace(/\n+$/, '')}\n${f}`
}

// Inline code that survives backticks inside it.
function code(text: string): string {
  const run = Math.max(0, ...(text.match(/`+/g) ?? []).map(s => s.length))
  const f = '`'.repeat(run + 1)
  return run ? `${f} ${text} ${f}` : `${f}${text}${f}`
}

const lines = (s: string) => s.replace(/\n+$/, '').split('\n')

// Keeps the head (a command reads top-down) or the tail (output ends with the result).
function keep(s: string, n: number, end: 'head' | 'tail'): string {
  const ls = lines(s).map(l => (l.length > 240 ? `${l.slice(0, 240)}…` : l))
  if (ls.length <= n) return ls.join('\n')
  const hidden = `… ${ls.length - n} more lines`
  return end === 'head' ? [...ls.slice(0, n), hidden].join('\n') : [hidden, ...ls.slice(-n)].join('\n')
}

type Item = Record<string, unknown> & { type: string }
type Text = { text?: string }

const texts = (content: unknown) =>
  (Array.isArray(content) ? (content as Text[]) : []).map(c => c.text ?? '').filter(Boolean).join('\n')

function command(it: Item): string {
  const cmd = (Array.isArray(it.command) ? String(it.command[it.command.length - 1]) : String(it.command ?? '')).trim()
  const exit = it.exit_code ?? it.exitCode
  const mark = exit === undefined || exit === 0 ? '✓' : `✗ exit ${String(exit)}`
  const out = String(it.aggregated_output ?? '').trim()
  const isOneLine = !cmd.includes('\n') && cmd.length <= 160
  const head = isOneLine ? `**$** ${code(cmd)} ${mark}` : `**$** ${mark}\n${fence(keep(cmd, CMD_LINES, 'head'), 'bash')}`
  return out ? `${head}\n${fence(keep(out, OUT_LINES, 'tail'))}` : head
}

function item(it: Item): string | undefined {
  switch (it.type) {
    case 'UserMessage':
      return `**Task**\n\n${keep(texts(it.content), 20, 'head').replace(/^/gm, '> ')}`
    case 'AgentMessage': {
      const body = texts(it.content)
      return it.phase === 'final_answer' ? `---\n\n### Final answer\n\n${body}` : `**Codex:** ${body}`
    }
    case 'Reasoning': {
      const summary = texts((it.summary_text as unknown[] | undefined)?.map(t => (typeof t === 'string' ? { text: t } : t)))
      return summary ? `_${summary.replace(/\n+/g, ' ')}_` : undefined
    }
    case 'CommandExecution':
      return command(it)
    case 'FileChange': {
      const changes = (it.changes ?? {}) as Record<string, { type?: string; unified_diff?: string }>
      return Object.entries(changes)
        .map(([path, ch]) => `**✎ ${ch.type ?? 'change'}** ${code(path)}${ch.unified_diff ? `\n${fence(keep(ch.unified_diff, DIFF_LINES, 'head'), 'diff')}` : ''}`)
        .join('\n\n')
    }
    case 'McpToolCall':
      return `**tool** ${code(`${String(it.server)}.${String(it.tool)}`)} ${it.status === 'completed' ? '✓' : String(it.status ?? '')}`
    default:
      return undefined
  }
}

export type Parsed = { parts: string[]; isDone: boolean; durationMs?: number }
export type Rendered = { markdown: string; isDone: boolean; durationMs?: number }

export function parseRollout(jsonl: string): Parsed {
  const parts: string[] = []
  let isDone = false
  let durationMs: number | undefined
  for (const line of jsonl.split('\n')) {
    if (!line.includes('"event_msg"')) continue
    let d: { type?: string; payload?: Record<string, unknown> }
    try {
      d = JSON.parse(line)
    } catch {
      continue // a cut first line from tail, or a line still being written
    }
    const p = d.payload ?? {}
    if (p.type === 'item_completed' && p.item) {
      const md = item(p.item as Item)
      if (md) parts.push(md)
    } else if (p.type === 'task_complete') {
      isDone = true
      durationMs = typeof p.duration_ms === 'number' ? p.duration_ms : undefined
    }
  }
  return { parts, isDone, durationMs }
}

// A tree draws only its first 100k characters: keep the newest items, the final answer among them.
export function trimParts(parts: readonly string[], max = MAX_MD): string {
  let size = 0
  let from = parts.length
  while (from > 0 && size + (parts[from - 1]?.length ?? 0) < max) size += parts[--from]?.length ?? 0
  const shown = parts.slice(from)
  if (from > 0) shown.unshift(`_… ${from} earlier steps hidden_`)
  return shown.join('\n\n') || '_Codex has not written anything yet._'
}

export function renderRollout(jsonl: string, max = MAX_MD): Rendered {
  const { parts, isDone, durationMs } = parseRollout(jsonl)
  return { markdown: trimParts(parts, max), isDone, durationMs }
}

// The first line of a rollout is session_meta: whose cwd and start time tell which job it belongs to.
export function rolloutMeta(firstLine: string): { cwd?: string; startedAt?: number } {
  try {
    const p = JSON.parse(firstLine).payload ?? {}
    return { cwd: p.cwd, startedAt: p.timestamp ? Date.parse(p.timestamp) : undefined }
  } catch {
    return {}
  }
}

export function shellQuote(s: string): string {
  return `'${s.replaceAll("'", `'\\''`)}'`
}
