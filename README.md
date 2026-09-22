# doublecheck

After a turn in Claude Code, Grok Build, Codex, or Factory Droid, a missed check prints one line in that session.

`REPROBE` means read that reply again and send the prompt back. A clean turn prints nothing.

The check looks at the prompt, the tools that ran, and the answer. It does not rewrite the answer. It does not tell the agent to keep going.

## Install

```sh
npx github:krishna-goutham-tls/doublecheck install
```

That one command installs the hooks. After the package is on npm, the short command is `npx doublecheck install`. The short name is not live yet. This Mac is not logged into npm, so the package has not been published.

The installer copies the checker to `~/.doublecheck` and registers a Stop hook in four places:

- `~/.claude/settings.json`
- `~/.grok/hooks/doublecheck.json`
- `~/.codex/hooks.json`
- `~/.factory/hooks.json`

It then asks for the TypeSafe API key. That is the key Jev runs on. Paste it at the prompt. The installer writes one line to `~/.doublecheck/.env.local`:

```
TYPESAFE_API_KEY=your-key-here
```

Each check is billed to that key. To set the key later, put that same line in that file. Mode on the file should be readable only by you.

Start a new session in each tool. The session you already have open will not show the line until you do.

A miss above 0.85 says `Definitely reprobe.` A miss above 0.5 says `Probably reprobe.` The next sentence is fixed, in plain speech. No second model call writes it. The line shows in the session that produced the turn. Claude Code also sets that window title and rings the terminal bell. There is no macOS notification.

## What the line means

A place is `code`, `docs`, `web`, or `system`. The ask marks each place required or not. A required place that was not opened prints REPROBE. An optional miss stays silent. An answer that adds a name, label, or number the tools do not support also prints REPROBE. A score near 0.5 stays silent.

## Check one session by hand

```sh
doublecheck last
doublecheck last --file /path/to/session.jsonl
```

