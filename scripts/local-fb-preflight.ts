/**
 * Run before starting a local worker for Facebook Page testing. A local
 * worker sweeps every active campaign in the database it points at, so an
 * active Instagram campaign there would make it answer real Instagram
 * comments a second time, alongside production.
 *
 *   npx tsx --env-file=.env scripts/local-fb-preflight.ts
 *
 * Exits non-zero unless DATABASE_URL is local and every active campaign
 * belongs to a FACEBOOK account. Read-only.
 */
import { prisma } from "../lib/db/client";

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://missing").hostname;
  const redisHost = process.env.REDIS_URL ? new URL(process.env.REDIS_URL).hostname : "(unset)";
  console.log(`database: ${host}   redis: ${redisHost}   FACEBOOK_PAGES_ENABLED=${process.env.FACEBOOK_PAGES_ENABLED ?? "(unset)"}`);
  const isLocal = (h: string) => ["localhost", "127.0.0.1", "::1"].includes(h);
  const problems: string[] = [];
  if (!isLocal(host)) problems.push(`database ${host} is not local`);
  if (!isLocal(redisHost)) problems.push(`redis ${redisHost} is not local`);

  const active = await prisma.automation.findMany({
    where: { isActive: true },
    select: { name: true, instagramAccount: { select: { username: true, provider: true } } },
  });
  for (const a of active) {
    console.log(`  active: ${a.name}  [${a.instagramAccount.provider}] ${a.instagramAccount.username}`);
    if (a.instagramAccount.provider !== "FACEBOOK") problems.push(`active non-Facebook campaign "${a.name}"`);
  }
  if (active.length === 0) console.log("  no active campaigns");

  if (problems.length) {
    console.log(`\nNOT SAFE:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log("\nsafe to start the local worker");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
