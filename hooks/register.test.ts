import { expect, mock, test } from 'claude-code/testing'

test('system policy stays fixed when mode, model and effort change; subagents get none', async ($, on) => {
  mock.clock(on)
  const base = { id: 'base', text: 'existing system section', scope: 'shared' as const }
  const facts = { model: 'sonnet', promptModel: 'sonnet', surfaces: [], tools: ['Agent'], outputStyle: null, traits: [] }
  on('prompt.compose', () => ({ sections: [base] }))
  await $.command.run({ command: 'balance', args: 'medium' } as never)
  const first = await $.prompt.compose(facts)
  const policy = first.sections.find(s => s.id === 'balancer:policy')
  expect(policy?.text).toContain('# Balancer: subagent routing')
  expect(policy?.scope).toBe('session')
  expect(first.sections[0]).toEqual(base)

  await $.command.run({ command: 'codex', args: 'gpt-6-sol low' } as never)
  for (const mode of ['full', 'auto', 'off']) {
    await $.command.run({ command: 'balance', args: mode } as never)
    expect((await $.prompt.compose(facts)).sections).toEqual(first.sections)
  }
  expect((await $.prompt.compose({ ...facts, tools: ['Read'] })).sections).toEqual([base])
})

test('every submitted prompt gets a note with the current mode, model and effort', async ($, on) => {
  mock.clock(on)
  const input = {
    text: '/review cache', command: { name: 'review', args: 'cache' }, isMeta: true as const,
    context: ['existing context'], wait: false, origin: { kind: 'composer' as const },
  }
  on('prompt.submit', (_$, e) => {
    expect(e.text).toBe(input.text)
    expect(e.command).toEqual(input.command)
    expect(e.isMeta).toBe(input.isMeta)
    return { text: e.text, context: e.context }
  })
  await $.command.run({ command: 'codex', args: 'gpt-6.1-sol xhigh' } as never)
  await $.command.run({ command: 'balance', args: 'full' } as never)
  for (let i = 0; i < 2; i++) {
    const prompt = await $.prompt.submit(input)
    expect(prompt.text).toBe(input.text)
    expect(prompt.context).toEqual(['existing context', 'Balancer note: mode full (manual). Codex default gpt-6.1-sol at effort xhigh.'])
  }
  await $.command.run({ command: 'codex', args: 'gpt-6-sol low' } as never)
  await $.command.run({ command: 'balance', args: 'medium' } as never)
  expect((await $.prompt.submit(input)).context).toEqual([
    'existing context', 'Balancer note: mode medium (manual). Codex default gpt-6-sol at effort low.',
  ])
  await $.command.run({ command: 'balance', args: 'off' } as never)
  expect((await $.prompt.submit({ ...input, context: undefined })).context).toEqual(['Balancer note: off.'])
})

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
  // A command raised from anywhere but the person's prompt cannot unlock full.
  const relayed = await $.command.run({ command: 'codex-trust', args: 'full' } as never)
  expect(relayed.text).toContain('only the person at the prompt')
  const t = await $.command.run({ command: 'codex-trust', args: '' } as never)
  expect(t.text).toContain('tier: safe')
})

test('off leaves subagents alone', async ($, on) => {
  mock.clock(on)
  on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit' }))
  await $.command.run({ command: 'balance', args: 'off' } as never)
  const scout = await $.agent.spawn({ prompt: 'map', subagentType: 'scout', description: 'map' } as never)
  expect(scout.model).toBe('inherit')
})
