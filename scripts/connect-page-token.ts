/**
 * Connects an Instagram account using a Facebook Page access token, for
 * deployments on META_AUTH_MODE=page where there is no OAuth round trip to
 * create the row.
 *
 * Verifies the token against the live account before writing anything, stores
 * it encrypted with the same ENCRYPTION_KEY the app uses, and leaves
 * tokenExpiresAt null so the refresh cron skips it — a Page token does not
 * expire.
 *
 *   DATABASE_URL="<url>" npx tsx --env-file=.env scripts/connect-page-token.ts
 *
 * Reads META_PAGE_TOKEN and IG_ACCOUNT_ID from .env.railway.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../lib/db/client";
import { encryptToken } from "../lib/meta/oauth";

const V = process.env.META_GRAPH_API_VERSION ?? "v25.0";

function readRailwayEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  const path = resolve(process.cwd(), ".env.railway");
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

async function main() {
  const env = readRailwayEnv();
  const token = env.META_PAGE_TOKEN;
  const igId = env.IG_ACCOUNT_ID;
  if (!token) throw new Error("META_PAGE_TOKEN missing from .env.railway");
  if (!igId) throw new Error("IG_ACCOUNT_ID missing from .env.railway");

  const url = new URL(`https://graph.facebook.com/${V}/${igId}`);
  url.searchParams.set("fields", "id,username,name,followers_count");
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString());
  const profile = (await res.json()) as {
    id?: string;
    username?: string;
    name?: string;
    followers_count?: number;
    error?: { message?: string; code?: number };
  };
  if (!res.ok || profile.error || !profile.username) {
    throw new Error(`token cannot read ${igId}: ${profile.error?.message ?? res.status}`);
  }
  console.log(`verified: ${profile.username} (${profile.id}) - ${profile.followers_count} followers`);

  const workspaces = await prisma.workspace.findMany({ select: { id: true, name: true } });
  if (workspaces.length !== 1) {
    throw new Error(
      `expected exactly one workspace, found ${workspaces.length}: ${workspaces.map((w) => w.name).join(", ")}`
    );
  }
  const workspace = workspaces[0];

  const data = {
    username: profile.username,
    name: profile.name ?? null,
    accessToken: encryptToken(token),
    // A Page token never expires; null keeps the refresh cron away from it.
    tokenExpiresAt: null,
    provider: "META" as const,
  };

  const existing = await prisma.instagramAccount.findUnique({ where: { instagramId: igId } });
  if (existing) {
    await prisma.instagramAccount.update({ where: { id: existing.id }, data });
    console.log(`updated existing account row (${existing.id})`);
  } else {
    const created = await prisma.instagramAccount.create({
      data: { ...data, workspaceId: workspace.id, instagramId: igId },
    });
    console.log(`created account row (${created.id}) in workspace "${workspace.name}"`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
