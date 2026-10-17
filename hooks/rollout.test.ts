import { expect, test } from 'claude-code/testing'

import { renderRollout, rolloutMeta, shellQuote } from './rollout'

const ev = (payload: unknown) => JSON.stringify({ type: 'event_msg', payload })
const done = (item: unknown) => ev({ type: 'item_completed', item })

test('renders messages, commands, diffs and completion', () => {
  const jsonl = [
    'cut {partial line',
    done({ type: 'UserMessage', content: [{ type: 'text', text: 'Read TASK.md' }] }),
    done({ type: 'AgentMessage', content: [{ type: 'Text', text: 'On it.' }], phase: 'commentary' }),
    done({ type: 'CommandExecution', command: ['/bin/bash', '-lc', 'ls'], aggregated_output: 'a ``` b', exit_code: 2 }),
    done({ type: 'FileChange', changes: { '/r/x.ts': { type: 'update', unified_diff: '@@ -1 +1 @@\n-a\n+b' } } }),
    done({ type: 'AgentMessage', content: [{ type: 'Text', text: 'Done.' }], phase: 'final_answer' }),
    ev({ type: 'task_complete', duration_ms: 4200 }),
  ].join('\n')
  const r = renderRollout(jsonl)
  expect(r.isDone).toBe(true)
  expect(r.durationMs).toBe(4200)
  expect(r.markdown).toContain('> Read TASK.md')
  expect(r.markdown).toContain('**$** `ls` ✗ exit 2')
    expect(r.markdown).toContain('````\na ``` b\n````') // fence outgrows the backticks inside
  expect(r.markdown).toContain('**✎ update** `/r/x.ts`')
  expect(r.markdown).toContain('### Final answer\n\nDone.')
  expect(r.markdown).toContain('**Codex:** On it.')
})

test('a long rollout keeps its newest items', () => {
  const big = done({ type: 'AgentMessage', content: [{ type: 'Text', text: 'x'.repeat(40_000) }] })
  const last = done({ type: 'AgentMessage', content: [{ type: 'Text', text: 'final' }], phase: 'final_answer' })
  const r = renderRollout([big, big, big, last].join('\n'))
  expect(r.markdown.length < 100_000).toBe(true)
  expect(r.markdown).toContain('final')
  expect(r.markdown).toContain('earlier steps hidden')
})

test('a rollout still being written is not done', () => {
  expect(renderRollout('').isDone).toBe(false)
  expect(renderRollout('').markdown).toContain('not written anything yet')
})

test('long command output keeps its tail', () => {
  const out = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n')
  const r = renderRollout(done({ type: 'CommandExecution', command: ['bash', '-lc', 'seq 30'], aggregated_output: out, exit_code: 0 }))
  expect(r.markdown).toContain('… 18 more lines')
  expect(r.markdown).toContain('line 30')
  expect(r.markdown.includes('line 5\n')).toBe(false)
})

test('meta and quoting', () => {
  const meta = rolloutMeta(JSON.stringify({ type: 'session_meta', payload: { cwd: '/w', timestamp: '2026-10-17T10:06:16.133Z' } }))
  expect(meta).toEqual({ cwd: '/w', startedAt: Date.parse('2026-10-17T10:06:16.133Z') })
  expect(shellQuote("it's")).toBe(`'it'\\''s'`)
})
