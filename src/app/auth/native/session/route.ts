import { getVerifiedUser } from "@/lib/supabase/server";
import { nativeResponse } from "@/lib/auth/native-server";
export async function GET() {
  return nativeResponse({ authenticated: Boolean(await getVerifiedUser()) });
}
