/**
 * Defaults for the first message of a two-step (follow-gated) campaign, used
 * when the campaign leaves its own text empty. The same message is re-sent to
 * someone who taps without following yet.
 *
 * A tap on the button is re-checked for up to about a minute before the
 * person is asked again (Instagram is slow to report a fresh follow), and the
 * chat stays silent meanwhile, so the message says so up front.
 */
export const DEFAULT_FOLLOW_PROMPT_MESSAGE =
  "謝謝你的留言！領取連結前，請先追蹤我的帳號喔～\n\n確認追蹤後按下按鈕，需等候系統確認\n完成後就會發連結給你了，請稍等一下喔";

// Meta caps a button title at 20 characters.
export const DEFAULT_FOLLOW_PROMPT_BUTTON = "我已經追蹤囉！";
