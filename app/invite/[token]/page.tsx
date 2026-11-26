import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getI18n } from "@/lib/i18n/server";
import InvitationAcceptCard from "@/components/invitation-accept-card";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

type InvitePageProps = {
  params: Promise<{ token: string }>;
};

export const metadata: Metadata = {
  title: "後台邀請｜OpenReply",
  robots: { index: false, follow: false },
};

const BUTTON =
  "inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground transition-colors hover:bg-primary/90";

function InviteShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-[593px]">
        <h1 className="mb-10 text-center text-3xl font-bold tracking-tight text-foreground">
          後台邀請
        </h1>
        <div className="rounded-2xl bg-card px-8 py-7">{children}</div>
      </div>
    </div>
  );
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { label } = await getI18n();
  const { token } = await params;
  const [session, invitation] = await Promise.all([
    auth(),
    prisma.workspaceInvitation.findUnique({
      where: { token },
      include: {
        workspace: { select: { name: true } },
      },
    }),
  ]);
  const userId = session?.user?.id ?? null;

  if (!invitation || invitation.status !== "PENDING") {
    // Signing in accepts pending invites on its own, so someone who logs in
    // from this page comes back to an invite that is already used. If they
    // are now in that brand, say so and take them there.
    const membership =
      invitation && userId
        ? await prisma.workspaceMember.findUnique({
            where: {
              workspaceId_userId: { workspaceId: invitation.workspaceId, userId },
            },
          })
        : null;

    if (invitation && membership) {
      return (
        <InviteShell>
          <p className="text-sm font-medium text-primary">已完成</p>
          <h2 className="mt-2 text-2xl font-bold text-foreground">
            你已加入「{invitation.workspace.name}」
          </h2>
          <form action="/api/workspace/select" method="post" className="mt-10">
            <input type="hidden" name="workspaceId" value={invitation.workspaceId} />
            <button type="submit" className={BUTTON}>
              前往後台
            </button>
          </form>
        </InviteShell>
      );
    }

    return (
      <InviteShell>
        <h2 className="text-2xl font-bold text-foreground">這份邀請已失效</h2>
        <p className="mt-3 text-base leading-7 text-secondary-foreground">
          邀請可能已被使用或取消，請聯絡邀請你的人重新寄送。
        </p>
        <Link href={userId ? "/dashboard" : "/login"} className={`${BUTTON} mt-10`}>
          {userId ? "回到後台" : "前往登入"}
        </Link>
      </InviteShell>
    );
  }

  const expired = invitation.expiresAt <= new Date();

  return (
    <InviteShell>
      <p className="text-sm font-medium text-primary">你收到一份邀請</p>
      <h2 className="mt-2 text-2xl font-bold text-foreground">
        加入「{invitation.workspace.name}」
      </h2>
      <p className="mt-3 text-base leading-7 text-secondary-foreground">
        邀請對象：<span className="font-medium text-foreground">{invitation.email}</span>
        <br />
        身分：<span className="font-medium text-foreground">{label(invitation.role)}</span>
      </p>

      <div className="mt-10">
        {expired ? (
          <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-destructive">
            這份邀請已過期，請聯絡邀請你的人重新寄送。
          </p>
        ) : (
          <InvitationAcceptCard
            token={token}
            isSignedIn={Boolean(userId)}
            invitedEmail={invitation.email}
          />
        )}
      </div>
    </InviteShell>
  );
}
