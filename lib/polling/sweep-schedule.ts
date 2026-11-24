/**
 * How often the polling sweep looks at a campaign's post.
 *
 * Webhooks deliver nearly every comment within seconds whatever the post's
 * age; the sweep only catches the few Meta never pushes. A post past its
 * first couple of weeks gets a comment every few months, so sweeping it every
 * 30 seconds spends thousands of API calls a day on nothing. Posts older than
 * OLD_POST_DAYS are swept every OLD_POST_INTERVAL_MS instead; newer posts keep
 * the worker's normal interval.
 *
 * Fail-open throughout: if the publish time or Redis is unavailable, the
 * campaign is swept as a new post, exactly as before this existed.
 */
import { getRedisConnection } from "@/lib/queue/client";

export const OLD_POST_DAYS = Number(process.env.COMMENT_POLL_OLD_POST_DAYS ?? 14);
export const OLD_POST_INTERVAL_MS = Number(
  process.env.COMMENT_POLL_OLD_POST_INTERVAL_MS ?? 30 * 60_000
);

const DAY_MS = 86_400_000;
// A publish time never changes; an unknown one is retried a day later.
const PUBLISHED_TTL_SECONDS = 90 * 86_400;
const UNKNOWN_TTL_SECONDS = 86_400;

/** True when the post was published more than OLD_POST_DAYS ago. */
export function isOldPost(publishedAt: Date | null, now: number = Date.now()): boolean {
  if (!publishedAt || Number.isNaN(publishedAt.getTime())) return false;
  return now - publishedAt.getTime() > OLD_POST_DAYS * DAY_MS;
}

/**
 * When an old post is next due. The first time it is spread anywhere across
 * one interval, and each later run lands within ±15% of the interval, so a
 * hundred old campaigns never all sweep in the same pass.
 */
export function nextDueAt(
  now: number,
  firstTime: boolean,
  random: () => number = Math.random
): number {
  if (firstTime) return now + Math.floor(random() * OLD_POST_INTERVAL_MS);
  return now + Math.floor(OLD_POST_INTERVAL_MS * (0.85 + random() * 0.3));
}

/**
 * The post's publish time, read once and cached. `fetchPublishedAt` is the
 * provider read; any failure counts as unknown (treated as a new post).
 */
export async function getCachedPublishedAt(
  mediaId: string,
  fetchPublishedAt: () => Promise<string | null>
): Promise<Date | null> {
  const key = `post-published:${mediaId}`;
  try {
    const cached = await getRedisConnection().get(key);
    if (cached === "unknown") return null;
    if (cached) return new Date(cached);
  } catch {
    // No cache: fall through to a live read.
  }

  let published: string | null = null;
  try {
    published = await fetchPublishedAt();
  } catch {
    published = null;
  }

  try {
    await getRedisConnection().set(
      key,
      published ?? "unknown",
      "EX",
      published ? PUBLISHED_TTL_SECONDS : UNKNOWN_TTL_SECONDS
    );
  } catch {
    // Caching is an optimisation only.
  }
  return published ? new Date(published) : null;
}

/**
 * Whether the sweep should look at this campaign now. New posts: always.
 * Old posts: once the campaign's next due time has passed, which this then
 * moves forward.
 */
export async function shouldSweepCampaign(
  automationId: string,
  publishedAt: Date | null,
  now: number = Date.now()
): Promise<boolean> {
  if (!isOldPost(publishedAt, now)) return true;

  const key = `sweep-next:${automationId}`;
  try {
    const redis = getRedisConnection();
    const due = await redis.get(key);
    if (due && now < Number(due)) return false;
    await redis.set(key, String(nextDueAt(now, !due)), "PX", OLD_POST_INTERVAL_MS * 3);
    // A campaign seen for the first time (after a deploy, or a worker outage
    // long enough for its record to expire) gets a random first turn within
    // one interval instead of joining a burst; webhooks cover it meanwhile.
    return Boolean(due);
  } catch {
    return true;
  }
}
