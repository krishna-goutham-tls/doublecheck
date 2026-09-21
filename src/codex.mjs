import { visibleUserText } from "./text.mjs"

const RESULT_CAP = 240

export function lastTurnFromCodex(text) {
  const events = []
  for (const line of text.split("\n")) {
    if (!line.trim()) continue
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (row.type !== "response_item") continue
    const payload = row.payload || {}
    if (payload.type === "message" && payload.role === "user") {
      const user = visibleUserText(partsText(payload.content))
      if (user) events.push({ kind: "user", text: user })
    }
    if (payload.type === "message" && payload.role === "assistant") {
      const answer = partsText(payload.content).trim()
      if (answer) events.push({ kind: "text", text: answer })
    }
    if (payload.type === "function_call") {
      events.push({
        kind: "tool",
        id: payload.call_id,
        name: payload.name || "tool",
        input: parseArgs(payload.arguments),
      })
    }
    if (payload.type === "function_call_output") {
      events.push({ kind: "result", id: payload.call_id, text: clip(stringify(payload.output)) })
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
    const line = `${tool.name} ${summarize(tool.input)}`.trim()
    const result = results.get(tool.id)
    return result ? `${line} → ${result}` : line
  })
  return {
    user: clip(slice[0].text, 4000),
    tools: clip(toolLines.join("\n") || "none", 8000),
    answer: clip(texts.join("\n\n") || "(no text)", 4000),
  }
}

function partsText(content) {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .filter((part) => part && (part.text || part.input_text || part.output_text))
    .map((part) => part.text || part.input_text || part.output_text || "")
    .join("\n")
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

function summarize(input) {
  const keys = ["file_path", "path", "cmd", "command", "pattern", "url", "query"]
  return keys
    .filter((key) => input[key])
    .map((key) => String(input[key]).replace(/\s+/g, " ").slice(0, 180))
    .join(" ")
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
