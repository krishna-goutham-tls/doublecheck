# doublecheck

After every turn in Claude Code, Grok Build, Codex, and Factory Droid, you get one label.

`REPROBE` means read that reply again and send the prompt back. `FINE` means leave it.

The check looks at the prompt, the tools that ran, and the answer. It does not rewrite the answer. It does not tell the agent to keep going.

## Install

```sh
npx doublecheck install
```

The installer registers a Stop hook in four places:

- `~/.claude/settings.json`
- `~/.grok/hooks/doublecheck.json`
- `~/.codex/hooks.json`
- `~/.factory/hooks.json`

It copies the checker to `~/.doublecheck` and asks for a TypeSafe API key. The key stays in `~/.doublecheck/.env.local`. Each check is billed to that key.

Start a new session in each tool. This session will not show the label until you do.

On a Mac you also get a notification. Claude Code, Codex, and Factory Droid show the label in the session. Grok Build shows it as a hook line.

## What the label means

| Label | What happened |
|---|---|
| `REPROBE` | The turn needed a source and did not open it, or the answer added a name, label, or number the tools do not support. |
| `FINE` | The required look happened, or the prompt did not need one. |

Ask types are `none`, `code`, `docs`, `system`, and `web`. A new file or a general question is `none`. A question about existing source is `code`. A question about a markdown file is `docs`. A question about a running machine or service is `system`. A question about a current vendor API is `web`.

## Check one session by hand

```sh
doublecheck last
doublecheck last --file /path/to/session.jsonl
```

## Publish note

`npx doublecheck install` works after this package is on npm. Until then, clone the repo and run `node src/cli.mjs install`.
