/**
 * Prints the live configuration of every automation, so a campaign built in
 * the dashboard can be reviewed before it is trusted with a real audience.
 * Read-only.
 *
 *   DATABASE_URL="<url>" npx tsx scripts/show-automation.ts
 */
import { prisma } from "../lib/db/client";

async function main() {
  const automations = await prisma.automation.findMany({
    include: { trackedLinks: true, instagramAccount: { select: { username: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (!automations.length) {
    console.log("no automations");
    return;
  }

  for (const a of automations) {
    console.log("=".repeat(60));
    console.log(`name:            ${a.name ?? "(unnamed)"}`);
    console.log(`isActive:        ${a.isActive}`);
    console.log(`account:         ${a.instagramAccount?.username ?? "?"}`);
    console.log(`matchAnyPost:    ${a.matchAnyPost}`);
    console.log(`postId:          ${a.postId ?? "(none)"}`);
    console.log(`postUrl:         ${a.postUrl ?? "(none)"}`);
    console.log(`keywords:        ${JSON.stringify(a.keywords)}`);
    console.log(`matchAnyWord:    ${a.matchAnyWord}   wholeWordMatch: ${a.wholeWordMatch}`);
    console.log(`dmTriggerEnabled:${a.dmTriggerEnabled}`);
    console.log(`publicReply:     enabled=${a.publicReplyEnabled}`);
    console.log(`  messages[]:    ${JSON.stringify(a.publicReplyMessages)}`);
    console.log(`  legacy single: ${JSON.stringify(a.publicReplyMessage)}`);
    console.log(`dmMessage:       ${JSON.stringify(a.dmMessage)}`);
    console.log(`  length:        ${a.dmMessage?.length ?? 0} chars (cap is 640 when buttons are attached)`);
    console.log(`linkButtonLabel: ${JSON.stringify(a.linkButtonLabel)}`);
    console.log(`requireFollow:   ${a.requireFollow}`);
    console.log(`openingDm:       ${a.openingDmEnabled}`);
    console.log(`  message:       ${JSON.stringify(a.openingDmMessage)}`);
    console.log(`  buttonLabel:   ${JSON.stringify(a.openingDmButtonLabel)}`);
    console.log(`followUp:        ${a.followUpEnabled} delay=${a.followUpDelayMinutes}min`);
    console.log(`trackedLinks:    ${a.trackedLinks.length}`);
    for (const l of a.trackedLinks) {
      console.log(`  - pos=${l.position} label=${JSON.stringify(l.label)} (${(l.label ?? "").length} chars, cap 20) -> ${l.destinationUrl}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
