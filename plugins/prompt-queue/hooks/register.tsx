// Queued follow-up inputs, as Codex's TUI has them (codex-rs/tui,
// bottom_pane/pending_input_preview.rs and chatwidget/input_restore.rs):
// the queue key while a turn runs holds the prompt until the turn ends, one
// prompt per turn, oldest first; the edit key takes the last one back into
// the composer; an interrupt puts every queued prompt back into the composer.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { QueuedPrompt } from '../types'

// Prompts waiting for the running turn to end, oldest first.
const items = atom({ plugin: 'prompt-queue', key: 'items' } as const, [] as QueuedPrompt[])
// A main-loop turn is running.
const isBusy = atom({ plugin: 'prompt-queue', key: 'isBusy' } as const, false)
// The id of a released prompt whose turn has not started yet, so a turn that
// ends meanwhile (a steered prompt, a notification) releases nothing more.
// Cleared when its prompt enters, when any main-loop turn starts, and on a
// reload, so a release the plugin never saw enter cannot stall the queue.
const releasing = atom({ plugin: 'prompt-queue', key: 'releasing' } as const, null as string | null)

// Codex's PREVIEW_LINE_LIMIT: wrapped rows shown per queued prompt.
const PREVIEW_LINE_LIMIT = 3
const DEFAULT_QUEUE_KEY = 'ctrl+x enter'
// The prompt box hands a mod no cursor keys, so the edit key is an engine
// action the band's Button names: its chord presses the Button while the queue
// shows. This one scrolls /diff's file list and is bound to alt+↑ (Codex's
// second edit key) by default; shift+← is the person's own binding of it.
const EDIT_ACTION = 'app:diffFileListUp'
const DEFAULT_EDIT_KEY = 'meta+up'

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const ARROWS: Record<string, string> = { left: '←', right: '→', up: '↑', down: '↓' }

// A keybinding as Codex labels it off macOS: `shift+←`, `alt+↑`.
const keyLabel = (chord: string) =>
  chord
    .split(' ')
    .map(stroke =>
      stroke
        .split('+')
        .map(part => {
          const name = part.toLowerCase()

          return ['meta', 'opt', 'option'].includes(name) ? 'alt' : (ARROWS[name] ?? name)
        })
        .join('+'),
    )
    .join(' ')

