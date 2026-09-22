export const PLACES = ["code", "docs", "web", "system"]

const CODE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|php|sql|css|scss|html|vue|svelte|kt|swift|c|h|cpp|json|ya?ml|toml|sh)\b/i
const DOC_EXT = /\.(md|mdx|txt|rst|pdf|csv|tsv|docx|jsonl|opus|mp3|wav|m4a)\b/i
const DOC_FILE = /\b(AGENTS\.md|CLAUDE\.md|LOG\.md|STATE\.md|README\.md|SKILL\.md)\b/i
const WEB_TOOL = /\b(websearch|web_search|webfetch|web_fetch|open_page|open_page_with_find)\b/i
const LIVE_BROWSER =
  /gmail|claude-in-chrome|playwright|computer-use|browser_batch|form_input|read_page|read_network|tabs_context|tabs_close/i
const SYSTEM_CMD =
  /(^|\s)(curl|wget|ssh|dig|printenv|lsof|kubectl|docker|psql|redis-cli|systemctl|pm2|nc)\b/i
const SYSTEM_PS = /\b(ps aux|ps -ef|printenv|\benv\b)\b/i
const LIVE_HOST =
  /(localhost|127\.0\.0\.1|\.local\b|staging|netlify\.app|vercel\.app|supabase\.co|fly\.dev|railway\.app|beaconhouse\.in|thelaunch\.space)/i

export function lookedFromTools(toolsText) {
  const text = String(toolsText || "").trim()
  const places = { code: false, docs: false, web: false, system: false }
  const evidence = { code: [], docs: [], web: [], system: [] }
  if (!text || text === "none") {
    return pack(places, evidence, text)
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    const found = classifyLine(line)
    for (const place of found) {
      places[place] = true
      if (evidence[place].length < 4) evidence[place].push(clipBit(line))
    }
  }
  return pack(places, evidence, text)
}

export function lookedScore(value) {
  if (value === true || value === 1) return 1
  if (typeof value === "number") return value
  return 0
}

function pack(places, evidence, text) {
  return {
    code: places.code ? 1 : 0,
    docs: places.docs ? 1 : 0,
    web: places.web ? 1 : 0,
    system: places.system ? 1 : 0,
    evidence,
    names: extractNames(text),
  }
}

function classifyLine(line) {
  const found = new Set()
  const urls = line.match(/https?:\/\/[^\s)'"`]+/gi) || []
  let urlIsWeb = false
  for (const url of urls) {
    const place = urlPlace(url)
    found.add(place)
    if (place === "web") urlIsWeb = true
  }
  if (WEB_TOOL.test(line)) found.add("web")
  if (SYSTEM_CMD.test(line) || SYSTEM_PS.test(line)) found.add("system")
  if (DOC_FILE.test(line) || DOC_EXT.test(line) || /\b(chat_history|transcript)\b/i.test(line)) {
    found.add("docs")
  }
  if (CODE_EXT.test(line)) found.add("code")
  if (LIVE_BROWSER.test(line) && !urlIsWeb) found.add("system")
  return found
}

function urlPlace(url) {
  const clean = url.replace(/[),.;]+$/g, "")
  if (LIVE_HOST.test(clean) || /:(3000|3001|4173|5173|8000|8080|8888)\b/.test(clean)) {
    return "system"
  }
  return "web"
}

function extractNames(text) {
  const names = new Set()
  for (const match of String(text || "").match(/[A-Za-z0-9._-]{3,}/g) || []) {
    if (names.size >= 60) break
    names.add(match.slice(0, 40))
  }
  for (const match of String(text || "").match(/\d{2,}/g) || []) {
    if (names.size >= 80) break
    names.add(match)
  }
  return [...names]
}

function clipBit(line) {
  return line.replace(/\s+/g, " ").trim().slice(0, 80)
}
