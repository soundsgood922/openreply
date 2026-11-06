/**
 * Local-only dev login: creates (or reuses) a user, makes sure it has a
 * workspace, and mints a database session. Prints the session token to paste
 * into the `authjs.session-token` cookie.
 *
 * Refuses to run against anything but a localhost database.
 *
 *   npx tsx scripts/dev-login.ts you@example.com
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/db/client";
import { ensureWorkspaceForUser } from "../lib/workspace";

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl)) {
    throw new Error(`refusing to run: DATABASE_URL is not local (${dbUrl.replace(/:[^:@/]+@/, ":***@")})`);
  }

  const email = process.argv[2];
  if (!email) throw new Error("usage: tsx scripts/dev-login.ts <email>");

  const user = await prisma.user.upsert({
    where: { email },
    update: { emailVerified: new Date() },
    create: { email, emailVerified: new Date() },
  });

  const workspace = await ensureWorkspaceForUser(user.id, user.email);

  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { sessionToken, userId: user.id, expires } });

  console.log(JSON.stringify({ userId: user.id, workspace: workspace.name, sessionToken, expires }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
