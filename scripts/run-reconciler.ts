/**
 * Runs one comment reconciliation sweep in the foreground and prints the
 * per-campaign stats the worker normally discards, so a silent failure in the
 * polling fallback can be seen.
 *
 * This ENQUEUES work: a matched comment results in a real public reply and DM
 * once the worker picks the job up.
 *
 *   DATABASE_URL="<url>" REDIS_URL="<url>" META_AUTH_MODE=page \
 *     npx tsx --env-file=.env scripts/run-reconciler.ts
 */
import { reconcileComments } from "../lib/polling/comment-reconciler";

async function main() {
  console.log("META_AUTH_MODE:", process.env.META_AUTH_MODE ?? "(unset)");
  console.log("redis:", (process.env.REDIS_URL ?? "").replace(/:[^:@/]+@/, ":***@"));
  const result = await reconcileComments();
  console.log("\nsweep result:");
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("THREW:", String(err?.stack ?? err));
    process.exit(1);
  });
