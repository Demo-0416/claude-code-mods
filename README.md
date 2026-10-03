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

Register your clone as the marketplace, so Claude Code reads the mods straight from it:

```bash
claude plugin marketplace add /path/to/claude-code-mods
claude plugin install <mod>@demo-0416-mods
```

After an edit, run `/reload-plugins` in a session. No version bump or copying is needed. To try a mod without installing it, run `claude --plugin-dir plugins/<mod>`.

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
4. Run the checks above, then install it with `claude plugin install <mod>@demo-0416-mods`.

## License

[MIT](LICENSE)
