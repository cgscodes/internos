import { MatchError } from "./contracts.ts";
/** Never expose provider messages, which may include submitted content or credentials. */
export function providerFailure(error: unknown, signal?: AbortSignal) {
  if (error instanceof MatchError) return error;
  const status =
    error && typeof error === "object" && "status" in error
      ? Number(error.status)
      : 0;
  if (status === 429)
    return new MatchError(
      "Gemini quota is temporarily unavailable. Wait before trying again.",
      429,
      "provider_quota",
    );
  if (
    signal?.aborted ||
    (error instanceof Error && /Timeout|Abort/.test(error.name))
  )
    return new MatchError(
      "Analysis timed out. No result was saved. Try again shortly.",
      504,
      "timeout",
    );
  return new MatchError(
    "The AI service is unavailable. No result was saved. Try again later.",
    502,
    "provider_failure",
  );
}
