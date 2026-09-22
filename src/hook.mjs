#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { lastTurnFromJsonl } from "./claude.mjs"
import { lastTurnFromCodex } from "./codex.mjs"
import { grokHistoryFile, lastTurnFromGrok } from "./grok.mjs"
import { shouldRun } from "./gate.mjs"
import { judge } from "./jev.mjs"
import { decide, hookPayload } from "./light.mjs"

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
  writePayload({ systemMessage: "doublecheck: no TYPESAFE_API_KEY" })
  process.exit(0)
}

try {
  const result = decide(await judge(turn, apiKey))
  const payload = hookPayload(result, { ...input, grok: isGrok() })
  if (payload) writePayload(payload)
} catch (error) {
  writePayload({ systemMessage: "doublecheck: check failed" })
  console.error(String(error.message || error).slice(0, 200))
}
process.exit(0)

function turnFromHook(input) {
  const transcript = input.transcript_path || input.transcriptPath
  if (transcript && existsSync(transcript)) {
    const text = readFileSync(transcript, "utf8")
    const claude = lastTurnFromJsonl(text)
    if (claude) return claude
    const codex = lastTurnFromCodex(text)
    if (codex) return codex
    const grok = lastTurnFromGrok(text)
    if (grok) return grok
  }
  const sessionId = process.env.GROK_SESSION_ID || input.session_id || input.sessionId
  const history = grokHistoryFile(sessionId)
  if (history) return lastTurnFromGrok(readFileSync(history, "utf8"))
  return null
}

function writePayload(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

function isGrok() {
  return Boolean(process.env.GROK_SESSION_ID || process.env.GROK_HOOK_EVENT)
}

function loadEnvLocal() {
  loadEnvFile(join(homedir(), ".doublecheck", ".env.local"))
  loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local"))
}

function loadEnvFile(file) {
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
