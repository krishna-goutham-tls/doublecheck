import assert from "node:assert/strict"
import test from "node:test"
import { lookedFromTools } from "../src/looked.mjs"
import { visibleUserText } from "../src/text.mjs"

test("source and markdown reads split code from docs", () => {
  const looked = lookedFromTools(
    "read_file /repo/src/hook.mjs → export\nRead AGENTS.md → router\nBash cat context-system/LOG.md",
  )
  assert.equal(looked.code, 1)
  assert.equal(looked.docs, 1)
  assert.equal(looked.web, 0)
  assert.equal(looked.system, 0)
})

test("bash grep of source counts as code", () => {
  const looked = lookedFromTools("Bash grep -n reminder-scheduler.ts netlify/functions")
  assert.equal(looked.code, 1)
})

test("jsonl transcripts and voice files count as docs", () => {
  const looked = lookedFromTools(
    "run_terminal_command python3 parse ~/.claude/projects/x.jsonl\nBash ffmpeg -i note.opus",
  )
  assert.equal(looked.docs, 1)
  assert.equal(looked.system, 0)
})

test("web search is web, curl and staging chrome are system", () => {
  const web = lookedFromTools("WebSearch current TypeSafe API")
  assert.equal(web.web, 1)
  const live = lookedFromTools(
    "mcp__claude-in-chrome__navigate https://staging-unified-form-bch.netlify.app/\ncurl http://localhost:3000/health",
  )
  assert.equal(live.system, 1)
  assert.equal(live.web, 0)
})

test("gmail and chrome without a docs url are system", () => {
  const looked = lookedFromTools(
    "mcp__claude_ai_Gmail__search_threads in:sent Make\nmcp__claude-in-chrome__browser_batch click",
  )
  assert.equal(looked.system, 1)
  assert.equal(looked.web, 0)
})

test("chrome on an official docs url is web", () => {
  const looked = lookedFromTools("mcp__claude-in-chrome__navigate https://docs.typesafe.ai/api")
  assert.equal(looked.web, 1)
  assert.equal(looked.system, 0)
})

test("date and empty tools are not a look", () => {
  assert.equal(lookedFromTools("Bash TZ=Asia/Kolkata date").code, 0)
  assert.equal(lookedFromTools("none").docs, 0)
  assert.equal(lookedFromTools("").system, 0)
})

test("visibleUserText keeps the human line and drops wrappers", () => {
  assert.equal(
    visibleUserText(
      "<command-name>/orient</command-name>\n<command-args>on @products/04</command-args>",
    ),
    "/orient on @products/04",
  )
  assert.equal(visibleUserText("Base directory for this skill: /tmp\n# Orient\nRead code"), "")
  assert.equal(visibleUserText("<user_info>os</user_info>\n<user_query>\nwhat next\n</user_query>"), "what next")
  assert.equal(visibleUserText("/model"), "")
})
