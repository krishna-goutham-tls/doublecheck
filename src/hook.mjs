#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs"
import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { lastTurnFromJsonl } from "./claude.mjs"
import { grokHistoryFile, lastTurnFromGrok } from "./grok.mjs"
import { shouldRun } from "./gate.mjs"
import { judge } from "./jev.mjs"
import { decide } from "./light.mjs"

loadEnvLocal()

const raw = await readStdin()
let input = {}
try {
  input = raw.trim() ? JSON.parse(raw) : {}
} catch {
  process.exit(0)
}

if (!shouldRun(input)) process.exit(0)

const turn = turnFromHook(input)
if (!turn) process.exit(0)

const apiKey = process.env.TYPESAFE_API_KEY
if (!apiKey) {
  show("doublecheck: no TYPESAFE_API_KEY", isGrok())
  process.exit(0)
}

try {
  const result = decide(await judge(turn, apiKey))
  const line = [
    `doublecheck: ${result.light}`,
    `${result.type} · looked ${result.looked.toFixed(2)} · invented ${result.invented.toFixed(2)}`,
  ].join("\n")
  show(line, isGrok())
} catch (error) {
  show(`doublecheck: check failed`, isGrok())
  console.error(String(error.message || error).slice(0, 200))
}
process.exit(0)

function turnFromHook(input) {
  const transcript = input.transcript_path || input.transcriptPath
  if (transcript && existsSync(transcript)) {
    const text = readFileSync(transcript, "utf8")
    const claude = lastTurnFromJsonl(text)
    if (claude) return claude
    const grok = lastTurnFromGrok(text)
    if (grok) return grok
  }
  const sessionId = process.env.GROK_SESSION_ID || input.session_id || input.sessionId
  const history = grokHistoryFile(sessionId)
  if (history) return lastTurnFromGrok(readFileSync(history, "utf8"))
  return null
}

function show(line, grok) {
  notify(line)
  if (grok) {
    console.error(line)
    return
  }
  process.stdout.write(`${JSON.stringify({ systemMessage: line })}\n`)
}

function notify(line) {
  const [title, ...rest] = line.split("\n")
  const body = rest.join(" ").replace(/\\/g, "\\\\").replace(/"/g, '\\"')
  const safeTitle = title.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
  const script = `display notification "${body}" with title "${safeTitle}"`
  const child = spawn("osascript", ["-e", script], { stdio: "ignore", detached: true })
  child.unref()
}

function isGrok() {
  return Boolean(process.env.GROK_SESSION_ID || process.env.GROK_HOOK_EVENT)
}

function loadEnvLocal() {
  const file = join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local")
  if (!existsSync(file)) return
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

function readStdin() {
  return new Promise((resolve) => {
    let data = ""
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk) => {
      data += chunk
    })
    process.stdin.on("end", () => resolve(data))
    if (process.stdin.isTTY) resolve("")
  })
}
