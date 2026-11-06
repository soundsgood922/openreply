/**
 * Records the app-scoped id Instagram uses for this account inside messaging
 * webhooks, which Graph cannot resolve and so cannot be looked up — it has to
 * be read off a real incoming event.
 *
 *   DATABASE_URL="<url>" npx tsx scripts/set-messaging-id.ts <messagingId>
 *
 * Pass "clear" to remove it.
 */
import { prisma } from "../lib/db/client";

async function main() {
  const value = process.argv[2];
  if (!value) throw new Error("usage: tsx scripts/set-messaging-id.ts <messagingId|clear>");
  const messagingId = value === "clear" ? null : value;

  if (messagingId !== null && !/^\d{10,25}$/.test(messagingId)) {
    throw new Error(`refusing to store "${messagingId}": expected a numeric Instagram id`);
  }

  const account = await prisma.instagramAccount.findFirstOrThrow({
    select: { id: true, username: true, instagramId: true, messagingId: true },
  });
  console.log(`account: ${account.username} (${account.instagramId})`);
  console.log(`before:  messagingId=${account.messagingId ?? "(none)"}`);

  if (messagingId !== null && messagingId === account.instagramId) {
    console.log("\nmessagingId equals instagramId - nothing to record, leaving it unset");
    return;
  }

  const updated = await prisma.instagramAccount.update({
    where: { id: account.id },
    data: { messagingId },
    select: { messagingId: true },
  });
  console.log(`after:   messagingId=${updated.messagingId ?? "(none)"}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
