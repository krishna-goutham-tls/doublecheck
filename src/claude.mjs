import { readdirSync, readFileSync, statSync } from "node:fs"
import { visibleUserText } from "./text.mjs"
import { homedir } from "node:os"
import { join } from "node:path"

const RESULT_CAP = 240

export function latestSessionFile(root = join(homedir(), ".claude", "projects")) {
  let best = null
  let bestMtime = 0
  let projects
  try {
    projects = readdirSync(root)
  } catch {
    return null
  }
  for (const project of projects) {
    const dir = join(root, project)
    let names
    try {
      if (!statSync(dir).isDirectory()) continue
      names = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (!name.endsWith(".jsonl")) continue
      const file = join(dir, name)
      let mtime
      try {
        mtime = statSync(file).mtimeMs
      } catch {
        continue
      }
      if (mtime > bestMtime) {
        best = file
        bestMtime = mtime
      }
    }
  }
  return best
}

export function lastTurnFromJsonl(text) {
  const events = []
  for (const line of text.split("\n")) {
    if (!line.trim()) continue
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (row.isSidechain) continue
    const message = row.message
    if (!message) continue
    const content = message.content
    if (message.role === "user") {
      if (typeof content === "string" && content.trim()) {
        const user = cleanUser(content)
        if (user) events.push({ kind: "user", text: user })
      } else if (Array.isArray(content)) {
        const texts = content
          .filter((part) => part && part.type === "text" && part.text)
          .map((part) => part.text)
        const user = texts.length ? cleanUser(texts.join("\n")) : ""
        if (user) events.push({ kind: "user", text: user })
        for (const part of content) {
          if (part && part.type === "tool_result") {
            events.push({
              kind: "result",
              id: part.tool_use_id,
              text: clip(stringify(part.content)),
            })
          }
        }
      }
    }
    if (message.role === "assistant" && Array.isArray(content)) {
      for (const part of content) {
        if (!part) continue
        if (part.type === "tool_use") {
          events.push({
            kind: "tool",
            id: part.id,
            name: part.name,
            input: part.input || {},
          })
        }
        if (part.type === "text" && part.text && part.text.trim()) {
          events.push({ kind: "text", text: part.text.trim() })
        }
      }
    }
  }

  const starts = []
  events.forEach((event, index) => {
    if (event.kind === "user") starts.push(index)
  })
  if (!starts.length) return null
  const start = starts[starts.length - 1]
  const slice = events.slice(start)
  const user = slice[0].text
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
    user: clip(user, 4000),
    tools: clip(toolLines.join("\n") || "none", 8000),
    answer: clip(texts.join("\n\n") || "(no text)", 4000),
  }
}

export function readLastTurn(file) {
  return lastTurnFromJsonl(readFileSync(file, "utf8"))
}

function cleanUser(text) {
  return visibleUserText(text)
}

function summarizeInput(input) {
  const keys = ["file_path", "path", "command", "pattern", "url", "query", "skill", "args"]
  const bits = []
  for (const key of keys) {
    if (input[key]) bits.push(String(input[key]).replace(/\s+/g, " ").slice(0, 180))
  }
  return redact(bits.join(" "))
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
  const clean = redact(text.replace(/\s+/g, " ").trim())
  if (clean.length <= max) return clean
  return `${clean.slice(0, max)}…`
}

function redact(text) {
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
}
