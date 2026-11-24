import { prisma } from "@/lib/db/client";
import type { Workspace, WorkspaceRole } from "@/app/generated/prisma/client";

/**
 * Which workspace (brand) the signed-in person is working in. A person can
 * belong to several brands; the cookie names the one they picked, and is only
 * honoured when they are a member of it, so a hand-edited value falls back to
 * their first brand instead of opening someone else's.
 */
export const ACTIVE_WORKSPACE_COOKIE = "or_workspace";

/** Every brand a person belongs to, oldest membership first. */
export async function listMemberships(userId: string) {
  return prisma.workspaceMember.findMany({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
}

/** The membership the cookie points at, else the oldest one. */
export function pickActiveMembership<T extends { workspaceId: string }>(
  memberships: T[],
  preferredWorkspaceId: string | null | undefined
): T | null {
  return (
    memberships.find((m) => m.workspaceId === preferredWorkspaceId) ??
    memberships[0] ??
    null
  );
}

/**
 * The picked brand from the request cookie. Outside a request (scripts, the
 * worker) there is no cookie and this is null, which keeps the oldest-brand
 * behaviour those callers always had.
 */
export async function readActiveWorkspaceCookie(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    return (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

function normalizeInviteEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function acceptPendingInvitationsForUser(
  userId: string,
  email?: string | null
): Promise<void> {
  if (!email) return;

  const normalizedEmail = normalizeInviteEmail(email);
  const now = new Date();
  const invitations = await prisma.workspaceInvitation.findMany({
    where: {
      email: normalizedEmail,
      status: "PENDING",
      expiresAt: { gt: now },
    },
  });

  for (const invitation of invitations) {
    await prisma.$transaction([
      prisma.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: invitation.workspaceId,
            userId,
          },
        },
        create: {
          workspaceId: invitation.workspaceId,
          userId,
          role: invitation.role,
        },
        update: {
          role: invitation.role,
        },
      }),
      prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: now,
        },
      }),
    ]);
  }
}

export async function getWorkspaceMembership(userId: string): Promise<{
  workspace: Workspace;
  role: WorkspaceRole;
} | null> {
  const membership = pickActiveMembership(
    await listMemberships(userId),
    await readActiveWorkspaceCookie()
  );

  if (!membership) return null;

  return {
    workspace: membership.workspace,
    role: membership.role,
  };
}

export async function ensureWorkspaceForUser(
  userId: string,
  email?: string | null
): Promise<Workspace> {
  await acceptPendingInvitationsForUser(userId, email);

  const existingMembership = await getWorkspaceMembership(userId);
  if (existingMembership) {
    return existingMembership.workspace;
  }

  const workspaceName = email ? `${email.split("@")[0]}'s workspace` : "My workspace";

  return prisma.workspace.create({
    data: {
      name: workspaceName,
      ownerId: userId,
      members: {
        create: {
          userId,
          role: "OWNER",
        },
      },
    },
  });
}

export async function getPrimaryWorkspace(userId: string): Promise<Workspace | null> {
  const membership = await getWorkspaceMembership(userId);
  return membership?.workspace ?? null;
}
