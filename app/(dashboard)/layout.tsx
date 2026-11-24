import { I18nProvider } from "@/lib/i18n/provider";
import { getI18n } from "@/lib/i18n/server";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import {
  ensureWorkspaceForUser,
  listMemberships,
  readActiveWorkspaceCookie,
} from "@/lib/workspace";
import { isPlatformAdmin } from "@/lib/env";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("OpenReply - Open source Instagram comment-to-DM automation") };
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locale } = await getI18n();
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const workspace = await ensureWorkspaceForUser(
    session.user.id,
    session.user.email
  );

  // Someone in several brands picks one first; the choice is kept in a
  // cookie, so this only happens until they have picked (or after it expires).
  const memberships = await listMemberships(session.user.id);
  const picked = await readActiveWorkspaceCookie();
  if (
    memberships.length > 1 &&
    !memberships.some((m) => m.workspaceId === picked)
  ) {
    redirect("/brands");
  }
  const accounts = await prisma.instagramAccount.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { connectedAt: "desc" },
    select: { username: true },
  });

  return (
    <I18nProvider locale={locale}>
      <DashboardShell
        workspaceName={workspace.name}
        canSwitchBrand={memberships.length > 1}
        isPlatformAdmin={isPlatformAdmin(session.user.email)}
        instagramUsername={accounts[0]?.username ?? null}
        instagramAccountCount={accounts.length}
      >
        {children}
      </DashboardShell>
    </I18nProvider>
  );
}
