/**
 * Emoji-only keywords. Text keywords keep the old behaviour, where emoji in
 * the comment are ignored.
 */
import { describe, expect, it } from "vitest";
import { isEmojiKeyword, matchKeywords } from "../lib/utils/keyword-matcher";

const hit = (text: string, keywords: string[], whole = true) =>
  matchKeywords(text, keywords, whole).matched;

describe("emoji keywords", () => {
  it.each([true, false])("match a comment containing the emoji (whole word %s)", (whole) => {
    expect(hit("🔥", ["🔥"], whole)).toBe(true);
    expect(hit("好讚🔥", ["🔥"], whole)).toBe(true);
    expect(hit("我要 📚 謝謝", ["📚"], whole)).toBe(true);
    expect(hit("😍😍😍", ["😍"], whole)).toBe(true);
  });

  it("ignore the heart's presentation selector both ways", () => {
    expect(hit("❤", ["❤️"])).toBe(true);
    expect(hit("❤️", ["❤"])).toBe(true);
  });

  it("ignore skin tone", () => {
    expect(hit("👍🏻", ["👍"])).toBe(true);
    expect(hit("讚 👍🏽", ["👍🏿"])).toBe(true);
  });

  it("need a multi-emoji keyword in sequence", () => {
    expect(hit("🔥🔥", ["🔥🔥"])).toBe(true);
    expect(hit("🔥 好 🔥", ["🔥🔥"])).toBe(false);
  });

  it("do not match other emoji or plain text", () => {
    expect(hit("😂", ["🔥"])).toBe(false);
    expect(hit("火", ["🔥"])).toBe(false);
  });

  it("report the keyword as written", () => {
    expect(matchKeywords("讚❤", ["書單", "❤️"]).matchedKeyword).toBe("❤️");
  });
});

describe("text keywords are unchanged", () => {
  it("still ignore emoji around the word", () => {
    expect(hit("📚書單", ["書單"])).toBe(true);
    expect(hit("書單🔥🔥", ["書單"])).toBe(true);
  });

  it("treat a keyword with letters and emoji as text", () => {
    expect(isEmojiKeyword("📚書單")).toBe(false);
    expect(hit("書單", ["📚書單"])).toBe(true);
  });

  it("still apply whole-word matching", () => {
    expect(hit("我想學溝通", ["溝通"])).toBe(false);
    expect(hit("溝通", ["溝通"])).toBe(true);
  });
});

describe("isEmojiKeyword", () => {
  it.each(["🔥", "❤️", "👍🏽", "🇹🇼", "📚📚", " 🔥 "])("is true for %s", (k) => {
    expect(isEmojiKeyword(k)).toBe(true);
  });
  it.each(["書單", "test", "📚書單", "1"])("is false for %s", (k) => {
    expect(isEmojiKeyword(k)).toBe(false);
  });
});
