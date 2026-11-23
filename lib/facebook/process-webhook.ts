import { prisma } from "@/lib/db/client";
import { getDMQueue, POSTBACK_JOB_NAME } from "@/lib/queue/client";
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
    // Messenger events (button taps on our DMs) arrive on the same Page
    // webhook once the Page subscribes to messaging_postbacks.
    messaging?: {
      sender?: { id?: string };
      recipient?: { id?: string };
      postback?: { payload?: string; title?: string; mid?: string };
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
      if (!v.comment_id || !v.post_id) continue;
      // The Page's own comments (including the tool's public replies).
      if (v.from?.id === entry.id) continue;
      events.push({
        pageId: entry.id,
        commentId: v.comment_id,
        postId: v.post_id,
        commentText: v.message ?? "",
        // Meta leaves out who commented for people without a role on the app
        // until it has Advanced Access; the private reply needs only the
        // comment id, so stand in an id unique to this comment.
        commenterId: v.from?.id ?? `fb_comment_${v.comment_id}`,
        commenterName: v.from?.name,
      });
    }
  }
  return events;
}

export interface PagePostbackEvent {
  pageId: string;
  userId: string;
  payload: string;
  mid?: string;
}

/** Button taps on the Page's Messenger messages (opening DM buttons). */
export function parsePagePostbackEvents(
  payload: PageWebhookPayload
): PagePostbackEvent[] {
  if (payload.object !== "page" || !Array.isArray(payload.entry)) return [];
  const events: PagePostbackEvent[] = [];
  for (const entry of payload.entry) {
    for (const m of entry.messaging ?? []) {
      const userId = m.sender?.id;
      const postback = m.postback?.payload;
      if (!userId || !postback || userId === entry.id) continue;
      events.push({ pageId: entry.id, userId, payload: postback, mid: m.postback?.mid });
    }
  }
  return events;
}

/**
 * Queues new Page comments for the same worker job Instagram comments use,
 * and Messenger button taps for the same postback job, which delivers the
 * link after an opening DM.
 * Only Pages connected as FACEBOOK accounts are handled; events for any other
 * Page are dropped before anything is stored.
 */
export async function processFacebookWebhook(
  payload: PageWebhookPayload
): Promise<void> {
  const events = parsePageCommentEvents(payload);
  const postbacks = parsePagePostbackEvents(payload);
  if (events.length === 0 && postbacks.length === 0) return;

  const pageIds = [...events, ...postbacks].map((e) => e.pageId);
  const accounts = await prisma.instagramAccount.findMany({
    where: {
      provider: "FACEBOOK",
      instagramId: { in: [...new Set(pageIds)] },
    },
    select: { id: true, instagramId: true, workspaceId: true },
  });
  const accountMap = new Map(accounts.map((a) => [a.instagramId, a]));
  const ours = events.filter((e) => accountMap.has(e.pageId));
  const ourPostbacks = postbacks.filter((e) => accountMap.has(e.pageId));
  if (ours.length === 0 && ourPostbacks.length === 0) return;

  const firstPage = (ours[0] ?? ourPostbacks[0]).pageId;
  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      object: "page",
      payload: payload as unknown as Prisma.InputJsonValue,
      workspaceId: accountMap.get(firstPage)!.workspaceId,
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
    for (const event of ourPostbacks) {
      await queue.add(
        POSTBACK_JOB_NAME,
        {
          instagramAccountId: event.pageId,
          accountConnectionId: accountMap.get(event.pageId)!.id,
          userId: event.userId,
          payload: event.payload,
          mid: event.mid,
        },
        {
          // Same shape as the Instagram postback job id; BullMQ forbids ":".
          jobId: `postback_${event.pageId}_${event.userId}_${(
            event.mid ?? event.payload
          ).replace(/:/g, "_")}`,
        }
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
