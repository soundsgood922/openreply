/**
 * Connects a Facebook Page as an account (provider FACEBOOK), so campaigns can
 * be bound to the Page's posts. The Page id is stored in instagramId.
 *
 * Verifies the token can read the Page, stores it encrypted with the app's
 * ENCRYPTION_KEY, and leaves tokenExpiresAt null (a Page token does not
 * expire; the refresh cron only touches provider META anyway).
 *
 *   npx tsx --env-file=.env scripts/connect-facebook-page.ts [--allow-remote]
 *
 * Reads FB_PAGE_TOKEN and FACEBOOK_PAGE_ID from .env.fbtest. Refuses to write
 * to anything but a local database unless --allow-remote is passed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../lib/db/client";
import { encryptToken } from "../lib/meta/oauth";

const V = process.env.META_GRAPH_API_VERSION ?? "v25.0";

function readEnvFile(name: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(resolve(process.cwd(), name), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^(["'])(.*)$/, "$2");
  }
  return out;
}

async function main() {
  const dbHost = new URL(process.env.DATABASE_URL ?? "postgres://missing").hostname;
  const local = ["localhost", "127.0.0.1", "::1"].includes(dbHost);
  if (!local && !process.argv.includes("--allow-remote")) {
    throw new Error(`DATABASE_URL points at ${dbHost}, not a local database; pass --allow-remote to write there`);
  }

  const env = readEnvFile(".env.fbtest");
  const token = env.FB_PAGE_TOKEN;
  const pageId = env.FACEBOOK_PAGE_ID;
  if (!token || !pageId) throw new Error("FB_PAGE_TOKEN and FACEBOOK_PAGE_ID must be in .env.fbtest");

  const url = new URL(`https://graph.facebook.com/${V}/${pageId}`);
  url.searchParams.set("fields", "id,name,username");
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString());
  const page = (await res.json()) as { id?: string; name?: string; username?: string; error?: { message?: string } };
  if (!res.ok || page.error || !page.name) {
    throw new Error(`token cannot read page ${pageId}: ${page.error?.message ?? res.status}`);
  }
  console.log(`verified: ${page.name} (${page.id}) — writing to ${dbHost}`);

  const workspaces = await prisma.workspace.findMany({ select: { id: true, name: true } });
  if (workspaces.length !== 1) {
    throw new Error(`expected exactly one workspace, found ${workspaces.length}`);
  }
  const workspace = workspaces[0];

  const data = {
    username: page.username ?? page.name,
    name: page.name,
    accessToken: encryptToken(token),
    tokenExpiresAt: null,
    provider: "FACEBOOK" as const,
  };
  const existing = await prisma.instagramAccount.findUnique({ where: { instagramId: pageId } });
  if (existing && existing.provider !== "FACEBOOK") {
    throw new Error(`instagramId ${pageId} already belongs to a ${existing.provider} account`);
  }
  if (existing) {
    await prisma.instagramAccount.update({ where: { id: existing.id }, data });
    console.log(`updated page account (${existing.id})`);
  } else {
    const created = await prisma.instagramAccount.create({
      data: { ...data, workspaceId: workspace.id, instagramId: pageId },
    });
    console.log(`created page account (${created.id}) in workspace "${workspace.name}"`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
