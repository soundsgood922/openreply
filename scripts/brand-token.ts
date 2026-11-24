/**
 * Turns the Graph API Explorer user token into a never-expiring Page token for
 * one brand. Sends nothing.
 *
 *   npx tsx scripts/brand-token.ts                       # list the Pages the token reaches
 *   npx tsx scripts/brand-token.ts --page <page-id> --out .env.brand.mark
 *
 * Reads META_USER_TOKEN from .env.fbtest (or --from <file>) and
 * FACEBOOK_APP_SECRET from .env.railway. Writes FB_PAGE_TOKEN,
 * FACEBOOK_PAGE_ID and IG_ACCOUNT_ID (the Page's linked Instagram account) to
 * the --out file, which .gitignore already covers (.env*).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const V = process.env.META_GRAPH_API_VERSION ?? "v25.0";
const FB = `https://graph.facebook.com/${V}`;
const APP_ID = "1174453164926610";

type Page = {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string; username?: string };
};

function flag(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function readEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(resolve(process.cwd(), file), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
  }
  return out;
}

function upsert(file: string, key: string, value: string) {
  const path = resolve(process.cwd(), file);
  const raw = existsSync(path) ? readFileSync(path, "utf8") : "";
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  const next = re.test(raw)
    ? raw.replace(re, line)
    : (raw ? raw.replace(/\s*$/, "\n") : "") + line + "\n";
  writeFileSync(path, next, "utf8");
}

async function get(path: string, params: Record<string, string>) {
  const url = new URL(`${FB}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped Graph responses
  const body = (await (await fetch(url.toString())).json()) as Record<string, any>;
  if (body.error) throw new Error(`${path}: ${body.error.message}`);
  return body;
}

async function main() {
  const userToken = readEnv(flag("--from") ?? ".env.fbtest").META_USER_TOKEN;
  const secret = readEnv(".env.railway").FACEBOOK_APP_SECRET;
  if (!userToken || !secret) throw new Error("META_USER_TOKEN and FACEBOOK_APP_SECRET are required");

  const long = await get("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: APP_ID,
    client_secret: secret,
    fb_exchange_token: userToken,
  });
  const pages = (
    await get("/me/accounts", {
      fields: "id,name,access_token,instagram_business_account{id,username}",
      access_token: long.access_token,
    })
  ).data as Page[];

  const pageId = flag("--page");
  if (!pageId) {
    console.log("Pages this token can reach:");
    for (const p of pages) {
      const ig = p.instagram_business_account;
      console.log(`  ${p.id}  ${p.name}  IG: ${ig ? `@${ig.username} (${ig.id})` : "(no linked IG)"}`);
    }
    return;
  }

  const page = pages.find((p) => p.id === pageId);
  if (!page) throw new Error(`page ${pageId} was not granted to this token`);
  const out = flag("--out");
  if (!out) throw new Error("--out <file> is required with --page");

  const d = (
    await get("/debug_token", { input_token: page.access_token, access_token: `${APP_ID}|${secret}` })
  ).data;
  const need = [
    "pages_read_engagement",
    "pages_read_user_content",
    "pages_manage_engagement",
    "pages_messaging",
    "pages_manage_metadata",
    "instagram_manage_comments",
    "instagram_manage_messages",
  ];
  const missing = need.filter((s) => !(d.scopes as string[]).includes(s));
  console.log(`${page.name}: type=${d.type} expires=${d.expires_at === 0 ? "never" : d.expires_at}`);
  if (missing.length) console.log(`  MISSING permissions: ${missing.join(", ")}`);

  upsert(out, "FB_PAGE_TOKEN", page.access_token);
  upsert(out, "FACEBOOK_PAGE_ID", page.id);
  const ig = page.instagram_business_account;
  if (ig) upsert(out, "IG_ACCOUNT_ID", ig.id);
  console.log(`wrote ${out}${ig ? ` (IG @${ig.username})` : " (no linked Instagram account)"}`);
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
