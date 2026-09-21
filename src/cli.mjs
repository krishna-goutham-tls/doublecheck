#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { latestSessionFile, readLastTurn } from "./claude.mjs"
import { judge } from "./jev.mjs"
import { decide } from "./light.mjs"

loadEnvLocal()

const command = process.argv[2] || "last"
if (command !== "last") {
  console.error("Usage: doublecheck last [--file path]")
  process.exit(2)
}

const fileFlag = process.argv.indexOf("--file")
const file = fileFlag === -1 ? latestSessionFile() : process.argv[fileFlag + 1]
if (!file) {
  console.error("No Claude session JSONL under ~/.claude/projects")
  process.exit(2)
}

const turn = readLastTurn(file)
if (!turn) {
  console.error(`No user turn in ${file}`)
  process.exit(2)
}

const apiKey = process.env.TYPESAFE_API_KEY
if (!apiKey) {
  console.error("Set TYPESAFE_API_KEY. Nothing was sent.")
  process.exit(2)
}

const answers = await judge(turn, apiKey)
const result = decide(answers)
const looked = result.looked.toFixed(2)
const invented = result.invented.toFixed(2)
console.log(result.light)
console.log(`${result.type} · looked ${looked} · invented ${invented}`)
if (result.reasons.length) console.log(result.reasons.join(", "))

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
