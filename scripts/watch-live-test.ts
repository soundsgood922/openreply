/**
 * Watches one live test end to end, separating the connected account's events
 * from unrelated traffic: webhook events that were accepted, signature
 * rejections that mention one of our ids, and deliveries — each with its time,
 * so webhook speed can be told apart from the polling fallback. Read-only.
 *
 *   DATABASE_URL="<url>" npx tsx scripts/watch-live-test.ts [timeoutSeconds] [lingerSeconds]
 *
 * lingerSeconds is how long to keep listening after the first delivery; raise
 * it when the test needs a person to act afterwards, such as tapping a button.
 */
import { prisma } from "../lib/db/client";


async function main() {
  const timeoutMs = Number(process.argv[2] ?? 900) * 1000;
  const lingerMs = Number(process.argv[3] ?? 45) * 1000;
  const start = new Date();
  // Every connected account and Page, across all brands.
  const OUR_IDS = (
    await prisma.instagramAccount.findMany({ select: { instagramId: true } })
  ).map((a) => a.instagramId);
  const deadline = Date.now() + timeoutMs;
  console.log(`watching from ${start.toISOString()} for ${timeoutMs / 1000}s`);

  const seen = new Set<string>();
  // A delivery row is updated in place as a multi-step flow advances, so its
  // state is tracked rather than printed once.
  const lastState = new Map<string, string>();
  let deliveredAt: number | null = null;

  while (Date.now() < deadline) {
    const [accepted, rejected, logs] = await Promise.all([
      prisma.webhookEvent.findMany({
        where: { createdAt: { gte: start } },
        orderBy: { createdAt: "asc" },
        select: { id: true, createdAt: true, status: true, payload: true },
      }),
      prisma.operationalEvent.findMany({
        where: { createdAt: { gte: start }, message: "Webhook signature verification failed" },
        orderBy: { createdAt: "asc" },
        select: { id: true, createdAt: true, payload: true },
      }),
      prisma.dmLog.findMany({
        where: { createdAt: { gte: start } },
        orderBy: { createdAt: "asc" },
        select: { id: true, createdAt: true, status: true, matchedKeyword: true, commentId: true, errorMessage: true, publicReplySentAt: true, dmSentAt: true },
      }),
    ]);

    for (const e of accepted) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      console.log(`\n[ACCEPTED WEBHOOK] ${e.createdAt.toISOString()} status=${e.status}`);
      console.log(`  ${JSON.stringify(e.payload).slice(0, 300)}`);
    }

    for (const r of rejected) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      const p = (r.payload ?? {}) as { bodyPreview?: string; diagnosis?: unknown };
      const preview = p.bodyPreview ?? "";
      if (!OUR_IDS.some((id) => preview.includes(id))) continue; // unrelated account
      console.log(`\n[REJECTED, OUR ACCOUNT] ${r.createdAt.toISOString()}`);
      console.log(`  ${preview.slice(0, 200)}`);
      console.log(`  diagnosis: ${JSON.stringify(p.diagnosis)}`);
    }

    for (const l of logs) {
      const state = JSON.stringify(l);
      if (lastState.get(l.id) === state) continue;
      const label = lastState.has(l.id) ? "DELIVERY UPDATED" : "DELIVERY";
      lastState.set(l.id, state);
      console.log(`\n[${label}] seen ${new Date().toISOString()} ${state}`);
      deliveredAt ??= Date.now();
    }

    // After a delivery, keep listening for the linger window so a webhook
    // that raced the polling fallback, or a later button tap, is still
    // reported, then stop.
    if (deliveredAt && Date.now() - deliveredAt > lingerMs) break;

    await new Promise((r) => setTimeout(r, 5_000));
  }

  const stillRejected = await prisma.operationalEvent.count({
    where: { createdAt: { gte: start }, message: "Webhook signature verification failed" },
  });
  console.log(`\nsummary: accepted webhooks=${(await prisma.webhookEvent.count({ where: { createdAt: { gte: start } } }))}, rejected (all accounts)=${stillRejected}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
