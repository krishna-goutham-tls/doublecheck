import { readdirSync, statSync } from "node:fs"
import { visibleUserText } from "./text.mjs"
import { homedir } from "node:os"
import { join } from "node:path"

const RESULT_CAP = 240

export function grokHistoryFile(sessionId, root = join(homedir(), ".grok", "sessions")) {
  if (!sessionId) return null
  return walk(root, sessionId, 0)
}

export function lastTurnFromGrok(text) {
  const events = []
  for (const line of text.split("\n")) {
    if (!line.trim()) continue
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (row.type === "user") {
      const text = userText(row.content)
      if (text) events.push({ kind: "user", text })
    }
    if (row.type === "assistant") {
      for (const call of row.tool_calls || []) {
        events.push({ kind: "tool", id: call.id, name: call.name, input: parseArgs(call.arguments) })
      }
      const text = userText(row.content)
      if (text) events.push({ kind: "text", text })
    }
    if (row.type === "tool_result") {
      events.push({ kind: "result", id: row.tool_call_id, text: clip(stringify(row.content)) })
    }
  }
  const starts = []
  events.forEach((event, index) => {
    if (event.kind === "user") starts.push(index)
  })
  if (!starts.length) return null
  const slice = events.slice(starts[starts.length - 1])
  const tools = []
  const texts = []
  const results = new Map()
  for (const event of slice.slice(1)) {
    if (event.kind === "tool") tools.push(event)
    if (event.kind === "result") results.set(event.id, event.text)
    if (event.kind === "text") texts.push(event.text)
  }
  const toolLines = tools.map((tool) => {
    const line = `${tool.name} ${summarizeInput(tool.input)}`.trim()
    const result = results.get(tool.id)
    return result ? `${line} → ${result}` : line
  })
  return {
    user: clip(slice[0].text, 4000),
    tools: clip(toolLines.join("\n") || "none", 8000),
    answer: clip(texts.join("\n\n") || "(no text)", 4000),
  }
}

function walk(dir, sessionId, depth) {
  if (depth > 3) return null
  let names
  try {
    names = readdirSync(dir)
  } catch {
    return null
  }
  for (const name of names) {
    const path = join(dir, name)
    let stat
    try {
      stat = statSync(path)
    } catch {
      continue
    }
    if (!stat.isDirectory()) continue
    if (name === sessionId) {
      const history = join(path, "chat_history.jsonl")
      try {
        if (statSync(history).isFile()) return history
      } catch {
        return null
      }
    }
    const found = walk(path, sessionId, depth + 1)
    if (found) return found
  }
  return null
}

function userText(content) {
  let text = ""
  if (typeof content === "string") text = content
  else if (Array.isArray(content)) {
    text = content
      .filter((part) => part && (part.type === "text" || part.text))
      .map((part) => part.text || "")
      .join("\n")
  }
  return visibleUserText(text)
}

function parseArgs(value) {
  if (!value) return {}
  if (typeof value === "object") return value
  try {
    return JSON.parse(value)
  } catch {
    return { command: String(value) }
  }
}

function summarizeInput(input) {
  const keys = ["target_file", "file_path", "path", "command", "pattern", "url", "query"]
  const bits = []
  for (const key of keys) {
    if (input[key]) bits.push(String(input[key]).replace(/\s+/g, " ").slice(0, 180))
  }
  return bits.join(" ")
}

function stringify(content) {
  if (typeof content === "string") return content
  if (content == null) return ""
  try {
    return JSON.stringify(content)
  } catch {
    return ""
  }
}

function clip(text, max = RESULT_CAP) {
  const clean = String(text).replace(/\s+/g, " ").trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max)}…`
}
