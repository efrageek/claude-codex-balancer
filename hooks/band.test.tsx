import { expect, mock, test } from 'claude-code/testing'

for (const surface of ['terminal', 'desktop'] as const) {
  test(`band draws on ${surface}`, async ($, on) => {
    mock.clock(on)
    mock.store(on)
    const ui = await $.ui.mount({
      plugin: 'balancer',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100 } as never,
    })
    expect(await ui.find({ key: 'mode-light' })).toBeTruthy()
    expect(await ui.find({ text: /Claude no reading/ })).toBeTruthy()
    await ui.press({ key: 'mode-full' })
    expect(await ui.find({ text: /full → codex/ })).toBeTruthy()
    await ui.press({ key: 'mode-off' })
    expect(await ui.find({ text: /off → no routing/ })).toBeTruthy()
    await ui.press({ key: 'mode-full' })
    await ui.press({ key: 'band-size' })
    expect(await ui.find({ text: /full → codex/ })).toBeFalsy()
    expect(await ui.find({ key: 'mode-light' })).toBeTruthy()
    await ui.press({ key: 'band-size' })
    expect(await ui.find({ text: /full → codex/ })).toBeTruthy()
  })
}
