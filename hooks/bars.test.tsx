import { expect, mock, test } from 'claude-code/testing'

test('band draws quota bars once Claude reports limits', async ($, on) => {
  mock.clock(on)
  const resetsAt = new Date(Date.now() + 3_600_000).toISOString()
  on('session.measure', (_$, e) => ({ changed: [] }) as never)
  await ($ as never as { session: { measure: (e: unknown) => Promise<unknown> } }).session
    .measure({ context: {}, rateLimits: [{ kind: 'five_hour', percentUsed: 42, resetsAt }] })
    .catch(() => undefined)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'balancer',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100 } as never,
    })
    expect(await ui.find({ text: /Claude 5h 42%/ })).toBeTruthy()
    expect(await ui.find({ text: /━/ })).toBeTruthy()
  }
})
