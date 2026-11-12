// Local test double only. Never used by application code or a deployed database.
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { createTestDatabase } from "./database.mjs";
const db = await createTestDatabase();
const sessions = new Map(),
  refreshTokens = new Map(),
  codes = new Map();
const appOrigin = "http://127.0.0.1:3100";
const job = (id, company, title) => ({
  id,
  company,
  title,
  location: "New York, NY",
  type: "Internship",
  source: "Automated test fixture",
  url: "",
  deadline: "2026-12-01",
  status: "Saved",
  notes: "",
  important_date: "",
  created_at: "2026-11-12T12:00:00+00:00",
});
const jobs = [
  job(
    "00000000-0000-4000-8000-000000000011",
    "Notion",
    "Software Engineer Intern",
  ),
  job("00000000-0000-4000-8000-000000000012", "Figma", "Product Design Intern"),
];
function issueSession(user) {
  const payload = {
    sub: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.internos-test-only`;
  const refresh = randomUUID();
  sessions.set(token, user);
  refreshTokens.set(refresh, user);

  return {
    access_token: token,
    refresh_token: refresh,
    token_type: "bearer",
    expires_in: 3600,
    user,
  };
}
async function bodyOf(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : {};
}
const server = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", appOrigin);
  response.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  );
  response.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,DELETE,HEAD,OPTIONS",
  );
  const send = (status, data) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(
      data === undefined
        ? ""
        : JSON.stringify(data, (key, value) =>
            ["deadline", "applied_on"].includes(key) &&
            typeof value === "string" &&
            /^\d{4}-\d{2}-\d{2}T/.test(value)
              ? value.slice(0, 10)
              : value,
          ),
    );
  };
  try {
    const url = new URL(request.url, "http://127.0.0.1:54329");
    if (request.method === "OPTIONS") return send(204);
    if (url.pathname === "/health") return send(200, { ok: true });
    const token = request.headers.authorization?.replace(/^Bearer /, "");
    const user = sessions.get(token);
    if (url.pathname === "/auth/v1/authorize") {
      const callback = new URL(
        url.searchParams.get("redirect_to") || appOrigin,
      );
      if (
        callback.origin !== appOrigin ||
        callback.pathname !== "/auth/callback" ||
        !url.searchParams.get("code_challenge")
      )
        return send(400, { error: "Invalid test OAuth request" });
      const code = randomUUID();
      codes.set(code, url.searchParams.get("code_challenge"));
      callback.searchParams.set("code", code);
      response.writeHead(302, { Location: callback.href });
      return response.end();
    }
    if (url.pathname === "/auth/v1/token") {
      const body = await bodyOf(request);
      if (url.searchParams.get("grant_type") === "refresh_token") {
        const existing = refreshTokens.get(body.refresh_token);
        if (!existing)
          return send(400, {
            code: "refresh_token_not_found",
            error_code: "refresh_token_not_found",
            message: "Refresh token expired",
          });
        return send(200, issueSession(existing));
      }
      const challenge = codes.get(body.auth_code);
      if (
        !challenge ||
        typeof body.code_verifier !== "string" ||
        createHash("sha256").update(body.code_verifier).digest("base64url") !==
          challenge
      )
        return send(400, {
          code: "bad_code_verifier",
          message: "Invalid PKCE verifier",
        });
      codes.delete(body.auth_code);
      const id = randomUUID();
      const identity = {
        id,
        aud: "authenticated",
        role: "authenticated",
        email: "alex@example.test",
        email_confirmed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        app_metadata: { provider: "google", providers: ["google"] },
        user_metadata: {
          full_name: "Alex Morgan",
          avatar_url: "https://images.example.test/avatar.svg",
        },
      };
      await db.query(
        "insert into auth.users(id,raw_user_meta_data) values($1,$2)",
        [id, JSON.stringify(identity.user_metadata)],
      );
      return send(200, issueSession(identity));
    }
    if (url.pathname === "/auth/v1/user")
      return user
        ? send(200, user)
        : send(401, {
            code: "session_not_found",
            message: "Session is not valid",
          });
    if (url.pathname === "/auth/v1/logout") {
      if (user) sessions.delete(token);
      return send(204);
    }
    if (!user) return send(401, { message: "Unauthorized" });
    if (url.pathname.startsWith("/rest/v1/")) {
      const result = await db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
          user.id,
        ]);
        const endpoint = url.pathname.slice("/rest/v1/".length);
        if (endpoint.startsWith("rpc/")) {
          const name = endpoint.slice(4);
          if (
            !["save_tracking_application", "save_tracking_job"].includes(name)
          )
            throw new Error("Unsupported test function");
          const body = await bodyOf(request);
          const result = await tx.query(
            `select public.${name}($1::jsonb,$2::boolean) as result`,
            [JSON.stringify(body.p_data), body.p_create],
          );
          return { data: result.rows[0].result, count: 1 };
        }
        const table = endpoint;
        if (
          ![
            "companies",
            "jobs",
            "user_jobs",
            "applications",
            "application_events",
            "profiles",
            "resumes",
          ].includes(table)
        )
          throw new Error("Unsupported test table");
        const ident = (value) => {
          if (!/^[a-z_]+$/.test(value)) throw new Error("Invalid identifier");
          return '"' + value + '"';
        };
        const values = [];
        const conditions = [];
        for (const [key, value] of url.searchParams) {
          if (value.startsWith("eq.")) {
            values.push(value.slice(3));
            conditions.push(`${ident(key)}=$${values.length}`);
          }
        }
        const where = conditions.length
          ? " where " + conditions.join(" and ")
          : "";
        const select = url.searchParams.get("select") || "*";
        const selection =
          select === "*" ? "*" : select.split(",").map(ident).join(",");
        if (request.method === "GET" || request.method === "HEAD") {
          const orders = (url.searchParams.get("order") || "")
            .split(",")
            .filter(Boolean)
            .map((order) => {
              const [key, direction] = order.split(".");
              return `${ident(key)} ${direction === "desc" ? "desc" : "asc"}`;
            });
          const count = Number(
            (
              await tx.query(
                `select count(*) as total from public.${ident(table)}${where}`,
                values,
              )
            ).rows[0].total,
          );
          const offset = Math.max(
            0,
            Number(url.searchParams.get("offset") || 0),
          );
          const limit = Math.max(
            0,
            Math.min(1000, Number(url.searchParams.get("limit") || 1000)),
          );
          const query = `select ${selection} from public.${ident(table)}${where}${orders.length ? " order by " + orders.join(",") : ""} offset ${offset} limit ${limit}`;
          return { data: (await tx.query(query, values)).rows, count };
        }
        if (request.method === "DELETE")
          return {
            data: (
              await tx.query(
                `delete from public.${ident(table)}${where} returning ${selection}`,
                values,
              )
            ).rows,
          };
        const body = await bodyOf(request);
        const keys = Object.keys(body);
        const dataValues = keys.map((key) => body[key]);
        if (request.method === "PATCH") {
          const updated = keys
            .map((key, index) => `${ident(key)}=$${values.length + index + 1}`)
            .join(",");
          return {
            data: (
              await tx.query(
                `update public.${ident(table)} set ${updated}${where} returning ${selection}`,
                [...values, ...dataValues],
              )
            ).rows,
          };
        }
        const conflictKeys = (url.searchParams.get("on_conflict") || "")
          .split(",")
          .filter(Boolean);
        let conflict = "";
        if (conflictKeys.length) {
          const resolution = request.headers.prefer?.includes(
            "ignore-duplicates",
          )
            ? "nothing"
            : "update set " +
              keys
                .map((key) => `${ident(key)}=excluded.${ident(key)}`)
                .join(",");
          conflict = ` on conflict (${conflictKeys.map(ident).join(",")}) do ${resolution}`;
        }
        return {
          data: (
            await tx.query(
              `insert into public.${ident(table)}(${keys.map(ident).join(",")}) values(${keys.map((_, i) => "$" + (i + 1)).join(",")})${conflict} returning ${selection}`,
              dataValues,
            )
          ).rows,
        };
      });
      if (result.count !== undefined)
        response.setHeader(
          "Content-Range",
          `0-${Math.max(0, result.count - 1)}/${result.count}`,
        );
      if (request.method === "HEAD") return send(200);
      if (request.headers.accept?.includes("application/vnd.pgrst.object+json"))
        return result.data.length === 1
          ? send(200, result.data[0])
          : send(406, { code: "PGRST116", message: "Row not found" });
      return send(200, result.data);
    }
    send(404, { message: "Unknown test endpoint" });
  } catch (error) {
    send(400, {
      code: error.code || "TEST_ERROR",
      message: "Local database request failed",
    });
  }
});
for (const [index, job] of jobs.entries()) {
  const companyId = `00000000-0000-4000-8000-${String(101 + index).padStart(12, "0")}`;
  await db.query("insert into public.companies(id,name) values($1,$2)", [
    companyId,
    job.company,
  ]);
  await db.query(
    "insert into public.jobs(id,company_id,company,title,location,type,source,url,deadline) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      job.id,
      companyId,
      job.company,
      job.title,
      job.location,
      job.type,
      job.source,
      job.url,
      job.deadline,
    ],
  );
}
server.listen(54329, "127.0.0.1");
