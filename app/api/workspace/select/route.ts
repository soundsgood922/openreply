import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { ACTIVE_WORKSPACE_COOKIE, listMemberships } from "@/lib/workspace";

/**
 * Switches the brand this browser works in. Posted by the brand picker as a
 * plain form, so it answers with a redirect. Only a brand the person belongs
 * to can be chosen.
 */
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  const form = await request.formData().catch(() => null);
  const workspaceId = String(form?.get("workspaceId") ?? "");
  const memberships = await listMemberships(userId);
  if (!memberships.some((m) => m.workspaceId === workspaceId)) {
    return NextResponse.json(
      { success: false, error: "Not a member of that brand" },
      { status: 403 }
    );
  }

  const response = NextResponse.redirect(new URL("/dashboard", request.url), 303);
  response.cookies.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
