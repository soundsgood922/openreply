/**
 * Old posts are swept every half hour instead of every pass, spread out so
 * they never all run together; anything unknown is swept as before.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, broken } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  broken: { value: false },
}));
vi.mock("@/lib/queue/client", () => ({
  getRedisConnection: () => {
    if (broken.value) throw new Error("redis down");
    return {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: string) => {
        store.set(k, v);
        return "OK";
      },
    };
  },
}));

import {
  OLD_POST_INTERVAL_MS,
  getCachedPublishedAt,
  isOldPost,
  nextDueAt,
  shouldSweepCampaign,
} from "@/lib/polling/sweep-schedule";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-25T00:00:00Z");
const old = new Date(NOW - 45 * DAY);
const recent = new Date(NOW - 3 * DAY);

beforeEach(() => {
  store.clear();
  broken.value = false;
});

describe("isOldPost", () => {
  it("is true only past 30 days", () => {
    expect(isOldPost(new Date(NOW - 31 * DAY), NOW)).toBe(true);
    expect(isOldPost(new Date(NOW - 29 * DAY), NOW)).toBe(false);
    expect(isOldPost(new Date(NOW - 15 * DAY), NOW)).toBe(false);
  });
  it("treats an unknown publish time as new", () => {
    expect(isOldPost(null, NOW)).toBe(false);
    expect(isOldPost(new Date("nonsense"), NOW)).toBe(false);
  });
});

describe("nextDueAt", () => {
  it("spreads a first sighting across one interval", () => {
    expect(nextDueAt(NOW, true, () => 0)).toBe(NOW);
    expect(nextDueAt(NOW, true, () => 0.999)).toBeLessThan(NOW + OLD_POST_INTERVAL_MS);
  });
  it("keeps later runs within 15% of the interval", () => {
    expect(nextDueAt(NOW, false, () => 0)).toBe(NOW + OLD_POST_INTERVAL_MS * 0.85);
    expect(nextDueAt(NOW, false, () => 0.999)).toBeLessThan(NOW + OLD_POST_INTERVAL_MS * 1.15);
  });
});

describe("shouldSweepCampaign", () => {
  it("always sweeps a recent post", async () => {
    for (let i = 0; i < 3; i++) expect(await shouldSweepCampaign("c", recent, NOW)).toBe(true);
    expect(store.size).toBe(0);
  });

  it("gives an old post a spread first turn, then about one sweep per interval", async () => {
    expect(await shouldSweepCampaign("c", old, NOW)).toBe(false);
    const due = Number(store.get("sweep-next:c"));
    expect(due).toBeLessThanOrEqual(NOW + OLD_POST_INTERVAL_MS);

    expect(await shouldSweepCampaign("c", old, due - 1)).toBe(false);
    expect(await shouldSweepCampaign("c", old, due)).toBe(true);
    // Not again until roughly another interval has passed.
    expect(await shouldSweepCampaign("c", old, due + 30_000)).toBe(false);
    expect(Number(store.get("sweep-next:c"))).toBeGreaterThanOrEqual(due + OLD_POST_INTERVAL_MS * 0.85);
  });

  it("sweeps as before when Redis is unavailable", async () => {
    broken.value = true;
    expect(await shouldSweepCampaign("c", old, NOW)).toBe(true);
  });
});

describe("getCachedPublishedAt", () => {
  it("reads once and caches", async () => {
    const fetcher = vi.fn(async () => "2026-10-01T00:00:00+0000");
    const first = await getCachedPublishedAt("m", fetcher);
    const second = await getCachedPublishedAt("m", fetcher);
    expect(first?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(second?.getTime()).toBe(first?.getTime());
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("treats a failed read as unknown and remembers that", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("Meta down");
    });
    expect(await getCachedPublishedAt("m", fetcher)).toBeNull();
    expect(await getCachedPublishedAt("m", fetcher)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("still reads live when Redis is unavailable", async () => {
    broken.value = true;
    expect((await getCachedPublishedAt("m", async () => "2026-10-01T00:00:00Z"))?.getUTCMonth()).toBe(9);
  });
});
