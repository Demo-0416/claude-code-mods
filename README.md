# claude-code-mods

[Mods](https://code.claude.com/docs/en/plugins/mods/overview) for Claude Code, published as a plugin marketplace.

## Mods

| Mod | What it does |
| --- | --- |
| [prompt-queue](plugins/prompt-queue) | Codex-style queued follow-up inputs: press Tab while Claude works to queue a prompt, sent after the turn ends |

## Install

```bash
claude plugin marketplace add Demo-0416/claude-code-mods
claude plugin install <mod>@demo-0416-mods
```

For example, `claude plugin install prompt-queue@demo-0416-mods`. Run `/reload-plugins` in an open session, or start a new one. Each mod's README lists any setup it needs, such as keybindings.

A mod is code that runs with your permissions. To see the events a mod hooks and the calls it makes before you install it, run `claude plugin validate plugins/<mod>`.

Mods need Claude Code v2.1.287 or later.

## Layout

```
.claude-plugin/marketplace.json   the marketplace: one entry per mod
plugins/<mod>/
  .claude-plugin/plugin.json      the mod's manifest
  hooks/hooks.json                points at the hooks module
  hooks/register.tsx              the hooks module
  types/index.d.ts                the mod's $.state contract, if it keeps state
  tests/*.test.tsx                run by `claude plugin test`
  README.md
```

## Develop

Start Claude Code with the mod's folder:

```bash
claude --plugin-dir plugins/<mod>
```

The folder loads in place and replaces an installed copy of the same mod for that session. Saving a file reloads the mod.

Before you commit, check the mod:

```bash
claude plugin validate .                 # the marketplace
claude plugin validate plugins/<mod>     # the manifest, plus what the module hooks and calls
claude plugin test plugins/<mod>
tsc -p plugins/<mod>                     # once Claude Code has loaded the mod once
```

`tsc` needs the type declarations that Claude Code writes into `plugins/<mod>/.claude-plugin/types/` the first time it loads the mod. That folder is ignored by git.

### Add a mod

1. Create `plugins/<mod>/` with the files listed under [Layout](#layout). The `name` in `plugin.json` must match the folder name and the marketplace entry.
2. Add an entry to `.claude-plugin/marketplace.json` with `name`, `source` (`./plugins/<mod>`) and `description`.
3. Add a row to the [Mods](#mods) table.
4. Run the checks above, try it with `claude --plugin-dir plugins/<mod>`, then push.

### Release a change

Users get an update only when the `version` in the mod's `plugin.json` changes. Bump it, push, then update your own install:

```bash
claude plugin marketplace update demo-0416-mods
claude plugin update <mod>@demo-0416-mods
```

Run `/reload-plugins` in open sessions to load the new version.

## License

[MIT](LICENSE)
