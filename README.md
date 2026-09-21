# doublecheck

Read the last Claude Code turn. Print `PROBE` or `FINE`.

Today this reads Claude Code only. It does not run inside Factory Droid, Codex, or Grok Build.

```sh
node src/cli.mjs last
node src/cli.mjs last --file /path/to/session.jsonl
```

Bring your own TypeSafe key. Put it in `.env.local` as `TYPESAFE_API_KEY=...`. That file is gitignored. A key already in the shell wins.

This sends one turn to TypeSafe: the user prompt, tool names, paths, a short tool result, and the answer. It does not send the whole session. There is no hosted proxy. Your key pays for the check.
