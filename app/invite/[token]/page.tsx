import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { notFound } from "next/navigation";
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

  if (!invitation || invitation.status !== "PENDING") {
    notFound();
  }

  const expired = invitation.expiresAt <= new Date();

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-[593px]">
        <h1 className="mb-10 text-center text-3xl font-bold tracking-tight text-foreground">
          後台邀請
        </h1>

        <div className="rounded-2xl bg-card px-8 py-7">
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
                isSignedIn={Boolean(session?.user?.id)}
                invitedEmail={invitation.email}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
