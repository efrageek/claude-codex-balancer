import { expect, test } from 'claude-code/testing'

import { capEffort, codexCommand, codexProcessPattern, fitEffort, homeRisk, isCodexCommand, isInside, pickTier, shellQuote, stalledFor } from './codex'

test('the band effort caps the requested effort', () => {
  const order = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']
  expect(capEffort('max', 'high', order)).toBe('high')
  expect(capEffort(undefined, 'high', order)).toBe('high')
  expect(capEffort('', 'high', order)).toBe('high')
  expect(capEffort('high', 'high', order)).toBe('high')
  expect(capEffort('low', 'high', order)).toBe('low')
  expect(capEffort('bogus', 'high', order)).toBe('bogus') // left for the caller's check to refuse
})

const base = { model: 'gpt-6.1-sol', effort: 'low', dir: '/w/repo', prompt: "do it's job" }

test('effort fits the model below the requested level regardless of cache order', () => {
  const order = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']
  expect(fitEffort('xhigh', ['high', 'low', 'medium'], order)).toBe('high')
  expect(fitEffort('medium', ['low', 'high'], order)).toBe('low')
  expect(fitEffort('high', ['low', 'high'], order)).toBe('high')
  expect(fitEffort('low', ['medium', 'high'], order)).toBe(undefined)
  expect(fitEffort('high', [], order)).toBe(undefined)
})

test('without a model Codex uses its own default', () => {
  const command = codexCommand({ ...base, model: '', tier: 'safe' })
  expect(command.includes(' -m ')).toBe(false)
  expect(command).toContain('codex exec --ignore-user-config -c ')
})

test('safe runs without the user config, full with it, never dangerous', () => {
  const safe = codexCommand({ ...base, tier: 'safe', writableDirs: ['/x'], isNetworked: true })
  expect(safe).toContain('codex exec --ignore-user-config -m ')
  expect(safe.includes('--add-dir')).toBe(false) // extras need the full tier
  expect(safe.includes('network_access')).toBe(false)
  const full = codexCommand({ ...base, tier: 'full', writableDirs: ['/x'], isNetworked: true })
  expect(full.includes('--ignore-user-config')).toBe(false)
  expect(full).toContain("--add-dir '/x'")
  expect(full).toContain("-c 'sandbox_workspace_write.network_access=true'")
  for (const cmd of [safe, full]) {
    expect(cmd).toContain("-s workspace-write -C '/w/repo'")
    expect(cmd).toContain("-- 'do it'\\''s job' < /dev/null")
    expect(/danger|bypass/.test(cmd)).toBe(false)
  }
})

test('recognizes codex as a command, not as a path', () => {
  expect(isCodexCommand('codex exec --dangerously-bypass-approvals-and-sandbox -- x')).toBe(true)
  expect(isCodexCommand('cd /tmp && npx codex exec x')).toBe(true)
  expect(isCodexCommand('/usr/bin/codex e x')).toBe(true)
  expect(isCodexCommand('ls ~/.codex/sessions')).toBe(false)
  expect(isCodexCommand('cat codex-notes.md')).toBe(false)
  expect(isCodexCommand("bash -c 'codex exec x'")).toBe(true)
  expect(isCodexCommand('ls && codex e x')).toBe(true)
  expect(isCodexCommand('env A=1 codex exec x')).toBe(true)
  // The two bypasses the security gate ran live, and other wrappers.
  expect(isCodexCommand('timeout 20 codex --version')).toBe(true)
  expect(isCodexCommand('node /home/u/.nvm/lib/node_modules/@openai/codex/bin/codex.js --version')).toBe(true)
  expect(isCodexCommand('nice -n 5 codex exec x')).toBe(true)
  expect(isCodexCommand('$(which codex) exec x')).toBe(true)
  expect(isCodexCommand('npx @openai/codex exec x')).toBe(true)
  expect(isCodexCommand(`python3 -c "subprocess.run(['codex','exec'])"`)).toBe(true)
  // Names and paths that only contain the word stay allowed.
  expect(isCodexCommand('cd ~/Documents/codex-mod && git status')).toBe(false)
  expect(isCodexCommand('grep -rn mcp__balancer__codex_run hooks')).toBe(false)
  // Accepted false positive: lowercase prose is refused too.
  expect(isCodexCommand('git commit -m "fix codex runs"')).toBe(true)
})

test('stall: silent long enough, never when done', () => {
  const min = 60_000
  expect(stalledFor(20 * min, 0, 10 * min, false, 15 * min)).toBe(undefined) // wrote 10 min ago
  expect(stalledFor(30 * min, 0, 10 * min, false, 15 * min)).toBe(20)
  expect(stalledFor(16 * min, 0, undefined, false, 15 * min)).toBe(16) // never opened a session
  expect(stalledFor(60 * min, 0, 0, true, 15 * min)).toBe(undefined)
  const pattern = new RegExp(codexProcessPattern('/w/my.repo'))
  expect(pattern.test("codex exec -m x -s workspace-write -C /w/my.repo -- 'p'")).toBe(true)
  expect(pattern.test('codex exec -C /w/myXrepo -- p')).toBe(false)
  expect(pattern.test('codex exec -C /w/my.repo2 -- p')).toBe(false)
})

test('the band tier is the default; the model can narrow it to safe', () => {
  expect(pickTier(undefined, false)).toBe('safe')
  expect(pickTier(undefined, true)).toBe('full')
  expect(pickTier('safe', true)).toBe('safe')
  expect(pickTier('full', false)).toBe('full') // still refused later: full stays locked until the person switches it on
})

test('inside a root', () => {
  expect(isInside('/a/b', '/a')).toBe(true)
  expect(isInside('/a', '/a')).toBe(true)
  expect(isInside('/ab', '/a')).toBe(false)
  expect(shellQuote("it's")).toBe(`'it'\\''s'`)
})

test('home risks reject ancestors and top-level hidden folders, allowing sibling prefixes and projects', () => {
  expect(homeRisk('/users/alice/.ssh', '/Users/alice')).toBe('is inside a hidden folder under your home.')
  expect(homeRisk('/USERS/alice', '/Users/alice')).toBe('is too broad (it holds your home folder).')
  for (const path of ['/home/test', '/', '/home']) {
    expect(homeRisk(path, '/home/test')).toBe('is too broad (it holds your home folder).')
  }
  for (const path of ['/home/test/.ssh', '/home/test/.config/app']) {
    expect(homeRisk(path, '/home/test')).toBe('is inside a hidden folder under your home.')
  }
  for (const path of ['/home/testing', '/home/test/projects/app', '/home/test/projects/.cache']) {
    expect(homeRisk(path, '/home/test')).toBe(undefined)
  }
})
