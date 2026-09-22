export const PLACES = ["code", "docs", "web", "system"]

const PROBABLY = 0.5
const DEFINITELY = 0.85

const SAID = {
  definitely: {
    code: "It needed the code, and it never opened it.",
    docs: "It needed the notes in the project, and it never opened them.",
    web: "It needed the current docs on the web, and it never searched.",
    system: "It needed to check what's actually running, and it never did.",
  },
  probably: {
    code: "It probably needed the code, and I don't see it opened.",
    docs: "It probably needed the notes in the project, and I don't see them opened.",
    web: "It probably needed the current docs on the web, and I don't see a search.",
    system: "It probably needed to check what's actually running, and I don't see that check.",
  },
  also: {
    code: "It probably needed the code too, and I don't see it opened.",
    docs: "It probably needed the notes too, and I don't see them opened.",
    web: "It probably needed the current docs on the web too, and I don't see a search.",
    system: "It probably needed to check what's running too, and I don't see that check.",
  },
}

const SHORT = {
  code: "the code",
  docs: "the notes",
  web: "the current docs on the web",
  system: "a check of what's running",
}

const QUESTIONS = {
  code_required: {
    type: "noul",
    instructions:
      "Does `user` need existing project source to answer? Yes for how this repo works. No for a new file, chit-chat, language trivia, or a fact already in the prompt.",
  },
  code_looked: {
    type: "noul",
    instructions:
      "Did `tools` open existing project source this turn? A read of code, tests, or app config counts. A markdown read does not.",
  },
  docs_required: {
    type: "noul",
    instructions:
      "Does `user` need a project markdown file to answer? Yes when the ask is about what that file says. No when the user already pasted the whole source.",
  },
  docs_looked: {
    type: "noul",
    instructions: "Did `tools` read the markdown file this ask is about?",
  },
  web_required: {
    type: "noul",
    instructions:
      "Does `user` need a web search or the current official docs outside the repo? Yes when that page can change. No for language trivia.",
  },
  web_looked: {
    type: "noul",
    instructions: "Did `tools` search or open that live page this turn?",
  },
  system_required: {
    type: "noul",
    instructions:
      "Does `user` need the current machine or a running service? Yes for env, a process, a database, or deployed config. No for the README.",
  },
  system_looked: {
    type: "noul",
    instructions:
      "Did `tools` inspect that running state this turn? Env, a process list, curl to their service, a database read, or deployed config counts.",
  },
  invented: {
    type: "noul",
    instructions:
      "Does `answer` state a name, label, or number that `tools` does not support?",
  },
}

export function questions() {
  return QUESTIONS
}

export function decide(answers) {
  const reasons = []
  const places = {}
  for (const place of PLACES) {
    const required = noul(answers, `${place}_required`)
    const looked = noul(answers, `${place}_looked`)
    const confidence = placeConfidence(required, looked)
    const tone = toneOf(confidence)
    places[place] = { required, looked, confidence }
    if (tone) reasons.push({ kind: place, confidence, tone })
  }
  const invented = noul(answers, "invented")
  const inventedConfidence = invented != null && invented > PROBABLY ? invented : 0
  const inventedTone = toneOf(inventedConfidence)
  if (inventedTone) reasons.push({ kind: "invented", confidence: inventedConfidence, tone: inventedTone })
  const tone = reasons.some((reason) => reason.tone === "definitely")
    ? "definitely"
    : reasons.length
      ? "probably"
      : null
  return {
    light: tone ? "REPROBE" : "FINE",
    tone,
    reasons,
    places,
    invented,
  }
}

export function reportLine(result) {
  if (!result || result.light !== "REPROBE") return null
  const places = (result.reasons || []).filter((reason) => reason.kind !== "invented")
  const invented = (result.reasons || []).find((reason) => reason.kind === "invented")
  const sure = places.filter((reason) => reason.tone === "definitely")
  const maybe = places.filter((reason) => reason.tone === "probably")
  const lead = result.tone === "definitely" ? "Definitely reprobe." : "Probably reprobe."
  const parts = [lead]
  if (sure.length) parts.push(placeClause(sure, "definitely"))
  if (maybe.length) parts.push(sure.length ? followClause(maybe) : placeClause(maybe, "probably"))
  if (invented) parts.push(inventedClause(invented.tone))
  return parts.join(" ")
}

export function titleFor(result) {
  if (!result || result.light !== "REPROBE") return ""
  return result.tone === "definitely" ? "Definitely reprobe" : "Probably reprobe"
}

function placeClause(items, tone) {
  if (items.length === 1) return SAID[tone][items[0].kind]
  const names = joinAnd(items.map((item) => SHORT[item.kind]))
  if (items.length === 2) {
    if (tone === "definitely") return `It needed ${names}, and it skipped both.`
    return `It probably needed ${names}, and I don't see either.`
  }
  if (tone === "definitely") return `It needed ${names}, and it skipped all of them.`
  return `It probably needed ${names}, and I don't see any of them.`
}

function followClause(items) {
  if (items.length === 1) return SAID.also[items[0].kind]
  const names = joinAnd(items.map((item) => SHORT[item.kind]))
  if (items.length === 2) return `It probably needed ${names} too, and I don't see either.`
  return `It probably needed ${names} too, and I don't see any of them.`
}

function inventedClause(tone) {
  if (tone === "definitely") {
    return "It put in a name or a number that isn't in what it opened."
  }
  return "It might have put in a name or a number that isn't in what it opened."
}

function joinAnd(items) {
  if (items.length <= 1) return items[0] || ""
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`
}

export function hookPayload(result, input = {}) {
  const line = reportLine(result)
  if (!line) return null
  const payload = { systemMessage: line }
  if (useTitle(input)) payload.terminalSequence = claudeTerminalSequence(titleFor(result))
  return payload
}

export function claudeTerminalSequence(title) {
  const safe = String(title || "Reprobe").replace(/[\u0000-\u001f\u007f]/g, "")
  return `\u001b]0;${safe}\u0007\u001b]2;${safe}\u0007\u0007`
}

function placeConfidence(required, looked) {
  if (required == null || looked == null) return 0
  if (!(required > PROBABLY) || !(looked < PROBABLY)) return 0
  return Math.min(required, 1 - looked)
}

function toneOf(confidence) {
  if (confidence > DEFINITELY) return "definitely"
  if (confidence > PROBABLY) return "probably"
  return null
}

function useTitle(input) {
  if (input.grok) return false
  if (input.turn_id || input.turnId) return false
  return true
}

function noul(answers, key) {
  const value = answers?.[key]?.noul
  return typeof value === "number" ? value : null
}
