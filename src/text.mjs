const SKILL_BODY = /^\s*Base directory for this skill:/i
const TEAMMATE = /<teammate-message|Another Claude session sent a message/i
const NOISE_CMD = /^\/(model|quit|clear|help|cmd)\s*$/i

export function visibleUserText(text) {
  const stripped = String(text)
    .replace(/^\s*<!-- reply -->\s*/i, "")
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, "")
    .replace(/<environment_context>[\s\S]*?<\/environment_context>/gi, "")
    .replace(/<user_info>[\s\S]*?<\/user_info>/gi, "")
    .replace(/<rules>[\s\S]*?<\/rules>/gi, "")
    .replace(/<teammate-message[\s\S]*?<\/teammate-message>/gi, "")
    .trim()
  const command = commandText(stripped)
  if (command !== null) return command
  const query = stripped.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i)
  return humanOrEmpty(query ? query[1] : stripped)
}

function commandText(text) {
  const name = text.match(/<command-name>\s*([\s\S]*?)\s*<\/command-name>/i)
  if (!name) return null
  const cmd = name[1].trim()
  const args = text.match(/<command-args>\s*([\s\S]*?)\s*<\/command-args>/i)
  const extra = args ? args[1].trim() : ""
  const combined = extra ? `${cmd} ${extra}`.trim() : cmd
  if (NOISE_CMD.test(combined) || NOISE_CMD.test(cmd)) return ""
  return combined
}

function humanOrEmpty(text) {
  const value = String(text || "").trim()
  if (!value) return ""
  if (SKILL_BODY.test(value)) return ""
  if (TEAMMATE.test(value)) return ""
  if (NOISE_CMD.test(value) || value === "//model") return ""
  return value
}
