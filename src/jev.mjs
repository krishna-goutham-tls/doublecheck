import { questions } from "./light.mjs"
import { lookedFromTools } from "./looked.mjs"

export async function judge(turn, apiKey, fetchImpl = fetch) {
  const looked = turn.looked || lookedFromTools(turn.tools)
  const response = await fetchImpl("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "jev-latest",
      state: {
        user: turn.user,
        tools: turn.tools,
        answer: turn.answer,
        looked: {
          code: Boolean(looked.code),
          docs: Boolean(looked.docs),
          web: Boolean(looked.web),
          system: Boolean(looked.system),
          names: looked.names || [],
          evidence: looked.evidence || {},
        },
      },
      questions: questions(),
    }),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`TypeSafe ${response.status}: ${body.slice(0, 300)}`)
  }
  const payload = await response.json()
  return payload.answers
}
