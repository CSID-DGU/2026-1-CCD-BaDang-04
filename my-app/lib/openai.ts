export function getOpenAiApiKey() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  return apiKey;
}

export function getAnalysisModel() {
  return process.env.OPENAI_ANALYSIS_MODEL ?? "gpt-4o-mini";
}

