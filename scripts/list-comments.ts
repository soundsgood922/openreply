/**
 * Lists the comments the app can actually see on one post, using the token
 * stored for the connected account. Read-only.
 *
 *   DATABASE_URL="<url>" META_AUTH_MODE=page npx tsx --env-file=.env scripts/list-comments.ts <mediaId>
 */
import { prisma } from "../lib/db/client";
import { createInstagramContext } from "../lib/instagram/context";
import { getRecentMediaComments } from "../lib/instagram/provider";

async function main() {
  const mediaId = process.argv[2];
  if (!mediaId) throw new Error("usage: tsx scripts/list-comments.ts <mediaId>");

  const account = await prisma.instagramAccount.findFirstOrThrow({
    select: {
      provider: true,
      workspaceId: true,
      zernioAccountId: true,
      instagramId: true,
      accessToken: true,
    },
  });
  const context = await createInstagramContext(account);

  const comments = await getRecentMediaComments({ context, mediaId, sinceMs: 0, max: 25 });
  console.log(`comments visible on ${mediaId}: ${comments.length}`);
  for (const c of comments) {
    console.log(`- ${c.timestamp} @${c.from?.username ?? "?"} ${JSON.stringify(c.text)}  id=${c.id}`);
  }

  const logged = await prisma.dmLog.findMany({ select: { commentId: true, status: true } });
  console.log(`\nalready logged: ${logged.map((l) => `${l.commentId}=${l.status}`).join(", ") || "(none)"}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
