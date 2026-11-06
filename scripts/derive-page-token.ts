/**
 * Turns the short-lived user token from the Graph API Explorer into a
 * never-expiring Page access token, then proves that token can actually reach
 * the Instagram account: profile, media, comments and the messaging edge.
 * Read-only — it sends nothing.
 *
 *   npx tsx scripts/derive-page-token.ts
 *
 * Reads META_USER_TOKEN, FACEBOOK_APP_SECRET and IG_ACCOUNT_ID from .env.railway
 * and writes META_PAGE_TOKEN back into it on success.
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

async function get(path: string, params: Record<string, string>) {
  const url = new URL(`${FB}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok && !body.error, body };
}

function errOf(body: Record<string, unknown>) {
  const e = (body.error ?? {}) as { code?: number; error_subcode?: number; message?: string };
  return `code=${e.code ?? "?"}/${e.error_subcode ?? "-"} ${e.message ?? ""}`;
}

async function main() {
  const env = readEnv();
  const userToken = env.META_USER_TOKEN;
  const secret = env.FACEBOOK_APP_SECRET;
  if (!userToken) throw new Error("META_USER_TOKEN missing from .env.railway");
  if (!secret) throw new Error("FACEBOOK_APP_SECRET missing from .env.railway");

  console.log("1. exchanging for a long-lived user token");
  const long = await get("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: APP_ID,
    client_secret: secret,
    fb_exchange_token: userToken,
  });
  if (!long.ok) {
    console.log("   FAIL", errOf(long.body));
    process.exit(1);
  }
  const longToken = String(long.body.access_token);
  console.log("   OK (expires_in:", long.body.expires_in, "seconds)");

  console.log("\n2. listing pages");
  const pages = await get("/me/accounts", {
    fields: "id,name,access_token,instagram_business_account{id,username}",
    access_token: longToken,
  });
  if (!pages.ok) {
    console.log("   FAIL", errOf(pages.body));
    process.exit(1);
  }
  type Page = { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } };
  const list = (pages.body.data ?? []) as Page[];
  console.log("   pages:", list.length);
  for (const p of list) {
    console.log(`   - ${p.name} (${p.id}) ig=${p.instagram_business_account ? `${p.instagram_business_account.username ?? "?"}(${p.instagram_business_account.id})` : "(none)"}`);
  }

  const withIg = list.find((p) => p.instagram_business_account);
  if (!withIg) {
    console.log("\n   no page has a linked Instagram business account - stopping");
    process.exit(1);
  }
  const pageToken = withIg.access_token;
  const igId = withIg.instagram_business_account!.id;

  console.log("\n3. checking the page token never expires");
  const dbg = await get("/debug_token", { input_token: pageToken, access_token: `${APP_ID}|${secret}` });
  const d = ((dbg.body.data ?? {}) as Record<string, unknown>);
  console.log("   type:", d.type, "| expires_at:", d.expires_at === 0 ? "never" : d.expires_at);
  console.log("   scopes:", ((d.scopes as string[]) ?? []).join(", "));

  console.log(`\n4. reading the Instagram account /${igId}`);
  const profile = await get(`/${igId}`, { fields: "id,username,name,followers_count,media_count", access_token: pageToken });
  console.log(profile.ok ? "   OK " + JSON.stringify(profile.body) : "   FAIL " + errOf(profile.body));

  console.log("\n5. reading recent media");
  const media = await get(`/${igId}/media`, { fields: "id,timestamp,comments_count,permalink", limit: "5", access_token: pageToken });
  if (!media.ok) {
    console.log("   FAIL", errOf(media.body));
  } else {
    const items = (media.body.data ?? []) as { id: string; timestamp: string; comments_count?: number }[];
    console.log("   posts:", items.length);
    for (const m of items) console.log(`   - ${m.id} ${m.timestamp?.slice(0, 10)} comments=${m.comments_count ?? 0}`);
    const withComments = items.find((m) => (m.comments_count ?? 0) > 0) ?? items[0];
    if (withComments) {
      console.log(`\n6. reading comments on ${withComments.id}`);
      const comments = await get(`/${withComments.id}/comments`, { fields: "id,text,username,timestamp", limit: "3", access_token: pageToken });
      console.log(comments.ok ? `   OK (${((comments.body.data ?? []) as unknown[]).length} comments)` : "   FAIL " + errOf(comments.body));
    }
  }

  console.log("\n7. checking the messaging edge");
  const convos = await get(`/${igId}/conversations`, { platform: "instagram", limit: "1", access_token: pageToken });
  console.log(convos.ok ? "   OK" : "   FAIL " + errOf(convos.body));

  upsertEnv("META_PAGE_TOKEN", pageToken);
  upsertEnv("IG_ACCOUNT_ID", igId);
  upsertEnv("FACEBOOK_PAGE_ID", withIg.id);
  console.log("\nwrote META_PAGE_TOKEN, IG_ACCOUNT_ID, FACEBOOK_PAGE_ID to .env.railway");
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
