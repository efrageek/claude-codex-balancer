import { expect, test } from 'claude-code/testing'

import { bar, decide, parseCodexCredits, parseCodexLimits, policyText, pressure } from './policy'

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

test('policy text names the routing and holds no live percentages', () => {
  const text = policyText('full', { mode: 'full', why: 'manual' }, 'gpt-6.1-sol', 'xhigh', 'mcp__balancer__codex_run')
  expect(text).toContain('Haiku 5.5')
  expect(text).toContain('do not launch `coder` for code')
  expect(/\d+%/.test(text)).toBe(false)
  // Same mode, different pace: the prompt must not change.
  const now = Date.parse('2026-10-17T12:00:00Z')
  const at = (u: number) => [{ kind: 'seven_day', percentUsed: u, resetsAt: new Date(now + 3 * 86_400_000).toISOString() }]
  const a = policyText('auto', decide('auto', at(70), at(10), now), 'm', 'xhigh', 't')
  const b = policyText('auto', decide('auto', at(90), at(5), now), 'm', 'xhigh', 't')
  expect(a).toBe(b)
})

test('credits and bars', () => {
  expect(parseCodexCredits('{"rate_limits":{"primary":{"used_percent":1},"credits":{"has_credits":true,"balance":"62500.0000"}}}')).toBe(62500)
  expect(parseCodexCredits('{}')).toBe(undefined)
  expect(bar(50, 10)).toEqual(['━━━━━', '━━━━━'])
  expect(bar(140, 4)).toEqual(['━━━━', ''])
})
