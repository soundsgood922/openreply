/**
 * Facebook Page support: Page accounts reach the Facebook endpoints through
 * the provider layer, Page webhooks are parsed into the comment job the worker
 * already runs, and with FACEBOOK_PAGES_ENABLED off nothing about Pages runs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, queueAdd } = vi.hoisted(() => ({
  mockPrisma: {
    zernioConnection: { findUnique: vi.fn() },
    automation: { findMany: vi.fn() },
    instagramAccount: { findMany: vi.fn() },
    webhookEvent: { create: vi.fn(), update: vi.fn() },
    dmLog: { findMany: vi.fn() },
    operationalEvent: { create: vi.fn() },
    $queryRaw: vi.fn(),
  },
  queueAdd: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/meta/oauth", () => ({
  decryptToken: (value: string) => `decrypted:${value}`,
}));
vi.mock("@/lib/queue/client", () => ({
  getDMQueue: () => ({ add: queueAdd }),
  MESSAGE_JOB_NAME: "process-message",
  POSTBACK_JOB_NAME: "process-postback",
}));

import {
  createInstagramContext,
  getRecentMediaComments,
  getUserMedia,
  sendCommentReply,
  sendPrivateReplyWithLinkButton,
} from "@/lib/instagram/provider";
import {
  parsePageCommentEvents,
  parsePagePostbackEvents,
  processFacebookWebhook,
} from "@/lib/facebook/process-webhook";
import { commenterIdOf, reconcileComments } from "@/lib/polling/comment-reconciler";

const PAGE = "102026719003284";
const page = { provider: "FACEBOOK" as const, accessToken: "page-token", instagramId: PAGE };

const fetchMock = vi.fn();
function respond(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Facebook Page provider", () => {
  it("builds a FACEBOOK context from a FACEBOOK account", async () => {
    await expect(
      createInstagramContext({
        provider: "FACEBOOK",
        workspaceId: "w",
        zernioAccountId: null,
        instagramId: PAGE,
        accessToken: "enc",
      })
    ).resolves.toEqual({ provider: "FACEBOOK", accessToken: "decrypted:enc", instagramId: PAGE });
  });

  it("sends the private reply from the Page with a button template", async () => {
    respond({ recipient_id: "psid", message_id: "m1" });
    await sendPrivateReplyWithLinkButton({
      context: page,
      instagramAccountId: PAGE,
      commentId: "post_comment",
      text: "x".repeat(700),
      buttons: [
        { title: "a very long button title here", url: "https://a" },
        { title: "b", url: "https://b" },
        { title: "c", url: "https://c" },
        { title: "d", url: "https://d" },
      ],
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://graph.facebook.com/v25.0/${PAGE}/messages`);
    const body = JSON.parse(init.body);
    expect(body.recipient).toEqual({ comment_id: "post_comment" });
    const payload = body.message.attachment.payload;
    expect(payload.template_type).toBe("button");
    expect(payload.text).toHaveLength(640);
    expect(payload.buttons).toHaveLength(3);
    expect(payload.buttons[0]).toEqual({ type: "web_url", url: "https://a", title: "a very long button t" });
  });

  it("posts the public reply as a comment on the comment", async () => {
    respond({ id: "reply" });
    await sendCommentReply({ context: page, commentId: "post_comment", message: "hi" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://graph.facebook.com/v25.0/post_comment/comments");
  });

  it("maps Page comments onto the Instagram comment shape", async () => {
    respond({
      data: [
        {
          id: "c1",
          message: "test",
          created_time: new Date().toISOString(),
          from: { id: "u1", name: "Fan" },
          comments: { data: [{ id: "r1", from: { id: PAGE, name: "Page" } }] },
        },
      ],
    });
    const [c] = await getRecentMediaComments({ context: page, mediaId: "post", sinceMs: 0 });
    expect(c).toMatchObject({ id: "c1", text: "test", from: { id: "u1", username: "Fan" } });
    expect(c.replies?.data?.[0].from?.id).toBe(PAGE);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/post/comments");
  });

  it("lists the Page's published posts", async () => {
    respond({ data: [{ id: `${PAGE}_1`, message: "hello", created_time: "2026-11-01T00:00:00+0000", full_picture: "https://img" }] });
    const [post] = await getUserMedia({ context: page, limit: 5 });
    expect(post).toMatchObject({ id: `${PAGE}_1`, caption: "hello", media_url: "https://img" });
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/${PAGE}/published_posts`);
  });

  it("leaves Instagram requests on the Instagram path", async () => {
    respond({ data: [{ id: "media" }] });
    await getUserMedia({ context: { provider: "META", accessToken: "t", instagramId: "ig" }, limit: 1 });
    expect(String(fetchMock.mock.calls[0][0])).toContain("graph.instagram.com");
  });
});

const feedComment = (from: string, extra: Record<string, unknown> = {}) => ({
  object: "page",
  entry: [
    {
      id: PAGE,
      changes: [
        {
          field: "feed",
          value: {
            item: "comment",
            verb: "add",
            comment_id: `${PAGE}_1_99`,
            post_id: `${PAGE}_1`,
            parent_id: `${PAGE}_1`,
            message: "test",
            from: { id: from, name: "Fan" },
            ...extra,
          },
        },
      ],
    },
  ],
});

describe("Page webhooks", () => {
  it("parses a new comment", () => {
    expect(parsePageCommentEvents(feedComment("u1"))).toEqual([
      { pageId: PAGE, commentId: `${PAGE}_1_99`, postId: `${PAGE}_1`, commentText: "test", commenterId: "u1", commenterName: "Fan" },
    ]);
  });

  it("ignores the Page's own comments, edits and reactions", () => {
    expect(parsePageCommentEvents(feedComment(PAGE))).toEqual([]);
    expect(parsePageCommentEvents(feedComment("u1", { verb: "edited" }))).toEqual([]);
    expect(parsePageCommentEvents(feedComment("u1", { item: "reaction" }))).toEqual([]);
    expect(parsePageCommentEvents({ ...feedComment("u1"), object: "instagram" })).toEqual([]);
  });

  it("queues the comment job for a connected Page", async () => {
    mockPrisma.instagramAccount.findMany.mockResolvedValue([{ id: "acc", instagramId: PAGE, workspaceId: "w" }]);
    mockPrisma.webhookEvent.create.mockResolvedValue({ id: "evt" });
    await processFacebookWebhook(feedComment("u1"));
    expect(mockPrisma.instagramAccount.findMany.mock.calls[0][0].where.provider).toBe("FACEBOOK");
    expect(queueAdd).toHaveBeenCalledWith(
      "process-comment",
      expect.objectContaining({ instagramAccountId: PAGE, accountConnectionId: "acc", mediaId: `${PAGE}_1`, source: "WEBHOOK" }),
      { jobId: `comment_${PAGE}_${PAGE}_1_99` }
    );
  });

  it("stores nothing for a Page that is not connected", async () => {
    mockPrisma.instagramAccount.findMany.mockResolvedValue([]);
    await processFacebookWebhook(feedComment("u1"));
    expect(mockPrisma.webhookEvent.create).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });
});

describe("FACEBOOK_PAGES_ENABLED", () => {
  it("keeps Page campaigns out of the sweep while off", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([]);
    await reconcileComments();
    expect(mockPrisma.automation.findMany.mock.calls[0][0].where).toEqual({
      isActive: true,
      instagramAccount: { provider: { not: "FACEBOOK" } },
    });
  });

  it("sweeps Page campaigns once on", async () => {
    vi.stubEnv("FACEBOOK_PAGES_ENABLED", "true");
    mockPrisma.automation.findMany.mockResolvedValue([]);
    await reconcileComments();
    expect(mockPrisma.automation.findMany.mock.calls[0][0].where).toEqual({ isActive: true });
  });
});

describe("comments without an author", () => {
  const comment = { id: "post_c1", text: "test", timestamp: "2026-11-23T00:00:00Z" };
  it("keeps a Page comment under a stand-in id", () => {
    expect(commenterIdOf(comment, "FACEBOOK")).toBe("fb_comment_post_c1");
  });
  it("still skips an Instagram comment", () => {
    expect(commenterIdOf(comment, "META")).toBeUndefined();
    expect(commenterIdOf({ ...comment, from: { id: "u1" } }, "META")).toBe("u1");
  });
});

const tap = (sender: string) => ({
  object: "page",
  entry: [
    {
      id: PAGE,
      messaging: [
        {
          sender: { id: sender },
          recipient: { id: PAGE },
          postback: { payload: "reveal:auto1:open", title: "Get it", mid: "m_1:x" },
        },
      ],
    },
  ],
});

describe("Messenger button taps", () => {
  it("parses a tap and ignores the Page's own", () => {
    expect(parsePagePostbackEvents(tap("psid1"))).toEqual([
      { pageId: PAGE, userId: "psid1", payload: "reveal:auto1:open", mid: "m_1:x" },
    ]);
    expect(parsePagePostbackEvents(tap(PAGE))).toEqual([]);
  });

  it("queues the postback job that delivers the link", async () => {
    mockPrisma.instagramAccount.findMany.mockResolvedValue([{ id: "acc", instagramId: PAGE, workspaceId: "w" }]);
    mockPrisma.webhookEvent.create.mockResolvedValue({ id: "evt" });
    await processFacebookWebhook(tap("psid1"));
    expect(queueAdd).toHaveBeenCalledWith(
      "process-postback",
      { instagramAccountId: PAGE, accountConnectionId: "acc", userId: "psid1", payload: "reveal:auto1:open", mid: "m_1:x" },
      { jobId: `postback_${PAGE}_psid1_m_1_x` }
    );
  });
});
