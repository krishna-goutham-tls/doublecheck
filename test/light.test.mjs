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
  }
  base.invented = { noul: 0.03 }
  return { ...base, ...overrides }
}

const skipped = { code: 0, docs: 0, web: 0, system: 0 }

test("a strong look and a low invented score stay FINE", () => {
  const result = decide(
    answers({
      code_required: { noul: 0.9 },
      invented: { noul: 0.03 },
    }),
    { ...skipped, code: 1 },
  )
  assert.equal(result.light, "FINE")
  assert.deepEqual(result.reasons, [])
})

test("a mandatory skip is definitely reprobe", () => {
  const result = decide(answers({ code_required: { noul: 0.9 } }), skipped)
  assert.equal(result.light, "REPROBE")
  assert.equal(result.tone, "definitely")
  assert.deepEqual(result.reasons.map((reason) => reason.kind), ["code"])
})

test("a high-weight skip is probably reprobe", () => {
  const result = decide(answers({ code_required: { noul: 0.7 } }), skipped)
  assert.equal(result.tone, "probably")
  assert.equal(
    reportLine(result),
    "Probably reprobe. It probably needed the code, and I don't see it opened.",
  )
})

test("opening the place stays silent", () => {
  const result = decide(answers({ docs_required: { noul: 0.9 } }), { ...skipped, docs: 1 })
  assert.equal(result.light, "FINE")
})

test("a coin-flip requirement stays silent", () => {
  const result = decide(answers({ web_required: { noul: 0.5 } }), skipped)
  assert.equal(result.light, "FINE")
})

test("an optional miss stays silent", () => {
  const result = decide(answers({ system_required: { noul: 0.2 } }), skipped)
  assert.equal(result.light, "FINE")
})

test("needs_look off keeps a mandatory weight silent", () => {
  const result = decide(
    answers({
      needs_look: { noul: 0.1 },
      code_required: { noul: 0.9 },
    }),
    skipped,
  )
  assert.equal(result.light, "FINE")
})

test("invented alone stays silent, and never upgrades the lead", () => {
  assert.equal(decide(answers({ invented: { noul: 0.96 } }), skipped).light, "FINE")
  assert.equal(decide(answers({ invented: { noul: 0.7 } }), skipped).light, "FINE")
  const withMiss = decide(
    answers({
      code_required: { noul: 0.7 },
      invented: { noul: 0.96 },
    }),
    skipped,
  )
  assert.equal(withMiss.tone, "probably")
  assert.match(reportLine(withMiss), /^Probably reprobe\./)
  assert.match(reportLine(withMiss), /name or a number/)
})

test("two high-weight misses both show, and an optional miss does not", () => {
  const result = decide(
    answers({
      docs_required: { noul: 0.91 },
      web_required: { noul: 0.8 },
      code_required: { noul: 0.2 },
    }),
    skipped,
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
  const result = decide(answers({ docs_required: { noul: 0.9 } }), skipped)
  assert.equal(
    reportLine(result),
    "Definitely reprobe. It needed the notes in the project, and it never opened them.",
  )
  assert.equal(reportLine(decide(answers(), skipped)), null)
})

test("Claude gets a title and a bell, Codex and Grok get the line only", () => {
  const result = decide(answers({ code_required: { noul: 0.9 } }), skipped)
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

test("a skill dump does not replace the human ask", () => {
  const jsonl = [
    row(
      "user",
      "<command-name>/orient</command-name>\n<command-args>on the folder</command-args>",
    ),
    row("user", "Base directory for this skill: /tmp\n# Orient\nRead the code."),
    row("assistant", [
      { type: "tool_use", id: "t1", name: "Read", input: { file_path: "AGENTS.md" } },
      { type: "text", text: "done" },
    ]),
  ].join("\n")
  const turn = lastTurnFromJsonl(jsonl)
  assert.equal(turn.user, "/orient on the folder")
  assert.match(turn.tools, /Read AGENTS.md/)
  assert.equal(turn.answer, "done")
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
