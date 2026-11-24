/**
 * Facebook Page counterpart of lib/meta/client.ts.
 *
 * A Page connected with a Page access token is stored as an account row with
 * provider FACEBOOK, its Page id in `instagramId`. The provider layer
 * (lib/instagram/*) dispatches to these functions for such accounts, and they
 * return the same shapes the Instagram functions do, so the worker, the
 * polling sweep and the dashboard handle a Page without knowing it is one.
 *
 * Endpoints (Graph API, Page token):
 * - posts:          GET  /{page-id}/published_posts
 * - comments:       GET  /{post-id}/comments
 * - public reply:   POST /{comment-id}/comments          (pages_manage_engagement)
 * - private reply:  POST /{page-id}/messages {recipient:{comment_id}}  (pages_messaging)
 *   One private reply per comment, within 7 days of the comment.
 * - button template: text up to 640 chars, 1-3 buttons.
 *
 * Errors go through the Instagram client's handleResponse so the worker's
 * error classification (rate limits, template rejections, permanent
 * rejections) applies unchanged.
 */
import { getMetaGraphApiVersion } from "@/lib/env";
import {
  handleResponse,
  type InstagramComment,
  type InstagramMedia,
  type InstagramUser,
  type LinkButton,
} from "@/lib/meta/client";

function graphBase() {
  return `https://graph.facebook.com/${getMetaGraphApiVersion()}`;
}

type SendResult = { recipient_id: string; message_id: string };

async function postMessage(
  accessToken: string,
  pageId: string,
  body: Record<string, unknown>
): Promise<SendResult> {
  const response = await fetch(`${graphBase()}/${pageId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  return handleResponse(response);
}

function buttonTemplate(
  text: string,
  buttons: Record<string, unknown>[]
): Record<string, unknown> {
  return {
    attachment: {
      type: "template",
      payload: { template_type: "button", text: text.slice(0, 640), buttons },
    },
  };
}

function toWebUrlButtons(buttons: LinkButton[]) {
  return buttons
    .slice(0, 3)
    .map((b) => ({ type: "web_url", url: b.url, title: b.title.slice(0, 20) }));
}

// --- Private replies (to a comment) --------------------------------------

export function sendPrivateReply(
  accessToken: string,
  pageId: string,
  commentId: string,
  message: string
) {
  return postMessage(accessToken, pageId, {
    recipient: { comment_id: commentId },
    message: { text: message },
  });
}

export function sendPrivateReplyWithLinkButton(
  accessToken: string,
  pageId: string,
  commentId: string,
  text: string,
  buttons: LinkButton[]
) {
  return postMessage(accessToken, pageId, {
    recipient: { comment_id: commentId },
    message: buttonTemplate(text, toWebUrlButtons(buttons)),
  });
}

export function sendPrivateReplyWithButton(
  accessToken: string,
  pageId: string,
  commentId: string,
  text: string,
  buttonTitle: string,
  payload: string
) {
  return postMessage(accessToken, pageId, {
    recipient: { comment_id: commentId },
    message: buttonTemplate(text, [
      { type: "postback", title: buttonTitle.slice(0, 20), payload },
    ]),
  });
}

// --- Direct messages (to a Page-scoped id, inside the 24h window) --------

export function sendDirectMessage(
  accessToken: string,
  pageId: string,
  userId: string,
  message: string
) {
  return postMessage(accessToken, pageId, {
    recipient: { id: userId },
    messaging_type: "RESPONSE",
    message: { text: message },
  });
}

export function sendDirectMessageWithLinkButton(
  accessToken: string,
  pageId: string,
  userId: string,
  text: string,
  buttons: LinkButton[]
) {
  return postMessage(accessToken, pageId, {
    recipient: { id: userId },
    messaging_type: "RESPONSE",
    message: buttonTemplate(text, toWebUrlButtons(buttons)),
  });
}

export function sendDirectMessageWithButton(
  accessToken: string,
  pageId: string,
  userId: string,
  text: string,
  buttonTitle: string,
  payload: string
) {
  return postMessage(accessToken, pageId, {
    recipient: { id: userId },
    messaging_type: "RESPONSE",
    message: buttonTemplate(text, [
      { type: "postback", title: buttonTitle.slice(0, 20), payload },
    ]),
  });
}

// --- Public reply ---------------------------------------------------------

export async function sendCommentReply(
  accessToken: string,
  commentId: string,
  message: string
): Promise<{ id: string }> {
  const response = await fetch(`${graphBase()}/${commentId}/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ message }),
  });
  return handleResponse(response);
}

// --- Reads ----------------------------------------------------------------

interface FacebookComment {
  id: string;
  message?: string;
  created_time: string;
  from?: { id: string; name?: string };
  comments?: { data?: { id: string; from?: { id: string; name?: string } }[] };
}

/** Maps a Page comment onto the Instagram comment shape the sweep reads. */
export function toInstagramComment(c: FacebookComment): InstagramComment {
  return {
    id: c.id,
    text: c.message ?? "",
    timestamp: c.created_time,
    from: c.from ? { id: c.from.id, username: c.from.name } : undefined,
    replies: {
      data: (c.comments?.data ?? []).map((r) => ({
        id: r.id,
        from: r.from ? { id: r.from.id, username: r.from.name } : undefined,
      })),
    },
  };
}

