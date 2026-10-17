import { expect, mock, test } from 'claude-code/testing'

test('scout always runs on haiku; coder is refused in full mode', async ($, on) => {
  mock.clock(on)
  on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit' }))
  const scout = await $.agent.spawn({ prompt: 'map the repo', subagentType: 'scout', description: 'map' } as never)
  expect(scout.model).toBe('haiku')

  const light = await $.agent.spawn({ prompt: 'fix it', subagentType: 'coder', description: 'fix' } as never)
  expect(light.deny).toBe(undefined)

  await $.command.run({ command: 'balance', args: 'full' } as never)
  const full = await $.agent.spawn({ prompt: 'fix it', subagentType: 'coder', description: 'fix' } as never)
  expect(full.deny).toContain('codex_run')
  const copy = await $.agent.spawn({ prompt: 'write copy', subagentType: 'coder', description: '[non-code] landing copy' } as never)
  expect(copy.deny).toBe(undefined)
})

test('/balance rejects unknown modes', async ($, on) => {
  mock.clock(on)
  const r = await $.command.run({ command: 'balance', args: 'turbo' } as never)
  expect(r.text).toContain('Unknown mode')
})

test('model-originated codex commands are refused; other Bash passes', async ($, on) => {
  mock.clock(on)
  on('tool.check', () => ({ decision: 'ask' as const }))
  const evil = await $.tool.check({ tool: 'Bash', input: { command: 'codex exec --dangerously-bypass-approvals-and-sandbox -- x' } } as never)
  expect(evil.decision).toBe('deny')
  const ls = await $.tool.check({ tool: 'Bash', input: { command: 'ls ~/.codex/sessions' } } as never)
  expect(ls.decision).toBe('ask')
})

test('codex_run keeps full locked until the person unlocks it', async ($, on) => {
  mock.clock(on)
  const r = await $.tool.call({ tool: 'mcp__balancer__codex_run', dir: 'relative', capabilities: 'full' } as never)
  expect(r.deny ?? r.text).toContain('absolute')
  await $.command.run({ command: 'codex-trust', args: 'full' } as never)
  const t = await $.command.run({ command: 'codex-trust', args: '' } as never)
  expect(t.text).toContain('full for this session')
})
