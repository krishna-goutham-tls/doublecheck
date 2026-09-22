import assert from "node:assert/strict"
import test from "node:test"
import { lastTurnFromJsonl } from "../src/claude.mjs"
import { lastTurnFromCodex } from "../src/codex.mjs"
import { shouldRun } from "../src/gate.mjs"
import { lastTurnFromGrok } from "../src/grok.mjs"
import { upsertDroid, upsertWrapped } from "../src/install.mjs"
import { claudeTerminalSequence, decide, hookPayload, reportLine } from "../src/light.mjs"

function answers(overrides = {}) {
  const base = {}
  for (const place of ["code", "docs", "web", "system"]) {
    base[`${place}_required`] = { noul: 0.1 }
    base[`${place}_looked`] = { noul: 0.1 }
  }
  base.invented = { noul: 0.03 }
  return { ...base, ...overrides }
}

test("a strong look and a low invented score stay FINE", () => {
  const result = decide(
    answers({
      code_required: { noul: 0.9 },
      code_looked: { noul: 0.81 },
      invented: { noul: 0.03 },
    }),
  )
  assert.equal(result.light, "FINE")
  assert.deepEqual(result.reasons, [])
})

test("a clear miss is definitely reprobe", () => {
  const result = decide(
    answers({
      code_required: { noul: 0.9 },
      code_looked: { noul: 0.1 },
    }),
  )
  assert.equal(result.light, "REPROBE")
  assert.equal(result.tone, "definitely")
  assert.deepEqual(result.reasons.map((reason) => reason.kind), ["code"])
})

test("a softer miss is probably reprobe", () => {
  const result = decide(
    answers({
      code_required: { noul: 0.9 },
      code_looked: { noul: 0.2 },
    }),
  )
  assert.equal(result.tone, "probably")
  assert.equal(
    reportLine(result),
    "Probably reprobe. It probably needed the code, and I don't see it opened.",
  )
})

test("a look at 0.5 stays silent", () => {
  const result = decide(
    answers({
      docs_required: { noul: 0.9 },
      docs_looked: { noul: 0.5 },
    }),
  )
  assert.equal(result.light, "FINE")
})

test("a coin-flip requirement stays silent", () => {
  const result = decide(
    answers({
      web_required: { noul: 0.5 },
      web_looked: { noul: 0.0 },
    }),
  )
  assert.equal(result.light, "FINE")
})

test("an optional miss stays silent", () => {
  const result = decide(
    answers({
      system_required: { noul: 0.2 },
      system_looked: { noul: 0.0 },
    }),
  )
  assert.equal(result.light, "FINE")
})

test("invented above 0.85 is definite and above 0.5 is probable", () => {
  const sure = decide(answers({ invented: { noul: 0.86 } }))
  assert.equal(sure.tone, "definitely")
  assert.equal(
    reportLine(sure),
    "Definitely reprobe. It put in a name or a number that isn't in what it opened.",
  )
  const maybe = decide(answers({ invented: { noul: 0.7 } }))
  assert.equal(maybe.tone, "probably")
  const edge = decide(answers({ invented: { noul: 0.5 } }))
  assert.equal(edge.light, "FINE")
})

test("two required misses both show, and an optional miss does not", () => {
  const result = decide(
    answers({
      docs_required: { noul: 0.91 },
      docs_looked: { noul: 0.1 },
      web_required: { noul: 0.8 },
      web_looked: { noul: 0.0 },
      code_required: { noul: 0.2 },
      code_looked: { noul: 0.0 },
    }),
  )
  assert.deepEqual(
    result.reasons.map((reason) => reason.kind),
    ["docs", "web"],
  )
  assert.equal(result.tone, "definitely")
  assert.match(reportLine(result), /never opened them/)
  assert.match(reportLine(result), /I don't see a search/)
})

test("the session line names the folder and the place", () => {
  const result = decide(
    answers({
      docs_required: { noul: 0.9 },
      docs_looked: { noul: 0.1 },
    }),
  )
  assert.equal(
    reportLine(result),
    "Definitely reprobe. It needed the notes in the project, and it never opened them.",
  )
  assert.equal(reportLine(decide(answers())), null)
})

test("Claude gets a title and a bell, Codex and Grok get the line only", () => {
  const result = decide(
    answers({
      code_required: { noul: 0.9 },
      code_looked: { noul: 0.1 },
    }),
  )
  const claude = hookPayload(result, { cwd: "/repo/doublecheck" })
  assert.equal(
    claude.systemMessage,
    "Definitely reprobe. It needed the code, and it never opened it.",
  )
  assert.equal(claude.terminalSequence, claudeTerminalSequence("Definitely reprobe"))
  assert.doesNotMatch(claude.terminalSequence, /\]9;|\]777/)
  const codex = hookPayload(result, { cwd: "/repo/doublecheck", turn_id: "t1" })
  assert.equal(codex.terminalSequence, undefined)
  const grok = hookPayload(result, { cwd: "/repo/doublecheck", grok: true })
  assert.equal(grok.terminalSequence, undefined)
  assert.equal(hookPayload(decide(answers()), { cwd: "/repo/doublecheck" }), null)
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

test("codex turn keeps the user text and the command", () => {
  const jsonl = [
    JSON.stringify({
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "<environment_context><cwd>/tmp</cwd></environment_context>\nfix the login bug" }],
      },
    }),
    JSON.stringify({
      type: "response_item",
      payload: { type: "function_call", name: "exec_command", call_id: "c1", arguments: JSON.stringify({ cmd: "cat src/login.ts" }) },
    }),
    JSON.stringify({
      type: "response_item",
      payload: { type: "function_call_output", call_id: "c1", output: "export function login() {}" },
    }),
    JSON.stringify({
      type: "response_item",
      payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "Fixed." }] },
    }),
  ].join("\n")
  const turn = lastTurnFromCodex(jsonl)
  assert.equal(turn.user, "fix the login bug")
  assert.match(turn.tools, /exec_command/)
  assert.equal(turn.answer, "Fixed.")
})

test("install keeps an existing stop hook", () => {
  const config = upsertWrapped(
    { hooks: { Stop: [{ hooks: [{ type: "command", command: "/Users/kg/claude-notch/launch.sh" }] }] } },
    { hooks: [{ type: "command", command: "node /Users/me/.doublecheck/runtime/src/hook.mjs", timeout: 30 }] },
  )
  assert.equal(config.hooks.Stop.length, 2)
  assert.match(config.hooks.Stop[0].hooks[0].command, /claude-notch/)
  const again = upsertWrapped(config, {
    hooks: [{ type: "command", command: "node /Users/me/.doublecheck/runtime/src/hook.mjs", timeout: 30 }],
  })
  assert.equal(again.hooks.Stop.length, 2)
})

test("droid file uses a top-level Stop list", () => {
  const config = upsertDroid({}, { hooks: [{ type: "command", command: "node /Users/me/.doublecheck/runtime/src/hook.mjs" }] })
  assert.equal(config.Stop.length, 1)
})

function row(role, content) {
  return JSON.stringify({ type: role === "user" ? "user" : "assistant", message: { role, content } })
}