/**
 * Recent top-level comments on a Page post, newest first, each with its
 * replies so the sweep can tell whether the Page has already answered.
 * Stops paging once it passes `sinceMs` or reaches `max`.
 */
export async function getRecentPostComments(
  accessToken: string,
  postId: string,
  sinceMs: number,
  max = 800
): Promise<InstagramComment[]> {
  const results: InstagramComment[] = [];

  const first = new URL(`${graphBase()}/${postId}/comments`);
  first.searchParams.set(
    "fields",
    "id,message,created_time,from,comments.limit(25){from}"
  );
  first.searchParams.set("filter", "toplevel");
  first.searchParams.set("order", "reverse_chronological");
  first.searchParams.set("limit", "50");
  first.searchParams.set("access_token", accessToken);

  let nextUrl: string | null = first.toString();
  while (nextUrl !== null && results.length < max) {
    const response: Response = await fetch(nextUrl);
    const page = await handleResponse<{
      data: FacebookComment[];
      paging?: { next?: string };
    }>(response);
    const data = (page.data ?? []).map(toInstagramComment);
    results.push(...data);

    const oldest = data[data.length - 1];
    if (oldest?.timestamp && Date.parse(oldest.timestamp) < sinceMs) break;
    nextUrl = page.paging?.next ?? null;
  }

  return results
    .filter((c) => !c.timestamp || Date.parse(c.timestamp) >= sinceMs)
    .slice(0, max);
}

interface FacebookPost {
  id: string;
  message?: string;
  story?: string;
  created_time: string;
  permalink_url?: string;
  full_picture?: string;
  comments?: { summary?: { total_count?: number } };
}

/** Maps a Page post onto the Instagram media shape the post picker reads. */
export function toInstagramMedia(p: FacebookPost): InstagramMedia {
  return {
    id: p.id,
    caption: p.message ?? p.story,
    media_type: p.full_picture ? "IMAGE" : "TEXT",
    media_url: p.full_picture,
    thumbnail_url: p.full_picture,
    timestamp: p.created_time,
    permalink: p.permalink_url,
    comments_count: p.comments?.summary?.total_count,
  };
}

const POST_FIELDS =
  "id,message,story,created_time,permalink_url,full_picture,comments.limit(0).summary(true)";

/** The Page's published posts, newest first, following pages up to `max`. */
export async function getPagePosts(
  accessToken: string,
  pageId: string,
  max = 25
): Promise<InstagramMedia[]> {
  const results: InstagramMedia[] = [];
  const first = new URL(`${graphBase()}/${pageId}/published_posts`);
  first.searchParams.set("fields", POST_FIELDS);
  first.searchParams.set("limit", String(Math.min(100, max)));
  first.searchParams.set("access_token", accessToken);

  let nextUrl: string | null = first.toString();
  while (nextUrl !== null && results.length < max) {
    const response: Response = await fetch(nextUrl);
    const page = await handleResponse<{
      data: FacebookPost[];
      paging?: { next?: string };
    }>(response);
    results.push(...(page.data ?? []).map(toInstagramMedia));
    nextUrl = page.paging?.next ?? null;
  }
  return results.slice(0, max);
}

/** When a Page post was published (ISO 8601), for scheduling the sweep. */
export async function getPostCreatedTime(
  accessToken: string,
  postId: string
): Promise<string | null> {
  const url = new URL(`${graphBase()}/${postId}`);
  url.searchParams.set("fields", "created_time");
  url.searchParams.set("access_token", accessToken);
  const post = await handleResponse<{ created_time?: string }>(
    await fetch(url.toString())
  );
  return post.created_time ?? null;
}

/** The Page's name and picture, in the Instagram user shape. */
export async function getPageInfo(
  accessToken: string,
  pageId: string
): Promise<InstagramUser> {
  const url = new URL(`${graphBase()}/${pageId}`);
  url.searchParams.set("fields", "id,name,username,picture{url},followers_count");
  url.searchParams.set("access_token", accessToken);
  const page = await handleResponse<{
    id: string;
    name: string;
    username?: string;
    picture?: { data?: { url?: string } };
    followers_count?: number;
  }>(await fetch(url.toString()));
  return {
    id: page.id,
    user_id: page.id,
    username: page.username ?? page.name,
    name: page.name,
    profile_picture_url: page.picture?.data?.url,
    ...(typeof page.followers_count === "number"
      ? { followers_count: page.followers_count }
      : {}),
  };
}

/**
 * The display name behind a Page-scoped id (Messenger User Profile API), for
 * personalizing a DM to someone who tapped a button. Answered only for people
 * who have messaged or interacted with the Page; null otherwise.
 */
export async function getMessengerName(
  accessToken: string,
  psid: string
): Promise<string | null> {
  try {
    const url = new URL(`${graphBase()}/${psid}`);
    url.searchParams.set("fields", "name,first_name");
    url.searchParams.set("access_token", accessToken);
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = (await res.json()) as { name?: string; first_name?: string };
    return data.name ?? data.first_name ?? null;
  } catch {
    return null;
  }
}
