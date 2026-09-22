import { lookedScore } from "./looked.mjs"

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
  needs_look: {
    type: "noul",
    instructions:
      "Does THIS `user` prompt need any look beyond what the user already pasted or said? Score this prompt only, not the thread topic. 0 = copy edit, ELI5 of the previous answer, what-next from this session, give-me-the-path, a paste of logs or screenshots that is the evidence, chit-chat, or a new file from scratch. 1 = answering requires opening code, project notes, a live page, or a running service this turn.",
  },
  code_required: {
    type: "noul",
    instructions:
      "Weight for existing project source on THIS prompt only. 1 = mandatory (how this file or bug works). 0.7 = high. 0.3 = optional. 0 = not needed. No for copy edits, email drafts, ELI5, what-next, a paste of the code, a new file, or language trivia. A live-ops thread does not make code mandatory.",
  },
  docs_required: {
    type: "noul",
    instructions:
      "Weight for a project markdown, LOG, STATE, transcript, or similar note on THIS prompt only. 1 = mandatory when the ask is what that file says. 0.3 = optional. 0 = not needed. No when the user already pasted the note, log, or recording.",
  },
  web_required: {
    type: "noul",
    instructions:
      "Weight for a current official page outside the repo on THIS prompt only. 1 = mandatory when that contract can change. 0 = not needed. No for an in-stack term, language trivia, Wikipedia, or a file on disk.",
  },
  system_required: {
    type: "noul",
    instructions:
      "Weight for the current machine or a running service on THIS prompt only. 1 = mandatory for env, a process, a database, curl to their service, or a live mailbox. Files on disk (source, markdown, jsonl transcripts) are not system. No for README, a paste of logs, a screenshot, or 'sessions' as files to read.",
  },
  invented: {
    type: "noul",
    instructions:
      "Does `answer` invent a name, label, or number that is not in `user`, `tools`, or `looked.names`? No when the name was in the prompt, the paste, a tool path, or a count taken from opened files. No for wording in an email draft. Yes only for a world fact that needed a look and is missing from the evidence.",
  },
}

export function questions() {
  return QUESTIONS
}

export function decide(answers, looked = {}) {
  const reasons = []
  const places = {}
  const needs = noul(answers, "needs_look")
  const gateOff = needs != null && !(needs > PROBABLY)
  for (const place of PLACES) {
    let required = noul(answers, `${place}_required`)
    if (gateOff && required != null) required = Math.min(required, PROBABLY)
    const didLook = lookedScore(looked[place])
    const confidence = placeConfidence(required, didLook)
    const tone = toneOf(confidence)
    places[place] = { required, looked: didLook, confidence }
    if (tone) reasons.push({ kind: place, confidence, tone })
  }
  const invented = noul(answers, "invented")
  const inventedConfidence = invented != null && invented > DEFINITELY ? invented : 0
  if (inventedConfidence && reasons.length) {
    reasons.push({ kind: "invented", confidence: inventedConfidence, tone: "probably" })
  }
  const placeMiss = reasons.filter((reason) => reason.kind !== "invented")
  const tone = placeMiss.some((reason) => reason.tone === "definitely")
    ? "definitely"
    : placeMiss.length
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
  if (required == null) return 0
  if (!(required > PROBABLY)) return 0
  if (looked > PROBABLY) return 0
  return required
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
