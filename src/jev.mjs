import { questions } from "./light.mjs"

export async function judge(turn, apiKey, fetchImpl = fetch) {
  const response = await fetchImpl("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "jev-latest",
      state: turn,
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
