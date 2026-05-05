export function computeTokenUsage(payload: { prompt: string; completion: string }) {
  // Smoke-test approximation only: count whitespace-delimited words rather than model-specific tokens.
  const prompt = payload.prompt.trim();
  const completion = payload.completion.trim();
  const promptTokens = prompt.length === 0 ? 0 : prompt.split(/\s+/).length;
  const completionTokens = completion.length === 0 ? 0 : completion.split(/\s+/).length;
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}
