import { expect, test } from 'claude-code/testing'

import { codexCommand, isCodexCommand, isInside, shellQuote } from './codex'

const base = { model: 'gpt-6.1-sol', effort: 'low', dir: '/w/repo', prompt: "do it's job" }

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

test('inside a root', () => {
  expect(isInside('/a/b', '/a')).toBe(true)
  expect(isInside('/a', '/a')).toBe(true)
  expect(isInside('/ab', '/a')).toBe(false)
  expect(shellQuote("it's")).toBe(`'it'\\''s'`)
})
