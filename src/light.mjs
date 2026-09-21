const YES = 0.5

const QUESTIONS = {
  ask_type: {
    type: "choice",
    instructions: "Which type is `user`?",
    criteria: {
      none: "New file, chit-chat, or language trivia. No look required.",
      code: "How existing project source works.",
      docs: "What a markdown file or the user's paste says.",
      system: "Current running machine or service.",
      web: "A live vendor or API contract outside the repo.",
    },
  },
  looked: {
    type: "noul",
    instructions:
      "Did `tools` include the look that type requires? For docs, a read of the markdown counts as yes.",
  },
  invented: {
    type: "noul",
    instructions:
      "Does `answer` state a name, label, or number that `tools` says is not in the file?",
  },
}

export function questions() {
  return QUESTIONS
}

export function decide(answers) {
  const type = answers.ask_type.choice
  const looked = answers.looked.noul
  const invented = answers.invented.noul
  const reasons = []
  if (type !== "none" && looked < YES) reasons.push("looked")
  if (invented >= YES) reasons.push("invented")
  return {
    light: reasons.length ? "REPROBE" : "FINE",
    type,
    looked,
    invented,
    reasons,
  }
}
