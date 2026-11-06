/**
 * Reads the DM worker heartbeat straight out of Redis, so a deployed worker can
 * be verified without reading platform logs.
 *
 *   npx tsx scripts/check-railway-worker.ts "<redis url>"
 */
import Redis from "ioredis";

const HEALTH_KEY = "health:worker:dm";

async function main() {
  const url = process.argv[2];
  if (!url) throw new Error("usage: tsx scripts/check-railway-worker.ts <redis-url>");

  const redis = new Redis(url, { maxRetriesPerRequest: 2, connectTimeout: 10_000 });

  const pong = await redis.ping();
  const raw = await redis.get(HEALTH_KEY);
  const ttl = await redis.ttl(HEALTH_KEY);
  const queues = await redis.keys("bull:*");

  console.log("ping:", pong);
  if (!raw) {
    console.log("heartbeat: MISSING — no worker has written to this Redis in the last 120s");
  } else {
    const hb = JSON.parse(raw);
    const ageMs = Date.now() - new Date(hb.checkedAt).getTime();
    console.log("heartbeat:", JSON.stringify(hb));
    console.log("age:", `${Math.round(ageMs / 1000)}s`, "| ttl:", `${ttl}s`);
    console.log("verdict:", ageMs < 120_000 ? "WORKER ALIVE" : "STALE");
  }
  console.log("bull keys:", queues.length);

  await redis.quit();
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
