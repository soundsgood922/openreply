/**
 * Waits for the first signature-rejection event that carries the diagnosis
 * payload, so the deploy can be left to Meta's own retries instead of another
 * manual test. Read-only.
 *
 *   DATABASE_URL="<url>" npx tsx scripts/watch-signature-diagnosis.ts [timeoutSeconds]
 */
import { prisma } from "../lib/db/client";

async function main() {
  const timeoutMs = Number(process.argv[2] ?? 900) * 1000;
  const start = new Date();
  const deadline = Date.now() + timeoutMs;
  console.log(`watching from ${start.toISOString()}`);

  while (Date.now() < deadline) {
    const rows = await prisma.operationalEvent.findMany({
      where: { createdAt: { gte: start }, message: "Webhook signature verification failed" },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { createdAt: true, payload: true },
    });

    const row = rows[0];
    const payload = row?.payload as { diagnosis?: unknown } | null;
    if (row && payload?.diagnosis) {
      console.log(`\n${row.createdAt.toISOString()}`);
      console.log(JSON.stringify(payload.diagnosis, null, 2));
      return;
    }
    if (row) console.log(`${row.createdAt.toISOString()} rejection without diagnosis - deploy not live yet`);

    await new Promise((r) => setTimeout(r, 15_000));
  }
  console.log("TIMEOUT - no diagnosed rejection arrived");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