const isWide = (code: number) =>
  (code >= 0x1100 && code <= 0x115f) ||
  (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
  (code >= 0xac00 && code <= 0xd7a3) ||
  (code >= 0xf900 && code <= 0xfaff) ||
  (code >= 0xfe30 && code <= 0xfe4f) ||
  (code >= 0xff00 && code <= 0xff60) ||
  (code >= 0xffe0 && code <= 0xffe6) ||
  (code >= 0x1f300 && code <= 0x1f64f) ||
  (code >= 0x1f900 && code <= 0x1f9ff) ||
  (code >= 0x20000 && code <= 0x3fffd)

const cellWidth = (char: string) => (isWide(char.codePointAt(0) ?? 0) ? 2 : 1)

// Wraps one prompt into rows of at most `width` cells, breaking after a space
// where the row has one, so English words stay whole and CJK breaks anywhere.
function wrapRows(text: string, width: number): string[] {
  const rows: string[] = []
  for (const line of text.split('\n')) {
    let row: string[] = []
    let used = 0
    let isContinued = false
    for (const char of line) {
      const w = cellWidth(char)
      if (used + w > width && row.length > 0) {
        const space = row.lastIndexOf(' ')
        const carry = space > 0 ? row.splice(space + 1) : []
        rows.push(row.join('').trimEnd())
        row = carry
        used = carry.reduce((sum, c) => sum + cellWidth(c), 0)
        isContinued = true
      }
      if (isContinued && row.length === 0 && char === ' ') {
        continue
      }
      row.push(char)
      used += w
    }
    rows.push(row.join(''))
  }

  return rows
}

type Keys = { queue: string | undefined; edit: string }

// The keys the hints name, from keybindings.json: the person's last binding of
// chat:queueSubmit in Chat (the default unless they unbound it), and of the
// edit action in Chat or Global.
let keys: Keys = { queue: DEFAULT_QUEUE_KEY, edit: DEFAULT_EDIT_KEY }

async function readKeys($: EngineInterface): Promise<Keys> {
  const found: Keys = { queue: DEFAULT_QUEUE_KEY, edit: DEFAULT_EDIT_KEY }
  const dir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
  let file: unknown
  try {
    file = JSON.parse(await $.fs.read(`${dir}/keybindings.json`))
  } catch {
    return found
  }
  const blocks = (file as { bindings?: unknown }).bindings
  for (const block of Array.isArray(blocks) ? blocks : []) {
    const { context, bindings } = block as { context?: unknown; bindings?: unknown }
    if (typeof bindings !== 'object' || bindings === null) {
      continue
    }
    for (const [chord, action] of Object.entries(bindings)) {
      if (context === 'Chat' && action === 'chat:queueSubmit') {
        found.queue = chord
      } else if (context === 'Chat' && chord === found.queue && action === null) {
        found.queue = undefined
      } else if ((context === 'Chat' || context === 'Global') && action === EDIT_ACTION) {
        found.edit = chord
      }
    }
  }

  return found
}

// Sends the oldest queued prompt as a turn of its own once the session is idle.
async function release($: EngineInterface) {
  let head: QueuedPrompt | undefined
  await update($, items, list => {
    head = list[0]

    return list.slice(1)
  })
  if (head === undefined) {
    return
  }
  const sent = head
  await update($, releasing, () => sent.id)
  // Not awaited: it resolves when the prompt's turn starts, after this hook.
  void $.prompt.submit({ text: sent.text, asUser: true })
}

// Releases the next prompt when nothing runs or is about to. Deferred to a
// timer, so the submit never comes from within the hook that holds the turn,
// and this plugin's prompt.submit hook sees it.
function kick($: EngineInterface) {
  $.clock.after(0, () => void kickNow($))
}

async function kickNow($: EngineInterface) {
  const isIdle =
    !(await read($, isBusy)) &&
    (await read($, releasing)) === null &&
    (await read($, items)).length > 0
  if (isIdle) {
    await release($)
  }
}

// Takes the newest queued prompt back into the composer, over the draft, as
// Codex's edit key does.
async function takeLast($: EngineInterface) {
  const last = (await read($, items)).at(-1)
  if (last === undefined) {
    return
  }
  const filled = await $.prompt.fill({ text: last.text, mode: 'replace' })
  if (filled.isFilled) {
    await update($, items, list => list.filter(one => one.id !== last.id))
  }
}

// Puts every queued prompt back into the composer, oldest first, ahead of the
// draft, as Codex does on an interrupt.
async function restore($: EngineInterface) {
  const list = await read($, items)
  if (list.length === 0) {
    return
  }
  const draft = (await $.prompt.read()).text
  const text = [...list.map(one => one.text), ...(draft ? [draft] : [])].join('\n')
  const filled = await $.prompt.fill({ text, mode: 'replace' })
  if (filled.isFilled) {
    const restored = new Set(list.map(one => one.id))
    await update($, items, all => all.filter(one => !restored.has(one.id)))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    keys = await readKeys($)
    // A reload: a release in flight may have entered unseen.
    await update($, releasing, () => null)
    kick($)

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'plugin' && e.origin.name === 'prompt-queue') {
      // One of ours: its turn has started once `next` resolves.
      const entered = await next(e)
      await update($, releasing, () => null)
      if (entered.drop !== undefined) {
        kick($)
      }

      return entered
    }

    if (!e.wait || e.origin.kind !== 'composer' || e.text.trim() === '') {
      return next(e)
    }
    const hasPending = (await read($, items)).length > 0
    if (e.turnId === undefined && !hasPending) {
      // Idle with nothing queued: the queue key sends at once, like Enter.
      return next(e)
    }
    if (e.attachments?.length) {
      $.ui.toast('Images can’t be queued yet; sent now instead')

      return next(e)
    }
    await update($, items, list => [...list, { id: newId(), text: e.text }])
    if (e.turnId === undefined) {
      kick($)
    }

    return { drop: 'Queued follow-up input' }
  })

  on('turn.start', async ($, e, next) => {
    await update($, isBusy, () => true)
    await update($, releasing, () => null)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) {
      return result
    }
    await update($, isBusy, () => false)
    if (e.reason === 'aborted') {
      await restore($)

      return result
    }
    // An answer, and an error or refusal too, sends the next one.
    if ((await read($, releasing)) === null) {
      await release($)
    }

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, items)
    if (list.length === 0 || e.props.hasSurvey) {
      return next(e)
    }
    const { Box, Button, Text } = $.ui.resolve(e)
    const width = Math.max(8, e.props.bodyColumns - 4)

    return (
      <Box flexDirection="column">
        <Text>
          <Text dimColor>• </Text>
          Queued follow-up inputs
        </Text>
        {list.flatMap(one => {
          const rows = wrapRows(one.text, width)
          const shown = rows.slice(0, PREVIEW_LINE_LIMIT)

          return [
            ...shown.map((row, i) => (
              <Text wrap="truncate-end">
                <Text dimColor>{i === 0 ? '  ↳ ' : '    '}</Text>
                <Text dimColor italic>
                  {row}
                </Text>
              </Text>
            )),
            ...(rows.length > PREVIEW_LINE_LIMIT
              ? [
                  <Text dimColor italic>
                    {'    …'}
                  </Text>,
                ]
              : []),
          ]
        })}
        <Box flexDirection="row">
          <Text>{'    '}</Text>
          <Button
            key="edit"
            plain
            label={keyLabel(keys.edit)}
            action={EDIT_ACTION}
            onPress={() => takeLast($)}
          />
          <Text dimColor> edit last queued message</Text>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    if (!e.props.isWorking || !e.props.isDraft || keys.queue === undefined) {
      return next(e)
    }
    const key = keyLabel(keys.queue)
    const full = ` · ${key} to queue message`
    const columns = e.viewport?.columns ?? 80
    const tail = e.props.hint.length + full.length <= columns ? full : ` · ${key} to queue`

    return next({ ...e, props: { ...e.props, tail } })
  })
}
