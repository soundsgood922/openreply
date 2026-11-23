import { prisma } from "@/lib/db/client";
import { getDMQueue } from "@/lib/queue/client";
import { Prisma } from "@/app/generated/prisma/client";

/**
 * A Page webhook (object "page"). New comments arrive as `feed` changes with
 * item "comment" and verb "add"; everything else on the feed (reactions,
 * posts, edits) is ignored.
 */
export interface PageWebhookPayload {
  object?: string;
  entry?: {
    id: string;
    time?: number;
    changes?: {
      field: string;
      value?: {
        item?: string;
        verb?: string;
        comment_id?: string;
        post_id?: string;
        parent_id?: string;
        message?: string;
        from?: { id: string; name?: string };
        created_time?: number | string;
      };
    }[];
  }[];
}

export interface PageCommentEvent {
  pageId: string;
  commentId: string;
  postId: string;
  commentText: string;
  commenterId: string;
  commenterName?: string;
}

export function parsePageCommentEvents(
  payload: PageWebhookPayload
): PageCommentEvent[] {
  if (payload.object !== "page" || !Array.isArray(payload.entry)) return [];
  const events: PageCommentEvent[] = [];
  for (const entry of payload.entry) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (change.field !== "feed" || !v) continue;
      if (v.item !== "comment" || v.verb !== "add") continue;
      if (!v.comment_id || !v.post_id || !v.from?.id) continue;
      // The Page's own comments (including the tool's public replies).
      if (v.from.id === entry.id) continue;
      events.push({
        pageId: entry.id,
        commentId: v.comment_id,
        postId: v.post_id,
        commentText: v.message ?? "",
        commenterId: v.from.id,
        commenterName: v.from.name,
      });
    }
  }
  return events;
}

/**
 * Queues new Page comments for the same worker job Instagram comments use.
 * Only Pages connected as FACEBOOK accounts are handled; events for any other
 * Page are dropped before anything is stored.
 */
export async function processFacebookWebhook(
  payload: PageWebhookPayload
): Promise<void> {
  const events = parsePageCommentEvents(payload);
  if (events.length === 0) return;

  const accounts = await prisma.instagramAccount.findMany({
    where: {
      provider: "FACEBOOK",
      instagramId: { in: [...new Set(events.map((e) => e.pageId))] },
    },
    select: { id: true, instagramId: true, workspaceId: true },
  });
  const accountMap = new Map(accounts.map((a) => [a.instagramId, a]));
  const ours = events.filter((e) => accountMap.has(e.pageId));
  if (ours.length === 0) return;

  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      object: "page",
      payload: payload as unknown as Prisma.InputJsonValue,
      workspaceId: accountMap.get(ours[0].pageId)!.workspaceId,
      status: "PENDING",
    },
  });

  try {
    const queue = getDMQueue();
    for (const event of ours) {
      await queue.add(
        "process-comment",
        {
          instagramAccountId: event.pageId,
          accountConnectionId: accountMap.get(event.pageId)!.id,
          commentId: event.commentId,
          commentText: event.commentText,
          commenterId: event.commenterId,
          commenterName: event.commenterName,
          mediaId: event.postId,
          source: "WEBHOOK",
        },
        { jobId: `comment_${event.pageId}_${event.commentId}` }
      );
    }
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { status: "PROCESSED", processedAt: new Date() },
    });
  } catch (error) {
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        processedAt: new Date(),
      },
    });
    throw error;
  }
}
