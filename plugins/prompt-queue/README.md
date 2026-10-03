# prompt-queue

Codex-style queued follow-up inputs for Claude Code.

While Claude is working, press **Tab** to queue your next prompt instead of steering the current turn. Queued prompts wait above the input box and go out one per turn, oldest first, after each turn ends.

```
• Queued follow-up inputs
  ↳ run the tests you just wrote
  ↳ then update the README
    alt+↑ edit last queued message
```

## Install

```bash
claude plugin marketplace add Demo-0416/claude-code-mods
claude plugin install prompt-queue@demo-0416-mods
```

Then bind the keys (next section). A mod can't change your keybindings itself.

## Keybindings

Add these to `~/.claude/keybindings.json`, or run `/keybindings` to open it:

```json
{
  "bindings": [
    {
      "context": "Chat",
      "bindings": {
        "tab": "chat:queueSubmit"
      }
    },
    {
      "context": "Autocomplete",
      "bindings": {
        "tab": "autocomplete:accept"
      }
    }
  ]
}
```

- `tab` → `chat:queueSubmit` makes Tab the queue key. Without it the queue key is Claude Code's default, `ctrl+x enter`.
- The `Autocomplete` block keeps Tab for accepting a completion while the menu is open.

Without this plugin loaded, a Tab bound to `chat:queueSubmit` behaves like Enter: Claude Code delivers the message into the running turn at the next tool call.

## Keys

| Key | While Claude works | While idle |
| --- | --- | --- |
| Tab | Queue the prompt for after the turn | Send it now, like Enter |
| Enter | Steer the running turn (Claude Code's default) | Send |
| alt+↑ (Option+↑ on macOS) | Take the last queued prompt back into the input box, replacing the draft | Same, while anything is queued |
| Esc | Interrupt; every queued prompt returns to the input box, oldest first, ahead of the draft | |

## Behaviour

- One queued prompt per turn, oldest first. A turn that ends in an error or refusal still sends the next one.
- An interrupted turn sends nothing. The queue moves back into the input box so you can edit or resend it.
- The hint under the input box shows `· tab to queue message` while Claude works and the input box has text.

## Limits

- A prompt with pasted images or files can't be queued; it is sent right away, with a notice.
- `@file` mentions in a queued prompt aren't expanded. Claude sees the path as text.
- Each queued prompt leaves a dim `Queued follow-up input` line in the transcript. Claude Code requires a reason when a mod holds back a prompt.
- The edit key is `alt+↑`, not Codex's `shift+←`: Claude Code doesn't hand a mod the input box's cursor keys. Some macOS terminals deliver Cmd+↑ as this key too.
- The edit key works through the engine action `app:diffFileListUp`, the one that scrolls the `/diff` panel's file list. While that panel is open, the key scrolls the panel instead.

## Develop

```bash
claude --plugin-dir ./plugins/prompt-queue   # load from source; saves reload the mod
claude plugin validate ./plugins/prompt-queue
claude plugin test ./plugins/prompt-queue
```

`tsconfig.json` extends `.claude-plugin/types/tsconfig.json`, which Claude Code writes the first time it loads the mod. After that, `tsc -p plugins/prompt-queue` type-checks the mod.
