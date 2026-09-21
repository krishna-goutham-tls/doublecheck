import assert from "node:assert/strict"
import test from "node:test"
import { lastTurnFromJsonl } from "../src/claude.mjs"
import { shouldRun } from "../src/gate.mjs"
import { lastTurnFromGrok } from "../src/grok.mjs"
import { decide } from "../src/light.mjs"

test("REPROBE when they looked and still invented", () => {
  const result = decide({
    ask_type: { choice: "docs" },
    looked: { noul: 0.8 },
    invented: { noul: 0.89 },
  })
  assert.equal(result.light, "REPROBE")
  assert.deepEqual(result.reasons, ["invented"])
})

test("FINE on none even if nothing was opened", () => {
  const result = decide({
    ask_type: { choice: "none" },
    looked: { noul: 0.2 },
    invented: { noul: 0.03 },
  })
  assert.equal(result.light, "FINE")
})

test("REPROBE when code was not opened", () => {
  const result = decide({
    ask_type: { choice: "code" },
    looked: { noul: 0.1 },
    invented: { noul: 0.1 },
  })
  assert.equal(result.light, "REPROBE")
  assert.deepEqual(result.reasons, ["looked"])
})

test("last user turn is the one after earlier turns", () => {
  const jsonl = [
    row("user", "first"),
    row("assistant", [{ type: "text", text: "old" }]),
    row("user", "second"),
    row("assistant", [
      { type: "tool_use", id: "t1", name: "Read", input: { file_path: "AGENTS.md" } },
    ]),
    row("user", [{ type: "tool_result", tool_use_id: "t1", content: "router" }]),
    row("assistant", [{ type: "text", text: "done" }]),
  ].join("\n")
  const turn = lastTurnFromJsonl(jsonl)
  assert.equal(turn.user, "second")
  assert.match(turn.tools, /Read AGENTS.md/)
  assert.match(turn.tools, /router/)
  assert.equal(turn.answer, "done")
})

test("stop hook skips a continuation and a session-end fire", () => {
  assert.equal(shouldRun({ stopHookActive: true }), false)
  assert.equal(shouldRun({ stop_hook_active: true }), false)
  assert.equal(shouldRun({ reason: "shutdown" }), false)
  assert.equal(shouldRun({ reason: "end_turn" }), true)
  assert.equal(shouldRun({}), true)
})

test("grok turn uses the user query, not the wrapper", () => {
  const jsonl = [
    JSON.stringify({
      type: "user",
      content: [{ type: "text", text: "<user_info>secret</user_info>\n<user_query>\nwhat does AGENTS.md say?\n</user_query>" }],
    }),
    JSON.stringify({
      type: "assistant",
      tool_calls: [{ id: "c1", name: "read_file", arguments: JSON.stringify({ target_file: "AGENTS.md" }) }],
      content: "",
    }),
    JSON.stringify({ type: "tool_result", tool_call_id: "c1", content: "router text" }),
    JSON.stringify({ type: "assistant", content: [{ type: "text", text: "It is a router." }] }),
  ].join("\n")
  const turn = lastTurnFromGrok(jsonl)
  assert.equal(turn.user, "what does AGENTS.md say?")
  assert.match(turn.tools, /read_file AGENTS.md/)
  assert.equal(turn.answer, "It is a router.")
})

function row(role, content) {
  return JSON.stringify({ type: role === "user" ? "user" : "assistant", message: { role, content } })
}
