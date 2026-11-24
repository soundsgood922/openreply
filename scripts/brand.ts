/**
 * Brands (workspaces) on this deployment. Writes go to a local database unless
 * --allow-remote is passed.
 *
 *   npx tsx --env-file=.env scripts/brand.ts list
 *   npx tsx --env-file=.env scripts/brand.ts create "馬克" --owner soundsgood922@gmail.com
 *   npx tsx --env-file=.env scripts/brand.ts rename "soundsgood922's workspace" "聲藝"
 *   npx tsx --env-file=.env scripts/brand.ts add-member "馬克" someone@example.com [ADMIN|MEMBER]
 *
 * add-member needs someone who has signed in once; to bring in someone new,
 * invite them from that brand's Settings -> Team instead.
 */
import { prisma } from "../lib/db/client";

const args = process.argv.slice(2).filter((a) => a !== "--allow-remote");
const allowRemote = process.argv.includes("--allow-remote");

function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function guardWrite() {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://missing").hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host) && !allowRemote) {
    throw new Error(`DATABASE_URL points at ${host}; pass --allow-remote to write there`);
  }
  return host;
}

async function findBrand(nameOrId: string) {
  const ws = await prisma.workspace.findMany({
    where: { OR: [{ id: nameOrId }, { name: nameOrId }] },
  });
  if (ws.length !== 1) {
    throw new Error(`expected one brand named "${nameOrId}", found ${ws.length}`);
  }
  return ws[0];
}

async function userByEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    throw new Error(`${email} has never signed in; invite them from the brand's Settings -> Team`);
  }
  return user;
}

async function main() {
  const [cmd, a, b, c] = args;
  if (cmd === "list") {
    const all = await prisma.workspace.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        members: { select: { role: true, user: { select: { email: true } } } },
        instagramAccounts: { select: { provider: true, username: true, instagramId: true } },
      },
    });
    for (const w of all) {
      console.log(`\n${w.name}  (${w.id})`);
      for (const acc of w.instagramAccounts) {
        console.log(`  [${acc.provider}] ${acc.username} ${acc.instagramId}`);
      }
      for (const m of w.members) console.log(`  ${m.role} ${m.user.email}`);
    }
    return;
  }

  const host = guardWrite();
  if (cmd === "create") {
    const owner = await userByEmail(flag("--owner") ?? "");
    if (await prisma.workspace.findFirst({ where: { name: a } })) {
      throw new Error(`brand "${a}" already exists`);
    }
    const ws = await prisma.workspace.create({
      data: {
        name: a,
        ownerId: owner.id,
        members: { create: { userId: owner.id, role: "OWNER" } },
      },
    });
    console.log(`created brand "${ws.name}" (${ws.id}) owned by ${owner.email} on ${host}`);
  } else if (cmd === "rename") {
    const ws = await findBrand(a);
    await prisma.workspace.update({ where: { id: ws.id }, data: { name: b } });
    console.log(`renamed "${ws.name}" -> "${b}" on ${host}`);
  } else if (cmd === "add-member") {
    const ws = await findBrand(a);
    const user = await userByEmail(b);
    const role = (c ?? "MEMBER").toUpperCase();
    if (role !== "ADMIN" && role !== "MEMBER") throw new Error("role must be ADMIN or MEMBER");
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: user.id } },
      update: { role },
      create: { workspaceId: ws.id, userId: user.id, role },
    });
    console.log(`${user.email} is now ${role} of "${ws.name}" on ${host}`);
  } else {
    throw new Error(
      "usage: brand.ts list | create <name> --owner <email> | rename <brand> <new name> | add-member <brand> <email> [ADMIN|MEMBER]"
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(String(e?.message ?? e));
    process.exit(1);
  });
