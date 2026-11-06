/**
 * Explains why a comment did or did not produce a delivery: what the webhook
 * layer received, what the worker logged, and what the account and automation
 * look like from the database's point of view. Read-only.
 *
 *   DATABASE_URL="<url>" npx tsx scripts/diagnose-delivery.ts
 */
import { prisma } from "../lib/db/client";

async function main() {
  const [events, logs, ops] = await Promise.all([
    prisma.webhookEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { createdAt: true, id: true },
    }),
    prisma.dmLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        createdAt: true,
        status: true,
        attempts: true,
        matchedKeyword: true,
        commentId: true,
        errorMessage: true,
        publicReplySentAt: true,
        publicReplyError: true,
      },
    }),
    prisma.operationalEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { createdAt: true, level: true, source: true, message: true, payload: true },
    }),
  ]);

  console.log(`webhookEvent rows (latest 5 of total):`);
  const totalEvents = await prisma.webhookEvent.count();
  console.log(`  total: ${totalEvents}`);
  for (const e of events) console.log(`  - ${e.createdAt.toISOString()} ${e.id}`);

  console.log(`\ndmLog rows: ${await prisma.dmLog.count()}`);
  for (const l of logs) console.log(`  - ${JSON.stringify(l)}`);

  console.log(`\noperationalEvent rows (latest ${ops.length}):`);
  for (const o of ops) {
    console.log(`  - ${o.createdAt.toISOString()} [${o.level}/${o.source}] ${o.message}`);
    if (o.payload) console.log(`      ${JSON.stringify(o.payload).slice(0, 300)}`);
  }

  const account = await prisma.instagramAccount.findFirst({
    select: { instagramId: true, username: true, webhookSubscribed: true, provider: true },
  });
  console.log(`\naccount: ${JSON.stringify(account)}`);

  const automations = await prisma.automation.findMany({
    select: { name: true, isActive: true, postId: true, keywords: true, instagramAccountId: true },
  });
  console.log(`automations: ${JSON.stringify(automations)}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
