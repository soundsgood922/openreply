/**
 * Facebook Page support is off unless FACEBOOK_PAGES_ENABLED=true. With it off,
 * the polling sweep skips FACEBOOK accounts and Page webhooks are ignored, so a
 * deployment behaves exactly as it did before Page support existed.
 */
export function facebookPagesEnabled(): boolean {
  return process.env.FACEBOOK_PAGES_ENABLED === "true";
}
