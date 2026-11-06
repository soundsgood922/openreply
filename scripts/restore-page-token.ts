/**
 * Restores the local diagnostic entries from the connected account already in
 * the database, so a lost .env.railway does not mean re-running the whole
 * Meta authorization dance. The token is written to the file and never
 * printed.
 *
 *   DATABASE_URL="<url>" npx tsx --env-file=.env scripts/restore-page-token.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../lib/db/client";
import { decryptToken } from "../lib/meta/oauth";

const ENV_PATH = resolve(process.cwd(), ".env.railway");

function upsertEnv(key: string, value: string) {
  const raw = readFileSync(ENV_PATH, "utf8");
  const line = `${key}=${value}`;
  const next = new RegExp(`^${key}=.*$`, "m").test(raw)
    ? raw.replace(new RegExp(`^${key}=.*$`, "m"), line)
    : raw.replace(/\s*$/, "\n") + line + "\n";
  writeFileSync(ENV_PATH, next, "utf8");
}

async function main() {
  const account = await prisma.instagramAccount.findFirst({
    select: { instagramId: true, username: true, accessToken: true },
  });
  if (!account) throw new Error("no connected account in the database");

  const token = decryptToken(account.accessToken);
  upsertEnv("META_PAGE_TOKEN", token);
  upsertEnv("IG_ACCOUNT_ID", account.instagramId);

  console.log(`restored from ${account.username} (${account.instagramId})`);
  console.log(`token length: ${token.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
