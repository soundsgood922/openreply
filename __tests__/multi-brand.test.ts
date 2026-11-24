/**
 * Several brands per person: the picked brand lives in a cookie, is honoured
 * only for a brand the person belongs to, and only listed admins see the
 * brand overview.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, currentUser } = vi.hoisted(() => ({
  mockPrisma: { workspaceMember: { findMany: vi.fn() } },
  currentUser: { id: null as string | null },
}));
vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({ getCurrentUserId: async () => currentUser.id }));

import { pickActiveMembership, ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspace";
import { isPlatformAdmin } from "@/lib/env";
import { POST } from "@/app/api/workspace/select/route";

const memberships = [
  { workspaceId: "voice", workspace: { id: "voice", name: "聲藝" } },
  { workspaceId: "mark", workspace: { id: "mark", name: "馬克" } },
];

function selectRequest(workspaceId: string) {
  const body = new FormData();
  body.set("workspaceId", workspaceId);
  return new Request("https://app.example/api/workspace/select", { method: "POST", body }) as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  currentUser.id = "lola";
  mockPrisma.workspaceMember.findMany.mockResolvedValue(memberships);
});
afterEach(() => vi.unstubAllEnvs());

describe("pickActiveMembership", () => {
  it("uses the brand the cookie names", () => {
    expect(pickActiveMembership(memberships, "mark")?.workspaceId).toBe("mark");
  });
  it("falls back to the oldest brand without a cookie", () => {
    expect(pickActiveMembership(memberships, null)?.workspaceId).toBe("voice");
  });
  it("ignores a cookie naming a brand the person is not in", () => {
    expect(pickActiveMembership(memberships, "someone-else")?.workspaceId).toBe("voice");
  });
  it("returns null for someone in no brand", () => {
    expect(pickActiveMembership([], "mark")).toBeNull();
  });
});

describe("POST /api/workspace/select", () => {
  it("sets the cookie and goes to the dashboard for a member", async () => {
    const res = await POST(selectRequest("mark"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://app.example/dashboard");
    expect(res.cookies.get(ACTIVE_WORKSPACE_COOKIE)?.value).toBe("mark");
    expect(res.cookies.get(ACTIVE_WORKSPACE_COOKIE)?.httpOnly).toBe(true);
  });
  it("refuses a brand the person is not in", async () => {
    const res = await POST(selectRequest("katia"));
    expect(res.status).toBe(403);
    expect(res.cookies.get(ACTIVE_WORKSPACE_COOKIE)).toBeUndefined();
  });
  it("sends a signed-out visitor to login", async () => {
    currentUser.id = null;
    const res = await POST(selectRequest("mark"));
    expect(res.headers.get("location")).toBe("https://app.example/login");
  });
});

describe("isPlatformAdmin", () => {
  it("is true only for listed addresses, case-insensitively", () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "Boss@Example.com, other@example.com");
    expect(isPlatformAdmin("boss@example.com")).toBe(true);
    expect(isPlatformAdmin("mark@example.com")).toBe(false);
    expect(isPlatformAdmin(null)).toBe(false);
  });
  it("is false for everyone when unset", () => {
    vi.stubEnv("PLATFORM_ADMIN_EMAILS", "");
    expect(isPlatformAdmin("boss@example.com")).toBe(false);
  });
});
