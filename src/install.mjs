import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createInterface } from "node:readline"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HOOK_NAME = "doublecheck"

export async function install(options = {}) {
  const home = options.home || homedir()
  const runtimeSrc = join(home, ".doublecheck", "runtime", "src")
  mkdirSync(runtimeSrc, { recursive: true })
  const packageSrc = join(dirname(fileURLToPath(import.meta.url)))
  for (const name of [
    "claude.mjs",
    "codex.mjs",
    "gate.mjs",
    "grok.mjs",
    "hook.mjs",
    "jev.mjs",
    "light.mjs",
    "text.mjs",
  ]) {
    cpSync(join(packageSrc, name), join(runtimeSrc, name))
  }

  const command = `node ${join(runtimeSrc, "hook.mjs")}`
  const group = { hooks: [{ type: "command", command, timeout: 30 }] }
  const wired = []

  wired.push(mergeJson(join(home, ".claude", "settings.json"), (config) => upsertWrapped(config, group)))
  wired.push(writeJson(join(home, ".grok", "hooks", "doublecheck.json"), { hooks: { Stop: [group] } }))
  wired.push(mergeJson(join(home, ".codex", "hooks.json"), (config) => upsertWrapped(config, group)))
  wired.push(mergeJson(join(home, ".factory", "hooks.json"), (config) => upsertDroid(config, group)))

  const keyFile = join(home, ".doublecheck", ".env.local")
  const saved = await ensureKey(keyFile, packageSrc, options)
  return { command, wired, keyFile, saved }
}

export function upsertWrapped(config, group) {
  config.hooks = config.hooks || {}
  config.hooks.Stop = replaceOurs(config.hooks.Stop, group)
  return config
}

export function upsertDroid(config, group) {
  if (config.hooks && !config.Stop) {
    config.hooks.Stop = replaceOurs(config.hooks.Stop, group)
    return config
  }
  config.Stop = replaceOurs(config.Stop, group)
  return config
}

function replaceOurs(existing, group) {
  const groups = Array.isArray(existing) ? existing : []
  const kept = groups.filter((item) => !isOurs(item))
  kept.push(group)
  return kept
}

function isOurs(group) {
  return (group.hooks || []).some((hook) => String(hook.command || "").includes(`${HOOK_NAME}/runtime/src/hook.mjs`) || String(hook.command || "").includes("did-it-look/repo/src/hook.mjs"))
}

function mergeJson(file, edit) {
  mkdirSync(dirname(file), { recursive: true })
  const current = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {}
  writeFileSync(file, `${JSON.stringify(edit(current), null, 2)}\n`)
  return file
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
  return file
}

async function ensureKey(keyFile, packageSrc, options) {
  if (existsSync(keyFile) && readKey(keyFile)) return "already set"
  const fromPackage = readKey(join(dirname(packageSrc), ".env.local"))
  const fromEnv = process.env.TYPESAFE_API_KEY
  let key = fromEnv || fromPackage || ""
  if (!key && options.ask !== false && process.stdin.isTTY) {
    key = (await ask("Paste your TypeSafe API key in this terminal only: ")).trim()
  }
  if (!key) return "missing"
  writeFileSync(keyFile, `TYPESAFE_API_KEY=${key}\n`, { mode: 0o600 })
  return "saved"
}

function readKey(file) {
  if (!existsSync(file)) return ""
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.startsWith("TYPESAFE_API_KEY=")) return line.slice("TYPESAFE_API_KEY=".length).trim()
  }
  return ""
}

function ask(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(prompt, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}
