import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const webhookCreate = vi.fn(async () => ({ id: "evt_1" }));
const webhookUpdate = vi.fn();
const queueAdd = vi.fn();

vi.mock("@/lib/db/client", () => ({
  prisma: {
    instagramAccount: { findMany: (...args: unknown[]) => findMany(...args) },
    webhookEvent: {
      create: (...args: unknown[]) => webhookCreate(...args),
      update: (...args: unknown[]) => webhookUpdate(...args),
    },
  },
}));

vi.mock("@/lib/queue/client", () => ({
  getDMQueue: () => ({ add: (...args: unknown[]) => queueAdd(...args) }),
  MESSAGE_JOB_NAME: "process-message",
  POSTBACK_JOB_NAME: "process-postback",
}));

import { processInstagramWebhook } from "@/lib/queue/process-webhook";

const GRAPH_ID = "17841450929116626";
const MESSAGING_ID = "17841464220466955";

function commentPayload(entryId: string) {
  return {
    object: "instagram",
    entry: [
      {
        id: entryId,
        time: 1,
        changes: [
          {
            field: "comments",
            value: {
              id: "comment_1",
              text: "test",
              from: { id: "commenter_1", username: "someone" },
              media: { id: "media_1" },
            },
          },
        ],
      },
    ],
  };
}

describe("webhook account matching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([
      { id: "row_1", instagramId: GRAPH_ID, messagingId: MESSAGING_ID, workspaceId: "ws_1" },
    ]);
  });

  it("accepts an event identified by the Graph account id", async () => {
    await processInstagramWebhook({
      payload: commentPayload(GRAPH_ID) as Parameters<typeof processInstagramWebhook>[0]["payload"],
      provider: "META",
    });
    expect(webhookCreate).toHaveBeenCalled();
    expect(queueAdd).toHaveBeenCalled();
  });

  it("accepts an event identified by the app-scoped messaging id", async () => {
    // Messaging webhooks carry an id Graph cannot resolve. Matching only on
    // the Graph id drops these events with no trace, which is indistinguishable
    // from Meta never having delivered them.
    await processInstagramWebhook({
      payload: commentPayload(MESSAGING_ID) as Parameters<typeof processInstagramWebhook>[0]["payload"],
      provider: "META",
    });
    expect(webhookCreate).toHaveBeenCalled();
    expect(queueAdd).toHaveBeenCalled();
  });

  it("still discards an event for an unknown account", async () => {
    findMany.mockResolvedValue([]);
    await processInstagramWebhook({
      payload: commentPayload("999") as Parameters<typeof processInstagramWebhook>[0]["payload"],
      provider: "META",
    });
    expect(webhookCreate).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it("looks the account up by either id", async () => {
    await processInstagramWebhook({
      payload: commentPayload(MESSAGING_ID) as Parameters<typeof processInstagramWebhook>[0]["payload"],
      provider: "META",
    });
    const where = (findMany.mock.calls[0][0] as { where: { OR: unknown[] } }).where;
    expect(where.OR).toEqual([
      { instagramId: { in: [MESSAGING_ID] } },
      { messagingId: { in: [MESSAGING_ID] } },
    ]);
  });
});
