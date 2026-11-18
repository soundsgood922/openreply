/**
 * Reads, creates or removes the app's webhook subscription on the Facebook
 * Page. Accounts connected through a Page token (META_AUTH_MODE=page) receive
 * Instagram webhooks through the Page, so subscribing the Instagram account
 * alone is not enough. Needs a Page token with pages_manage_metadata.
 *
 *   npx tsx scripts/page-subscription.ts get
 *   npx tsx scripts/page-subscription.ts post comments,messages,messaging_postbacks
 *   npx tsx scripts/page-subscription.ts delete
 *
 * Reads META_PAGE_TOKEN and FACEBOOK_PAGE_ID from .env.railway.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const V = process.env.META_GRAPH_API_VERSION ?? "v25.0";

function readEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(resolve(process.cwd(), ".env.railway"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

async function call(method: "GET" | "POST" | "DELETE", pageId: string, token: string, fields?: string) {
  const url = new URL(`https://graph.facebook.com/${V}/${pageId}/subscribed_apps`);
  url.searchParams.set("access_token", token);
  if (fields) url.searchParams.set("subscribed_fields", fields);
  const res = await fetch(url.toString(), { method });
  const body = await res.text();
  console.log(`${method} /${pageId}/subscribed_apps${fields ? ` fields=${fields}` : ""} -> HTTP ${res.status}`);
  console.log(body.slice(0, 600));
  return res.ok;
}

async function main() {
  const [action, fields] = process.argv.slice(2);
  const env = readEnv();
  const token = env.META_PAGE_TOKEN;
  const pageId = env.FACEBOOK_PAGE_ID;
  if (!token || !pageId) throw new Error("META_PAGE_TOKEN and FACEBOOK_PAGE_ID must be in .env.railway");

  if (action === "get") {
    await call("GET", pageId, token);
  } else if (action === "post") {
    if (!fields) throw new Error("usage: post <comma-separated fields>");
    const ok = await call("POST", pageId, token, fields);
    console.log("");
    if (ok) await call("GET", pageId, token);
  } else if (action === "delete") {
    await call("DELETE", pageId, token);
    console.log("");
    await call("GET", pageId, token);
  } else {
    throw new Error("usage: page-subscription.ts <get|post <fields>|delete>");
  }
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
