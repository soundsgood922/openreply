/**
 * Runs one Graph API GET with the token stored for the connected account, so
 * an id seen in a webhook can be identified without copying a token around.
 * Read-only.
 *
 *   DATABASE_URL="<url>" npx tsx --env-file=.env scripts/graph-get.ts <path> [fields]
 */
import { prisma } from "../lib/db/client";
import { decryptToken } from "../lib/meta/oauth";

const V = process.env.META_GRAPH_API_VERSION ?? "v25.0";

async function main() {
  const [path, fields] = process.argv.slice(2);
  if (!path) throw new Error("usage: tsx scripts/graph-get.ts <path> [fields]");

  const account = await prisma.instagramAccount.findFirstOrThrow({
    select: { accessToken: true },
  });
  const token = decryptToken(account.accessToken);

  const url = new URL(`https://graph.facebook.com/${V}/${path.replace(/^\//, "")}`);
  if (fields) url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString());
  const body = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(body.slice(0, 1200));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
