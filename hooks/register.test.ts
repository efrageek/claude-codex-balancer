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
