import assert from "node:assert/strict"
import test from "node:test"
import { lastTurnFromJsonl } from "../src/claude.mjs"
import { decide } from "../src/light.mjs"

test("PROBE when they looked and still invented", () => {
  const result = decide({
    ask_type: { choice: "docs" },
    looked: { noul: 0.8 },
    invented: { noul: 0.89 },
  })
  assert.equal(result.light, "PROBE")
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

test("PROBE when code was not opened", () => {
  const result = decide({
    ask_type: { choice: "code" },
    looked: { noul: 0.1 },
    invented: { noul: 0.1 },
  })
  assert.equal(result.light, "PROBE")
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

function row(role, content) {
  return JSON.stringify({ type: role === "user" ? "user" : "assistant", message: { role, content } })
}
