/**
 * Turns the opening DM on or off for every automation. Without it the link
 * and its button arrive in the first DM, which needs no webhook — the
 * two-step flow depends on a postback, and a postback can only arrive by
 * webhook.
 *
 *   DATABASE_URL="<url>" npx tsx scripts/set-opening-dm.ts off
 */
import { prisma } from "../lib/db/client";

async function main() {
  const arg = (process.argv[2] ?? "").toLowerCase();
  if (arg !== "on" && arg !== "off") throw new Error("usage: tsx scripts/set-opening-dm.ts <on|off>");
  const enabled = arg === "on";

  const before = await prisma.automation.findMany({
    select: { id: true, name: true, openingDmEnabled: true },
  });
  for (const a of before) console.log(`before: ${a.name} openingDmEnabled=${a.openingDmEnabled}`);

  const result = await prisma.automation.updateMany({ data: { openingDmEnabled: enabled } });
  console.log(`\nupdated ${result.count} automation(s) -> openingDmEnabled=${enabled}`);

  const after = await prisma.automation.findMany({
    select: { name: true, openingDmEnabled: true, dmMessage: true, linkButtonLabel: true, trackedLinks: { select: { destinationUrl: true } } },
  });
  for (const a of after) {
    console.log(`\nafter: ${a.name}`);
    console.log(`  openingDmEnabled: ${a.openingDmEnabled}`);
    console.log(`  dmMessage:        ${JSON.stringify(a.dmMessage)}`);
    console.log(`  linkButtonLabel:  ${JSON.stringify(a.linkButtonLabel)}`);
    console.log(`  links:            ${a.trackedLinks.map((l) => l.destinationUrl).join(", ")}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
