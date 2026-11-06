/**
 * End-to-end check of a connected account through the real provider stack:
 * loads the row from the database, decrypts the token the way the app does,
 * builds the same context the worker builds, and reads through the provider
 * boundary. Read-only — it sends nothing.
 *
 *   DATABASE_URL="<url>" META_AUTH_MODE=page npx tsx --env-file=.env scripts/verify-connection.ts
 */
import { prisma } from "../lib/db/client";
import { createInstagramContext } from "../lib/instagram/context";
import { getUserInfo, getUserMedia } from "../lib/instagram/read-content";
import { getRecentMediaComments } from "../lib/instagram/provider";

async function main() {
  console.log("META_AUTH_MODE:", process.env.META_AUTH_MODE ?? "(unset - Instagram Login mode)");

  const account = await prisma.instagramAccount.findFirst({
    select: {
      provider: true,
      workspaceId: true,
      zernioAccountId: true,
      instagramId: true,
      accessToken: true,
      username: true,
      tokenExpiresAt: true,
    },
  });
  if (!account) throw new Error("no Instagram account row found");
  console.log(`row: ${account.username} (${account.instagramId}) provider=${account.provider} expires=${account.tokenExpiresAt ?? "never"}`);

  const context = await createInstagramContext(account);

  const info = await getUserInfo({ context });
  console.log("\nprofile:", JSON.stringify(info));

  const media = await getUserMedia({ context, limit: 5 });
  console.log("\nposts:", media.length);
  for (const m of media) {
    console.log(`- ${m.id} ${m.timestamp?.slice(0, 10)} comments=${m.comments_count ?? 0} ${m.permalink ?? ""}`);
  }

  const withComments = media.find((m) => (m.comments_count ?? 0) > 0);
  if (withComments) {
    const comments = await getRecentMediaComments({
      context,
      mediaId: withComments.id,
      sinceMs: 0,
      max: 5,
    });
    console.log(`\ncomments on ${withComments.id}:`, comments.length);
    for (const c of comments) {
      console.log(`- @${c.from?.username ?? "(no username)"} (id=${c.from?.id ?? "?"}): ${(c.text ?? "").replace(/\s+/g, " ").slice(0, 50)}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FAILED:", String(err?.message ?? err));
    process.exit(1);
  });
