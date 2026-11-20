import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import {
  MATCH_MODEL,
  MatchError,
  modelAnalysisSchema,
  type MatchProvider,
} from "./contracts.ts";
import { MATCH_SYSTEM_PROMPT } from "./analysis.ts";
import { providerFailure } from "./provider-error.ts";

export const geminiProvider: MatchProvider = {
  model: MATCH_MODEL,
  async analyze(input, signal) {
    const key = process.env.GEMINI_API_KEY;
    if (!key)
      throw new MatchError(
        "AI matching is not configured yet. Add the server-side Gemini key and try again.",
        503,
        "not_configured",
      );
    try {
      const client = new GoogleGenAI({
        apiKey: key,
        httpOptions: { timeout: 25000, retryOptions: { attempts: 1 } },
      });
      const result = await client.models.generateContent({
        model: MATCH_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: JSON.stringify({
                  untrusted_resume: input.resume,
                  untrusted_job: input.job,
                }),
              },
            ],
          },
        ],
        config: {
          systemInstruction: MATCH_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(modelAnalysisSchema),
          maxOutputTokens: 6000,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          automaticContinuation: false,
          store: false,
          abortSignal: signal,
        },
      });
      const usage: Record<string, number> = {};
      for (const field of [
        "promptTokenCount",
        "candidatesTokenCount",
        "totalTokenCount",
        "thoughtsTokenCount",
        "cachedContentTokenCount",
      ] as const) {
        const value = result.usageMetadata?.[field];
        if (typeof value === "number" && Number.isFinite(value) && value >= 0)
          usage[field] = value;
      }
      return { text: result.text || "", usage };
    } catch (error) {
      throw providerFailure(error, signal);
    }
  },
};
