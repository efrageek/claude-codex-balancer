import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const TOOL = 'mcp__balancer__codex_run'

function jobMocks(on: On, realPaths: Record<string, string> = {}) {
  mock.clock(on)
  mock.env(on, { HOME: '/home/test' })
  const calls = { questions: [] as string[], commands: [] as string[] }
  on('session.cwd', () => ({ value: '/w/repo' }))
  on('process.run', (_$, e) => {
    expect(e.argv).toEqual(['printenv', 'HOME'])
    return { value: { stdout: '/home/test\n', stderr: '', exitCode: 0, isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('fs.stat', (_$, e) => ({
    value: {
      kind: e.path.endsWith('/TASK.md') || e.path === '/extra/file' ? 'file' as const : 'dir' as const,
      realPath: e.resolve ? realPaths[e.path] ?? e.path : undefined, size: 0, mtimeMs: 0, isLink: e.path in realPaths,
    },
  }))
  on('tool.check', () => ({ decision: 'ask' as const }))
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => {
    calls.questions.push(e.questions[0]!.question)
    return { result: { questions: e.questions, answers: { [e.questions[0]!.question]: 'Run' } } }
  })
  on('tool.call', { tool: 'Bash' }, (_$, e) => {
    calls.commands.push(e.command)
    return { result: { stdout: 'started', stderr: '', interrupted: false } }
  })
  return calls
}

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

test('scout always runs on haiku; coder is refused in full mode', { options: { exploreAgent: 'scout', codeAgent: 'coder' } }, async ($, on) => {
  mock.clock(on)
  on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit' }))
  const scout = await $.agent.spawn({ prompt: 'map the repo', subagentType: 'scout', description: 'map' } as never)
  expect(scout.model).toBe('haiku')
  const explore = await $.agent.spawn({ prompt: 'map', subagentType: 'Explore', description: 'map' } as never)
  expect(explore.model).toBe('haiku')

  const light = await $.agent.spawn({ prompt: 'fix it', subagentType: 'coder', description: 'fix' } as never)
  expect(light.deny).toBe(undefined)

  await $.command.run({ command: 'balance', args: 'full' } as never)
  const full = await $.agent.spawn({ prompt: 'fix it', subagentType: 'coder', description: 'fix' } as never)
  expect(full.deny).toContain('codex_run')
  expect(full.deny).toContain('launch coder again')
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

test('off leaves subagents alone', { options: { exploreAgent: 'scout' } }, async ($, on) => {
  mock.clock(on)
  on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit' }))
  await $.command.run({ command: 'balance', args: 'off' } as never)
  const scout = await $.agent.spawn({ prompt: 'map', subagentType: 'scout', description: 'map' } as never)
  expect(scout.model).toBe('inherit')
})

test('default Explore runs on haiku and full allows general-purpose', async ($, on) => {
  mock.clock(on)
  on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit' }))
  await $.command.run({ command: 'balance', args: 'full' } as never)
  expect((await $.agent.spawn({ prompt: 'map', subagentType: 'Explore', description: 'map' } as never)).model).toBe('haiku')
  expect((await $.agent.spawn({ prompt: 'fix', subagentType: 'general-purpose', description: 'fix' } as never)).deny).toBe(undefined)
})

test('unset exploration still forces built-in Explore onto haiku', { options: { exploreAgent: '' } }, async ($, on) => {
  mock.clock(on)
  on('agent.spawn', (_$, e) => ({ model: e.model ?? 'inherit' }))
  expect((await $.agent.spawn({ prompt: 'map', subagentType: 'Explore', description: 'map' } as never)).model).toBe('haiku')
})

for (const unlocked of [false, true]) {
  test(`safe jobs outside the session are denied with full ${unlocked ? 'unlocked' : 'locked'}`, async ($, on) => {
    const calls = jobMocks(on)
    if (unlocked) await $.command.run({ command: 'codex-trust', args: 'full', origin: { kind: 'composer' } } as never)
    const r = await $.tool.call({ tool: TOOL, dir: '/outside', capabilities: 'safe' } as never)
    expect(r.deny ?? r.text).toContain('outside this session')
    expect(calls.questions).toEqual([])
    expect(calls.commands).toEqual([])
  })
}

for (const dir of ['/home/test/.ssh', '/home/test/.ssh/keys', '/home/test/.config/app', '/home/test/.codex']) {
  test(`full refuses hidden home writable directory ${dir}`, async ($, on) => {
    const calls = jobMocks(on)
    await $.command.run({ command: 'codex-trust', args: 'full', origin: { kind: 'composer' } } as never)
    const r = await $.tool.call({ tool: TOOL, dir: '/w/repo', writable_dirs: [dir] } as never)
    expect(r.deny ?? r.text).toContain('hidden folder under your home')
    expect(calls.commands).toEqual([])
  })
}

for (const real of ['/home/test/.config/x', '/home/test', '/home', '/']) {
  test(`full refuses an outside job directory resolved to ${real}`, async ($, on) => {
    const calls = jobMocks(on, { '/outside': real })
    await $.command.run({ command: 'codex-trust', args: 'full', origin: { kind: 'composer' } } as never)
    const r = await $.tool.call({ tool: TOOL, dir: '/outside' } as never)
    expect(r.deny ?? r.text).toContain(`dir ${real} ${real.includes('/.config/') ? 'is inside a hidden folder under your home' : 'is too broad'}`)
    expect(calls.questions).toEqual([])
    expect(calls.commands).toEqual([])
  })
}

test('full refuses a writable symlink into a hidden home folder', async ($, on) => {
  const calls = jobMocks(on, { '/extra/link': '/home/test/.ssh' })
  await $.command.run({ command: 'codex-trust', args: 'full', origin: { kind: 'composer' } } as never)
  const r = await $.tool.call({ tool: TOOL, dir: '/w/repo', writable_dirs: ['/extra/link'] } as never)
  expect(r.deny ?? r.text).toContain('writable dir /home/test/.ssh is inside a hidden folder under your home')
  expect(calls.questions).toEqual([])
  expect(calls.commands).toEqual([])
})

for (const capabilities of ['safe', 'full']) {
  test(`${capabilities} keeps allowing a job inside the session's hidden home folder`, async ($, on) => {
    const calls = jobMocks(on, { '/w/repo': '/home/test/.config/x' })
    await $.command.run({ command: 'codex-trust', args: 'full', origin: { kind: 'composer' } } as never)
    const r = await $.tool.call({ tool: TOOL, dir: '/w/repo', capabilities } as never)
    expect(r.deny).toBe(undefined)
    expect(calls.commands[0]).toContain("-C '/home/test/.config/x'")
  })
}

test('full refuses a writable path that is a file', async ($, on) => {
  const calls = jobMocks(on)
  await $.command.run({ command: 'codex-trust', args: 'full', origin: { kind: 'composer' } } as never)
  const r = await $.tool.call({ tool: TOOL, dir: '/w/repo', writable_dirs: ['/extra/file'] } as never)
  expect(r.deny ?? r.text).toContain('must be a directory')
  expect(calls.commands).toEqual([])
})

for (const target of ['safe dir', 'full dir', 'writable dir']) {
  test(`${target} refuses resolved control and bidi characters before confirmation`, async ($, on) => {
    const realPaths: Record<string, string> = {}
    const calls = jobMocks(on, realPaths)
    await $.command.run({ command: 'codex-trust', args: 'full', origin: { kind: 'composer' } } as never)
    for (const char of ['\u0000', '\u0009', '\u000a', '\u001b', '\u001f', '\u007f', '\u0085', '\u009f', '\u202a', '\u202e', '\u2066', '\u2069']) {
      const writable = target === 'writable dir'
      realPaths[writable ? '/extra/link' : '/w/repo'] = `/w/repo/unsafe${char}path`
      const r = await $.tool.call({
        tool: TOOL, dir: '/w/repo', capabilities: target === 'safe dir' ? 'safe' : 'full',
        ...(writable ? { writable_dirs: ['/extra/link'] } : {}),
      } as never)
      expect(r.deny ?? r.text).toBe(`balancer: ${writable ? 'writable dir' : 'dir'} must not contain control or bidi characters.`)
    }
    expect(calls.questions).toEqual([])
    expect(calls.commands).toEqual([])
  })
}

test('safe ignores writable dirs in validation, confirmation and the command', async ($, on) => {
  const calls = jobMocks(on)
  const r = await $.tool.call({ tool: TOOL, dir: '/w/repo', writable_dirs: ['relative', '/extra/file'], network: true } as never)
  expect(r.deny).toBe(undefined)
  expect(calls.questions.length).toBe(1)
  expect(calls.questions[0]).toContain('safe tier, default/xhigh')
  expect(calls.questions[0]!.includes('also writes')).toBe(false)
  expect(calls.questions[0]!.includes('network on')).toBe(false)
  expect(calls.commands.length).toBe(1)
  expect(calls.commands[0]!.includes('--add-dir')).toBe(false)
  expect(calls.commands[0]!.includes(' -m ')).toBe(false)
  expect(r.result).toContain('read REPORT.md and review the change yourself')
  expect(r.result).toContain('writable_dirs and network apply only in the full tier; ignored.')
})

for (const input of [{ writable_dirs: [] }, { network: false }]) {
  test(`safe reports an ignored ${Object.keys(input)[0]} even when empty or false`, async ($, on) => {
    jobMocks(on)
    const r = await $.tool.call({ tool: TOOL, dir: '/w/repo', ...input } as never)
    expect(r.deny).toBe(undefined)
    expect(r.result).toContain('writable_dirs and network apply only in the full tier; ignored.')
  })
}

test('full allows outside jobs and confirms extra dirs and network', async ($, on) => {
  const calls = jobMocks(on)
  await $.command.run({ command: 'codex-trust', args: 'full', origin: { kind: 'composer' } } as never)
  const r = await $.tool.call({ tool: TOOL, dir: '/outside', writable_dirs: ['/home/test/projects/.cache'], network: true } as never)
  expect(r.deny).toBe(undefined)
  expect(calls.questions[0]).toContain('full tier')
  expect(calls.questions[0]).toContain('also writes /home/test/projects/.cache, network on')
  expect(calls.commands[0]).toContain("--add-dir '/home/test/projects/.cache'")
  expect(r.result).not.toContain('ignored.')
})

test('codex_run fits unsupported effort instead of denying', async ($, on) => {
  const calls = jobMocks(on)
  on('state.get', { plugin: 'balancer', key: 'models' }, () => ({ value: { value: [{ slug: 'account-model', efforts: ['high', 'low', 'medium'] }], version: 1 } }))
  const r = await $.tool.call({ tool: TOOL, dir: '/w/repo', codex_effort: 'ultra' } as never)
  expect(r.deny).toBe(undefined)
  expect(calls.questions[0]).toContain('account-model/high')
  expect(calls.commands[0]).toContain("-m 'account-model'")
  expect(calls.commands[0]).toContain('model_reasoning_effort="high"')
  expect(r.result).toContain('effort capped at xhigh by the band')
  expect(r.result).toContain('has no xhigh; effort fitted to high')
})

test('/codex uses the same effort fit', async ($, on) => {
  mock.clock(on)
  on('state.get', { plugin: 'balancer', key: 'models' }, () => ({ value: { value: [{ slug: 'account-model', efforts: ['high', 'low', 'medium'] }], version: 1 } }))
  const r = await $.command.run({ command: 'codex', args: '' } as never)
  expect(r.text).toContain('account-model has no xhigh; effort set to high')
})

for (const args of ['low', 'account-model low']) {
  test(`/codex ${args} saves only the lowest supported fallback, which a later job can use`, async ($, on) => {
    const calls = jobMocks(on)
    const saved: string[] = []
    on('state.get', { plugin: 'balancer', key: 'models' }, () => ({ value: { value: [{ slug: 'account-model', efforts: ['high', 'medium'] }], version: 1 } }))
    on('state.set', { plugin: 'balancer', key: 'codexEffort' }, (_$, e, next) => {
      saved.push(e.value)
      return next(e)
    })
    const r = await $.command.run({ command: 'codex', args } as never)
    expect(r.text).toContain('account-model has no low; effort set to medium (lowest supported level)')
    expect(saved).toEqual(['medium'])
    expect((await $.command.run({ command: 'codex', args: '' } as never)).text).toContain('codex account-model/medium')
    const job = await $.tool.call({ tool: TOOL, dir: '/w/repo' } as never)
    expect(job.deny).toBe(undefined)
    expect(calls.commands[0]).toContain('model_reasoning_effort="medium"')
  })
}

test('effort fitting never raises a job above the band ceiling', { options: { codexEffort: 'low' } }, async ($, on) => {
  const calls = jobMocks(on)
  on('state.get', { plugin: 'balancer', key: 'models' }, () => ({ value: { value: [{ slug: 'account-model', efforts: ['high'] }], version: 1 } }))
  const r = await $.tool.call({ tool: TOOL, dir: '/w/repo' } as never)
  expect(r.deny ?? r.text).toContain('no supported effort at or below low')
  expect(calls.commands).toEqual([])
})

test('session model precedes configuration, which precedes the first listed model', { options: { codexModel: 'configured' } }, async ($, on) => {
  mock.clock(on)
  on('state.get', { plugin: 'balancer', key: 'models' }, () => ({ value: { value: [{ slug: 'listed', efforts: ['xhigh'] }], version: 1 } }))
  expect((await $.command.run({ command: 'codex', args: '' } as never)).text).toContain('codex configured/xhigh')
  expect((await $.command.run({ command: 'codex', args: 'picked' } as never)).text).toContain('codex picked/xhigh')
})

for (const instructions of [undefined, 'Follow the custom task.']) {
  test(`extra instructions follow the ${instructions ? 'custom' : 'default'} prompt and name the configured reviewer`, {
    options: { codexInstructions: 'Use the house style.', reviewAgent: 'Reviewer' },
  }, async ($, on) => {
    const calls = jobMocks(on)
    const r = await $.tool.call({ tool: TOOL, dir: '/w/repo', instructions } as never)
    const prompt = instructions ?? 'Read TASK.md and do it. When done, write REPORT.md: what changed, tests run and their result, what you skipped.'
    expect(calls.commands[0]).toContain(`${prompt}\nUse the house style.`)
    expect(r.result).toContain('read REPORT.md and run one `Reviewer` review')
  })
}

test('codex_run fails closed when validation throws', async ($, on) => {
  mock.clock(on)
  on('fs.stat', (_$, e) => ({ value: { kind: 'file', realPath: e.path, size: 0, mtimeMs: 0, isLink: false } }))
  on('session.cwd', () => { throw new Error('cwd unavailable') })
  const r = await $.tool.call({ tool: TOOL, dir: '/w/repo' } as never)
  expect(r.deny ?? r.text).toContain('could not validate or start')
})

test('prompt.submit passes through without a note when reading state fails', async ($, on) => {
  on('state.get', () => { throw new Error('state unavailable') })
  on('prompt.submit', (_$, e) => ({ text: e.text, context: e.context }))
  const r = await $.prompt.submit({ text: 'continue', context: ['existing'], wait: false, origin: { kind: 'composer' } })
  expect(r.text).toBe('continue')
  expect(r.context).toEqual(['existing'])
})
