export function shouldRun(input) {
  if (input.stopHookActive || input.stop_hook_active) return false
  if (input.subagentType || input.subagent_type) return false
  if (input.reason && input.reason !== "end_turn") return false
  return true
}
