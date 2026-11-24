/**
 * Connects one brand's Facebook Page and its linked Instagram account to that
 * brand, from the file brand-token.ts wrote. Both use the Page token (never
 * expires): the Page as a FACEBOOK account, Instagram as a META account read
 * through graph.facebook.com (META_AUTH_MODE=page).
 *
 *   npx tsx --env-file=.env scripts/connect-brand.ts --workspace "馬克" --env .env.brand.mark [--subscribe] [--allow-remote]
 *
 * --subscribe also turns on webhooks for both: the Page for feed and
 * messaging_postbacks, the Instagram account for comments and messages.
 * Refuses an account that already belongs to another brand, and writes only to
 * a local database unless --allow-remote is passed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../lib/db/client";
import { encryptToken } from "../lib/meta/oauth";

const V = process.env.META_GRAPH_API_VERSION ?? "v25.0";
const FB = `https://graph.facebook.com/${V}`;

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

async function graph(method: "GET" | "POST", path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${FB}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped Graph responses
  const body = (await (await fetch(url.toString(), { method })).json()) as Record<string, any>;
  if (body.error) throw new Error(`${method} ${path}: ${body.error.message}`);
  return body;
}

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://missing").hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host) && !process.argv.includes("--allow-remote")) {
    throw new Error(`DATABASE_URL points at ${host}; pass --allow-remote to write there`);
  }

  const brandName = flag("--workspace");
  const envFile = flag("--env");
  if (!brandName || !envFile) throw new Error("--workspace <brand> and --env <file> are required");
  const env = readEnv(envFile);
  const token = env.FB_PAGE_TOKEN;
  const pageId = env.FACEBOOK_PAGE_ID;
  const igId = env.IG_ACCOUNT_ID;
  if (!token || !pageId) throw new Error(`FB_PAGE_TOKEN and FACEBOOK_PAGE_ID must be in ${envFile}`);

  const brands = await prisma.workspace.findMany({ where: { name: brandName } });
  if (brands.length !== 1) throw new Error(`expected one brand named "${brandName}", found ${brands.length}`);
  const brand = brands[0];

  const page = await graph("GET", `/${pageId}`, token, { fields: "id,name,username" });
  const ig = igId ? await graph("GET", `/${igId}`, token, { fields: "id,username,name" }) : null;
  console.log(`verified Page: ${page.name}${ig ? `; Instagram: @${ig.username}` : "; no Instagram account"}`);

  const rows = [
    {
      instagramId: pageId,
      provider: "FACEBOOK" as const,
      username: (page.username as string | undefined) ?? (page.name as string),
      name: page.name as string,
    },
    ...(ig
      ? [{ instagramId: igId!, provider: "META" as const, username: ig.username as string, name: (ig.name as string | undefined) ?? null }]
      : []),
  ];

  for (const row of rows) {
    const existing = await prisma.instagramAccount.findUnique({ where: { instagramId: row.instagramId } });
    if (existing && existing.workspaceId !== brand.id) {
      throw new Error(`${row.username} already belongs to another brand (${existing.workspaceId}); nothing written`);
    }
  }

  const subscribe = process.argv.includes("--subscribe");
  if (subscribe) {
    await graph("POST", `/${pageId}/subscribed_apps`, token, { subscribed_fields: "feed,messaging_postbacks" });
    console.log("Page subscribed: feed, messaging_postbacks");
    if (igId) {
      await graph("POST", `/${igId}/subscribed_apps`, token, { subscribed_fields: "comments,messages" });
      console.log("Instagram subscribed: comments, messages");
    }
  }

  for (const row of rows) {
    const data = {
      username: row.username,
      name: row.name,
      provider: row.provider,
      accessToken: encryptToken(token),
      tokenExpiresAt: null,
      ...(subscribe ? { webhookSubscribed: true } : {}),
    };
    const saved = await prisma.instagramAccount.upsert({
      where: { instagramId: row.instagramId },
      update: data,
      create: { ...data, workspaceId: brand.id, instagramId: row.instagramId },
    });
    console.log(`[${row.provider}] ${row.username} -> "${brand.name}" (${saved.id}) on ${host}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(String(e?.message ?? e));
    process.exit(1);
  });
