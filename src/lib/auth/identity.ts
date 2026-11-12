import type { User } from "@supabase/supabase-js";

export function userIdentity(user: User) {
  const metadata = user.user_metadata;
  const name = [metadata.full_name, metadata.name].find(
    (value) => typeof value === "string" && value.trim(),
  );
  const picture = [metadata.avatar_url, metadata.picture].find(
    (value) => typeof value === "string" && /^https:\/\//.test(value),
  );
  return {
    id: user.id,
    full_name:
      typeof name === "string"
        ? name
        : user.email?.split("@")[0] || "Your workspace",
    avatar_url: typeof picture === "string" ? picture : null,
  };
}
