export function visibleUserText(text) {
  const stripped = String(text)
    .replace(/^\s*<!-- reply -->\s*/i, "")
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, "")
    .replace(/<environment_context>[\s\S]*?<\/environment_context>/gi, "")
    .replace(/<user_info>[\s\S]*?<\/user_info>/gi, "")
    .replace(/<rules>[\s\S]*?<\/rules>/gi, "")
    .trim()
  const query = stripped.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i)
  return (query ? query[1] : stripped).trim()
}
