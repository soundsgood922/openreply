/**
 * Prints a short inventory of the deployed database, so the state of a remote
 * environment can be checked without opening the dashboard.
 *
 *   DATABASE_URL="<public url>" npx tsx scripts/check-prod-state.ts
 */
import { prisma } from "../lib/db/client";

async function main() {
  const [users, workspaces, accounts, automations, dmLogs] = await Promise.all([
    prisma.user.findMany({ select: { email: true, createdAt: true } }),
    prisma.workspace.findMany({ select: { name: true, dmsSentThisPeriod: true } }),
    prisma.instagramAccount.count(),
    prisma.automation.count(),
    prisma.dmLog.count(),
  ]);

  console.log("users:", users.map((u) => `${u.email} (${u.createdAt.toISOString().slice(0, 16)})`).join(", ") || "(none)");
  console.log("workspaces:", workspaces.map((w) => `${w.name} [dms=${w.dmsSentThisPeriod}]`).join(", ") || "(none)");
  console.log("instagram accounts:", accounts);
  console.log("automations:", automations);
  console.log("dm logs:", dmLogs);
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(String(err?.message ?? err));
    
    process.exit(1);
  });
