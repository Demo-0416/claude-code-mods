# claude-code-mods

A plugin marketplace (`demo-0416-mods`) of Claude Code mods. Each mod lives in `plugins/<mod>/` and has an entry in `.claude-plugin/marketplace.json`. Published at https://github.com/Demo-0416/claude-code-mods.

## Working on a mod

- The user installs these mods from GitHub (`<mod>@demo-0416-mods`, a cached copy), so local edits don't reach their sessions on their own. To try an edit, they start `claude --plugin-dir plugins/<mod>`, which replaces the installed copy for that session and reloads on save. Don't copy a mod into `~/.claude/dev-mods/`.
- To ship a change: bump `version` in the mod's `plugin.json`, then commit and push (only when the user asks). After that, run `claude plugin marketplace update demo-0416-mods` and `claude plugin update <mod>@demo-0416-mods`, and ask the user to run `/reload-plugins`.
- Load the `plugin-authoring` skill before writing or debugging a hooks module. The engine's type declarations are the API reference.
- Before calling a change done, run all of these and report the results:
  - `claude plugin validate .`
  - `claude plugin validate plugins/<mod>`
  - `claude plugin test plugins/<mod>`
  - `tsc -p plugins/<mod>`
- Behaviour a test can't reach, such as real key presses or terminal rendering, needs the user to try it in a session. Say what to try.
- When behaviour or keybindings change, update the mod's README.

## Adding a mod

Follow "Add a mod" in README.md: create the folder, add the marketplace entry, and add a row to the Mods table.

## Mod notes

- `prompt-queue` mirrors the Codex TUI's queued-input UX (openai/codex `codex-rs/tui`). Check Codex's source before changing its behaviour or copy.
- The prompt box doesn't pass cursor keys to `prompt.edit`, so the mod's edit key is a Button bound to an engine action (`app:diffFileListUp`).
