/**
 * Watches the delivery log for new rows, so a live end-to-end test can be
 * observed from outside the dashboard. Read-only; exits on the first new row
 * or when the window closes.
 *
 *   DATABASE_URL="<url>" npx tsx scripts/watch-dmlog.ts [timeoutSeconds]
 */
import { prisma } from "../lib/db/client";

async function main() {
  const timeoutMs = Number(process.argv[2] ?? 600) * 1000;
  const start = new Date();
  const deadline = Date.now() + timeoutMs;
  console.log(`watching from ${start.toISOString()} for ${timeoutMs / 1000}s`);

  let lastEventCount = await prisma.webhookEvent.count();
  console.log(`webhook events so far: ${lastEventCount}`);

  while (Date.now() < deadline) {
    const events = await prisma.webhookEvent.count();
    if (events !== lastEventCount) {
      console.log(`webhook events: ${lastEventCount} -> ${events}`);
      lastEventCount = events;
    }

    const logs = await prisma.dmLog.findMany({
      where: { createdAt: { gte: start } },
      orderBy: { createdAt: "asc" },
      select: {
        status: true,
        attempts: true,
        matchedKeyword: true,
        commentId: true,
        errorMessage: true,
        dmSentAt: true,
        publicReplySentAt: true,
        publicReplyError: true,
      },
    });

    if (logs.length) {
      console.log(`\nDM LOG ROWS: ${logs.length}`);
      for (const l of logs) {
        console.log(JSON.stringify(l, null, 2));
      }
      return;
    }

    await new Promise((r) => setTimeout(r, 10_000));
  }

  console.log("\nTIMEOUT - no DM log row appeared");
  console.log(`webhook events at end: ${lastEventCount}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
