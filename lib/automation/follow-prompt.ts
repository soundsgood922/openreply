/**
 * Defaults for the "follow first" message of a follow-gated campaign, used
 * when the campaign leaves its own text empty.
 *
 * A tap on the button is re-checked for up to about a minute before the
 * person is asked again (Instagram is slow to report a fresh follow), and the
 * chat stays silent meanwhile, so the message says so up front.
 */
export const DEFAULT_FOLLOW_PROMPT_MESSAGE =
  "謝謝你的留言！🙌 傳連結給你之前，想先請你追蹤我們的帳號。\n\n追蹤好後點下方按鈕，系統需要大約 1 分鐘確認追蹤狀態，確認完成就會把連結傳給你，請稍候一下喔～";

// Meta caps a button title at 20 characters.
export const DEFAULT_FOLLOW_PROMPT_BUTTON = "我已追蹤";
