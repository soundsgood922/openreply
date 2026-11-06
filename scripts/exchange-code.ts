/**
 * Exchanges a one-time Facebook Login for Business authorization code for a
 * system user access token, writes it into .env.railway, and reports the
 * scopes the token actually carries.
 *
 *   npx tsx scripts/exchange-code.ts <code> <redirectUri>
 *
 * Reads INSTAGRAM/FACEBOOK app credentials from .env.railway.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const V = process.env.META_GRAPH_API_VERSION ?? "v25.0";
const FB = `https://graph.facebook.com/${V}`;
const APP_ID = "1174453164926610";
const ENV_PATH = resolve(process.cwd(), ".env.railway");

function readEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function upsertEnv(key: string, value: string) {
  const raw = readFileSync(ENV_PATH, "utf8");
  const line = `${key}=${value}`;
  const next = new RegExp(`^${key}=.*$`, "m").test(raw)
    ? raw.replace(new RegExp(`^${key}=.*$`, "m"), line)
    : raw.replace(/\s*$/, "\n") + line + "\n";
  writeFileSync(ENV_PATH, next, "utf8");
}

async function main() {
  const [code, redirectUri] = process.argv.slice(2);
  if (!code || !redirectUri) throw new Error("usage: tsx scripts/exchange-code.ts <code> <redirectUri>");

  const env = readEnv();
  const secret = env.FACEBOOK_APP_SECRET;
  if (!secret) throw new Error("FACEBOOK_APP_SECRET missing from .env.railway");

  const url = new URL(`${FB}/oauth/access_token`);
  url.searchParams.set("client_id", APP_ID);
  url.searchParams.set("client_secret", secret);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);

  const res = await fetch(url.toString());
  const body = (await res.json()) as Record<string, unknown>;

  if (!res.ok || body.error) {
    const e = (body.error ?? {}) as { code?: number; message?: string };
    console.log(`EXCHANGE FAILED http=${res.status} code=${e.code ?? "?"} ${e.message ?? JSON.stringify(body)}`);
    process.exit(1);
  }

  const token = String(body.access_token ?? "");
  console.log("exchange: OK");
  console.log("token length:", token.length, "| token_type:", body.token_type, "| expires_in:", body.expires_in ?? "(absent = never)");

  const dbg = await fetch(`${FB}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${APP_ID}|${secret}`);
  const d = ((await dbg.json()) as { data?: Record<string, unknown> }).data ?? {};
  const scopes = (d.scopes as string[]) ?? [];
  console.log("type:", d.type, "| expires_at:", d.expires_at === 0 ? "never" : d.expires_at);
  console.log("scopes:", scopes.join(", "));
  console.log("business_management present:", scopes.includes("business_management") ? "YES" : "NO");

  upsertEnv("META_SYSTEM_USER_TOKEN", token);
  console.log("\nwrote META_SYSTEM_USER_TOKEN to .env.railway");
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
