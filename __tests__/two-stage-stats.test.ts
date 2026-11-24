/**
 * Two-step campaigns log each person twice (comment, then button tap), so the
 * click rate is measured against the people who actually got the link.
 */
import { describe, expect, it } from "vitest";
import { calculateCtr, countLinkRecipients } from "../lib/tracking/analytics";

describe("countLinkRecipients", () => {
  it("counts only button taps for a campaign with an opening DM", () => {
    // One comment (opening DM) and one tap (the link): one recipient.
    expect(countLinkRecipients({ openingDmEnabled: true, commentSent: 1, tapSent: 1 })).toBe(1);
    expect(calculateCtr(1, countLinkRecipients({ openingDmEnabled: true, commentSent: 1, tapSent: 1 }))).toBe(100);
  });

  it("counts the comment DMs for a one-step campaign", () => {
    expect(countLinkRecipients({ openingDmEnabled: false, commentSent: 4, tapSent: 0 })).toBe(4);
  });

  it("keeps taps from an earlier two-step period after switching to one step", () => {
    expect(countLinkRecipients({ openingDmEnabled: false, commentSent: 4, tapSent: 2 })).toBe(6);
  });

  it("gives a zero rate when nobody has the link yet", () => {
    expect(calculateCtr(0, countLinkRecipients({ openingDmEnabled: true, commentSent: 3, tapSent: 0 }))).toBe(0);
  });
});
