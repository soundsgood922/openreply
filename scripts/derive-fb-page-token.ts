/**
 * Turns the Graph API Explorer user token in .env.fbtest into a never-expiring
 * Page token for the Facebook Page test, reports which permissions it carries,
 * and optionally finds a post's id from its link. Sends nothing.
 *
 *   npx tsx scripts/derive-fb-page-token.ts [post-url]
 *
 * Reads META_USER_TOKEN from .env.fbtest and FACEBOOK_APP_SECRET from
 * .env.railway; writes FB_PAGE_TOKEN and FACEBOOK_PAGE_ID into .env.fbtest.
 * .env.railway is never written.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const V = process.env.META_GRAPH_API_VERSION ?? "v25.0";
const FB = `https://graph.facebook.com/${V}`;
const APP_ID = "1174453164926610";
const PAGE_ID = "102026719003284";
const TEST_ENV = resolve(process.cwd(), ".env.fbtest");

function readEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^(["'])(.*)$/, "$2");
  }
  return out;
}

function upsert(key: string, value: string) {
  const raw = readFileSync(TEST_ENV, "utf8");
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  writeFileSync(TEST_ENV, re.test(raw) ? raw.replace(re, line) : raw.replace(/\s*$/, "\n") + line + "\n", "utf8");
}

async function get(path: string, params: Record<string, string>) {
  const url = new URL(`${FB}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok || body.error) {
    const e = body.error ?? {};
    throw new Error(`${path}: code=${e.code}/${e.error_subcode ?? "-"} ${e.message ?? res.status}`);
  }
  return body;
}

async function main() {
  const userToken = readEnv(TEST_ENV).META_USER_TOKEN;
  const secret = readEnv(resolve(process.cwd(), ".env.railway")).FACEBOOK_APP_SECRET;
  if (!userToken) throw new Error("META_USER_TOKEN missing from .env.fbtest");
  if (!secret) throw new Error("FACEBOOK_APP_SECRET missing from .env.railway");

  const long = await get("/oauth/access_token", {
    grant_type: "fb_exchange_token", client_id: APP_ID, client_secret: secret, fb_exchange_token: userToken,
  });
  console.log("1. long-lived user token OK");

  const pages = await get("/me/accounts", { fields: "id,name,access_token", access_token: long.access_token });
  const page = (pages.data as { id: string; name: string; access_token: string }[]).find((p) => p.id === PAGE_ID);
  if (!page) throw new Error(`page ${PAGE_ID} not granted; pages seen: ${(pages.data as any[]).map((p) => p.name).join(", ")}`);
  console.log(`2. page token for ${page.name}`);

  const dbg = await get("/debug_token", { input_token: page.access_token, access_token: `${APP_ID}|${secret}` });
  const d = dbg.data;
  console.log(`3. type=${d.type} expires_at=${d.expires_at === 0 ? "never" : d.expires_at}`);
  console.log(`   scopes: ${(d.scopes as string[]).join(", ")}`);
  const need = ["pages_read_engagement", "pages_read_user_content", "pages_manage_engagement", "pages_messaging"];
  const missing = need.filter((s) => !(d.scopes as string[]).includes(s));
  console.log(missing.length ? `   MISSING: ${missing.join(", ")}` : "   all Page permissions present");

  upsert("FB_PAGE_TOKEN", page.access_token);
  upsert("FACEBOOK_PAGE_ID", PAGE_ID);
  console.log("4. wrote FB_PAGE_TOKEN and FACEBOOK_PAGE_ID to .env.fbtest");

  const link = process.argv[2];
  if (link) {
    const pfbid = link.match(/pfbid\w+/)?.[0];
    let next: string | null = `${FB}/${PAGE_ID}/published_posts?fields=id,permalink_url,created_time,message&limit=100&access_token=${page.access_token}`;
    for (let i = 0; next && i < 20; i++) {
      const res: any = await (await fetch(next)).json();
      if (res.error) throw new Error(`published_posts: ${res.error.message}`);
      const hit = (res.data as any[]).find((p) => pfbid && String(p.permalink_url ?? "").includes(pfbid));
      if (hit) {
        console.log(`5. post ${hit.id} (${hit.created_time}) ${String(hit.message ?? "").slice(0, 40).replace(/\n/g, " ")}`);
        return;
      }
      next = res.paging?.next ?? null;
    }
    console.log("5. post not found by permalink in the first 2000 posts");
  }
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
