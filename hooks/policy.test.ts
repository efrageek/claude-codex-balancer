import { expect, test } from 'claude-code/testing'

import { bar, decide, modeNote, parseCodexCredits, parseCodexLimits, policyText, pressure } from './policy'

const NOW = Date.parse('2026-10-17T12:00:00Z')
const iso = (minutesFromNow: number) => new Date(NOW + minutesFromNow * 60_000).toISOString()

test('pressure is used share over elapsed share', () => {
  // Half of a 5h window gone, 50% used: on pace.
  expect(pressure({ kind: 'five_hour', percentUsed: 50, resetsAt: iso(150) }, NOW)).toBe(1)
  expect(pressure({ kind: 'five_hour', percentUsed: 50 }, NOW)).toBe(undefined)
  expect(pressure({ kind: 'five_hour', percentUsed: 96, resetsAt: iso(-5) }, NOW)).toBe(undefined)
})

test('manual modes stay put; auto follows pace', () => {
  const hotClaude = [{ kind: 'seven_day', percentUsed: 80, resetsAt: iso(5040) }] // 80% at half the week
  const coolCodex = [{ kind: 'seven_day', percentUsed: 14, resetsAt: iso(5040), minutes: 10080 }]
  expect(decide('light', hotClaude, coolCodex, NOW).mode).toBe('light')
  expect(decide('auto', hotClaude, coolCodex, NOW).mode).toBe('full')
  expect(decide('auto', coolCodex, hotClaude, NOW).mode).toBe('light')
  expect(decide('auto', [], [], NOW).mode).toBe('medium')
  expect(decide('auto', [], coolCodex, NOW).mode).toBe('medium')
  expect(decide('auto', [{ kind: 'five_hour', percentUsed: 96, resetsAt: iso(10) }], coolCodex, NOW).mode).toBe('full')
  // A Codex window that already reset no longer counts as exhausted.
  const staleCodex = [{ kind: 'seven_day', percentUsed: 97, resetsAt: iso(-60), minutes: 10080 }]
  expect(decide('auto', hotClaude, staleCodex, NOW).why).not.toBe('Codex nearly exhausted')
})

test('reads the last rate_limits of a codex session file', () => {
  const line = (u: number) =>
    `{"type":"event_msg","payload":{"rate_limits":{"limit_id":"codex","primary":{"used_percent":${u},"window_minutes":10080,"resets_at":1792650073},"secondary":null}}}`
  const wins = parseCodexLimits(`${line(10)}\n${line(14)}\n`)
  expect(wins).toEqual([{ kind: 'seven_day', percentUsed: 14, minutes: 10080, resetsAt: new Date(1792650073000).toISOString() }])
  expect(parseCodexLimits('{"no":"limits"}')).toBe(undefined)
})

test('fixed policy contains every code rule and the off rule without figures', () => {
  const text = policyText('mcp__balancer__codex_run')
  expect(text).toContain('`scout` subagent (Haiku)')
  expect(text).toContain('light: Code tasks: bounded ones (implement + tests, refactor, script, clear spec and file list) go to Codex via the codex_run tool; everything else code goes to the `coder` subagent.')
  expect(text).toContain('medium: Code tasks: split about half and half between Codex (codex_run) and the `coder` subagent, alternating between them.')
  expect(text).toContain('full: Code tasks: every implementation, fix, refactor, test or script goes to Codex via codex_run. Claude models only orchestrate, plan, review and criticize; do not launch `coder` for code.')
  expect(text).toContain('off: The user turned Claude/Codex balancing off. Use Claude subagents as usual, and start Codex (`mcp__balancer__codex_run`) only when the user asks for it.')
  expect(text).toContain('newest note wins')
  expect(text).toContain("model and effort the latest note names; the note's effort is a ceiling")
  expect(text).toContain('In off, ignore every bullet below except the off rule')
  expect(text).toContain('in every mode except off')
  expect(text).toContain('If no Balancer note is visible, start Codex only when the user asks')
  expect(/\d/.test(text)).toBe(false)
})

test('mode notes name the manual or auto mode, model and effort', () => {
  expect(modeNote('full', decide('full', [], [], NOW), 'gpt-6.1-sol', 'xhigh')).toBe(
    'Balancer note: mode full (manual). Codex default gpt-6.1-sol at effort xhigh.',
  )
  const cool = [{ kind: 'seven_day', percentUsed: 10, resetsAt: iso(5040) }]
  const hot = [{ kind: 'seven_day', percentUsed: 70, resetsAt: iso(5040) }]
  expect(modeNote('auto', decide('auto', cool, hot, NOW), 'gpt-6-sol', 'low')).toBe(
    'Balancer note: mode auto, acting as light (Codex is burning faster). Codex default gpt-6-sol at effort low.',
  )
})

test('credits and bars', () => {
  expect(parseCodexCredits('{"rate_limits":{"primary":{"used_percent":1},"credits":{"has_credits":true,"balance":"62500.0000"}}}')).toBe(62500)
  expect(parseCodexCredits('{}')).toBe(undefined)
  expect(bar(50, 10)).toEqual(['━━━━━', '━━━━━'])
  expect(bar(140, 4)).toEqual(['━━━━', ''])
})

test('off routes nothing and its note omits model and effort', () => {
  expect(decide('off', [], [], 0).mode).toBe('off')
  expect(modeNote('off', decide('off', [], [], 0), 'gpt-6.1-sol', 'xhigh')).toBe('Balancer note: off.')
})
