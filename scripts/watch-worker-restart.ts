/**
 * Polls the DM worker heartbeat until the container changes, which is how a
 * deployed config change is confirmed to have actually taken effect.
 *
 *   npx tsx scripts/watch-worker-restart.ts <redis-url> <known-startedAt> [timeoutSeconds]
 */
import Redis from "ioredis";

const HEALTH_KEY = "health:worker:dm";

async function main() {
  const [url, knownStartedAt, timeoutArg] = process.argv.slice(2);
  if (!url || !knownStartedAt) {
    throw new Error("usage: tsx scripts/watch-worker-restart.ts <redis-url> <known-startedAt> [timeoutSeconds]");
  }
  const timeoutMs = Number(timeoutArg ?? 420) * 1000;
  const redis = new Redis(url, { maxRetriesPerRequest: 3, connectTimeout: 10_000 });
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const raw = await redis.get(HEALTH_KEY);
    if (raw) {
      const hb = JSON.parse(raw);
      if (hb.startedAt !== knownStartedAt) {
        console.log("RESTARTED");
        console.log("hostname:", hb.hostname, "| startedAt:", hb.startedAt);
        await redis.quit();
        return;
      }
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }

  console.log("TIMEOUT - worker never restarted within", timeoutMs / 1000, "s");
  await redis.quit();
  process.exit(2);
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
