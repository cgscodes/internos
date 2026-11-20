import { handleMatchRequest } from "@/lib/ai/http";
import { authorizedMatchStore } from "@/lib/ai/store";
import { geminiProvider } from "@/lib/ai/gemini";
export const runtime = "nodejs";
export const maxDuration = 60;
export function POST(request: Request) {
  return handleMatchRequest(request, {
    authorize: authorizedMatchStore,
    provider: geminiProvider,
  });
}
export function GET(request: Request) {
  return handleMatchRequest(request, {
    authorize: authorizedMatchStore,
    provider: geminiProvider,
  });
}
