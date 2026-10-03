import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, TurnCompleteReason } from 'claude-code'

const BAND = {
  plugin: 'prompt-queue',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 20,
    bodyColumns: 40,
    scroll: { offset: 0, bodyRows: 19 },
    view: {},
  },
} as const

// The engine beneath the plugin: records what reaches it and answers plainly.
function engine(on: On, box = { text: '' }) {
  const sent: { text: string; origin: unknown }[] = []
  const toasts: string[] = []
  const waiters: (() => void)[] = []
  on('prompt.submit', (_, e) => {
    sent.push({ text: e.text, origin: e.origin })
    waiters.splice(0).forEach(wake => wake())

    return { text: e.text }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('prompt.read', () => ({ value: { text: box.text, cursor: box.text.length } }))
  on('prompt.fill', (_, e) => {
    box.text = e.text

    return { isFilled: true }
  })
  const nextSend = () => new Promise<void>(wake => waiters.push(wake))

  return { sent, toasts, box, nextSend }
}

const typed = (text: string, turnId: string | undefined, wait: boolean) =>
  ({ text, wait, turnId, origin: { kind: 'composer' } }) as const

const ended = (turnId: string, reason: Exclude<TurnCompleteReason, 'refusal'> = 'answer') =>
  ({ answer: '', durationMs: 1, isAborted: reason === 'aborted', turnId, reason }) as const

async function runTurn($: Engine, turnId: string) {
  await $.turn.start({ text: '', turnId })
  await $.turn.complete(ended(turnId))
}

test('the queue key mid-turn holds the prompt and sends it after the turn ends', async ($, on) => {
  const { sent, nextSend } = engine(on)
  await $.turn.start({ text: 'work', turnId: 't1' })

  const queued = await $.prompt.submit(typed('next step', 't1', true))
  expect(queued.drop).toBe('Queued follow-up input')
  expect(sent).toEqual([])

  const released = nextSend()
  await $.turn.complete(ended('t1'))
  await released
  expect(sent).toEqual([
    { text: 'next step', origin: { kind: 'plugin', name: 'prompt-queue', asUser: true } },
  ])
})

test('Enter mid-turn still steers, and the queue key while idle sends at once', async ($, on) => {
  const { sent } = engine(on)
  const steered = await $.prompt.submit(typed('steer', 't1', false))
  expect(steered.drop).toBeUndefined()

  const idle = await $.prompt.submit(typed('now', undefined, true))
  expect(idle.drop).toBeUndefined()
  expect(sent.map(s => s.text)).toEqual(['steer', 'now'])
})

test('queued prompts go one per turn, oldest first', async ($, on) => {
  const { sent, nextSend } = engine(on)
  await $.turn.start({ text: 'work', turnId: 't1' })
  await $.prompt.submit(typed('a', 't1', true))
  await $.prompt.submit(typed('b', 't1', true))

  let released = nextSend()
  await $.turn.complete(ended('t1'))
  await released
  expect(sent.map(s => s.text)).toEqual(['a'])

  released = nextSend()
  await runTurn($, 't2')
  await released
  expect(sent.map(s => s.text)).toEqual(['a', 'b'])

  await runTurn($, 't3')
  expect(sent.map(s => s.text)).toEqual(['a', 'b'])
})

test('a turn that ends in an error still sends the next one', async ($, on) => {
  const { sent, nextSend } = engine(on)
  await $.turn.start({ text: 'work', turnId: 't1' })
  await $.prompt.submit(typed('after error', 't1', true))

  const released = nextSend()
  await $.turn.complete(ended('t1', 'error'))
  await released
  expect(sent.map(s => s.text)).toEqual(['after error'])
})

test('an interrupt puts the queued prompts back ahead of the draft', async ($, on) => {
  const { sent, box } = engine(on)
  await $.turn.start({ text: 'work', turnId: 't1' })
  await $.prompt.submit(typed('first queued', 't1', true))
  await $.prompt.submit(typed('second queued', 't1', true))
  box.text = 'current draft'

  await $.turn.complete(ended('t1', 'aborted'))
  expect(box.text).toBe('first queued\nsecond queued\ncurrent draft')
  expect(sent).toEqual([])

  // Nothing is left to send once the next turn ends.
  await runTurn($, 't2')
  expect(sent).toEqual([])
})

test('the edit button takes the last queued prompt back, replacing the draft', async ($, on) => {
  const { box, sent } = engine(on)
  await $.turn.start({ text: 'work', turnId: 't1' })
  await $.prompt.submit(typed('a', 't1', true))
  await $.prompt.submit(typed('b', 't1', true))
  box.text = 'draft'

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const edit = await ui.find({ type: 'Button', key: 'edit' })
  expect(edit?.props).toMatchObject({ label: 'alt+↑', action: 'app:diffFileListUp' })

  await ui.press({ key: 'edit' })
  expect(box.text).toBe('b')
  expect(await ui.find({ type: 'Text', text: /↳ b/ })).toBeUndefined()

  await ui.press({ key: 'edit' })
  expect(box.text).toBe('a')
  await ui.unmount()

  // Nothing is left to send once the turn ends.
  await $.turn.complete(ended('t1'))
  expect(sent).toEqual([])
})

test('the band draws the Codex preview, wrapped and cut at three rows', async ($, on) => {
  engine(on)
  await $.turn.start({ text: 'work', turnId: 't1' })
  await $.prompt.submit(typed('Hello, world!', 't1', true))
  await $.prompt.submit(typed('This is\na message\nwith many\n\nlines', 't1', true))
  await $.prompt.submit(typed('这是一条很长的中文消息，用来测试按显示宽度折行是否正确，应该会折成两行。', 't1', true))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const lines = (await ui.findAll({ type: 'Text' }))
      .filter(t => t.text !== undefined)
      .map(t => t.text)
    expect(lines).toContain('• Queued follow-up inputs')
    expect(lines).toContain('  ↳ Hello, world!')
    expect(lines).toContain('    with many')
    expect(lines).toContain('    …')
    expect(lines).not.toContain('    lines')
    expect(lines).toContain(' edit last queued message')
    expect(lines.filter(l => l?.startsWith('  ↳ 这是'))).toHaveLength(1)
    await ui.unmount()
  }
})

test('the hint under the prompt names the queue key while a turn runs', async ($, on) => {
  engine(on)
  mock.env(on, { HOME: '/home/me' })
  on('fs.read', (_, e) => {
    expect(e.path).toBe('/home/me/.claude/keybindings.json')

    return {
      value: JSON.stringify({
        bindings: [
          { context: 'Chat', bindings: { tab: 'chat:queueSubmit', 'shift+left': 'app:diffFileListUp' } },
        ],
      }),
    }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{`${e.props.hint}${e.props.tail ?? ''}`}</Text>
  })
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })

  const hint = (isDraft: boolean, isWorking: boolean) => ({
    plugin: 'prompt-queue',
    surface: 'terminal',
    component: 'PromptHint',
    props: { isDraft, isWorking, hint: 'esc to interrupt' },
    viewport: { columns: 100, rows: 30 },
  }) as const

  let ui = await $.ui.mount(hint(true, true))
  expect(await ui.find({ type: 'Text', text: 'esc to interrupt · tab to queue message' })).toBeDefined()
  await ui.unmount()

  ui = await $.ui.mount(hint(false, true))
  expect(await ui.find({ type: 'Text', text: /queue/ })).toBeUndefined()
  await ui.unmount()

  // The edit hint names the person's own binding of the edit action.
  await $.prompt.submit(typed('later', 't1', true))
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await band.find({ type: 'Button', key: 'edit' }))?.props).toMatchObject({ label: 'shift+←' })
  await band.unmount()
})

test('a release whose prompt never shows up entering does not stall the queue', async ($, on) => {
  const clock = mock.clock(on)
  const sent: string[] = []
  // The first released prompt never comes back, as when a reload lands mid-release.
  on('prompt.submit', async (_, e) => {
    sent.push(e.text)
    if (e.text === 'lost') {
      await clock.sleep(1e9)
    }

    return { text: e.text }
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.read', () => ({ deny: 'none' }))
  on('env.get', () => ({ value: undefined }))

  await $.turn.start({ text: 'work', turnId: 't1' })
  await $.prompt.submit(typed('lost', 't1', true))
  await $.prompt.submit(typed('b', 't1', true))
  await $.prompt.submit(typed('c', 't1', true))
  await $.turn.complete(ended('t1'))
  await clock.settle()
  expect(sent).toEqual(['lost'])

  // Any main-loop turn starting clears the stale release.
  await runTurn($, 't2')
  await clock.settle()
  expect(sent).toEqual(['lost', 'b'])

  // So does a reload, which releases what is queued while idle.
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(sent).toEqual(['lost', 'b', 'c'])
})
