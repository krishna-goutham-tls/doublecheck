# doublecheck

After each Claude Code or Grok Build turn, show `REPROBE` or `FINE`.

`REPROBE` means read the reply again and send the prompt back. `FINE` means leave it. The hook does not tell the model to change the answer.

Codex and Factory Droid are not wired.

```sh
node src/cli.mjs last
node src/cli.mjs last --file /path/to/session.jsonl
```

Bring your own TypeSafe key. Put it in `.env.local` as `TYPESAFE_API_KEY=...`. That file is gitignored. A key already in the shell wins.

This sends one turn to TypeSafe: the user prompt, tool names, paths, a short tool result, and the answer. It does not send the whole session. There is no hosted proxy. Your key pays for the check.
