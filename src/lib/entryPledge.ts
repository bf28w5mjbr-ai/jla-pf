/** 主催者が入力する誓約文の最大文字数（簡易 Markdown） */
export const ENTRY_PLEDGE_TEXT_MAX_CHARS = 2000;

export function normalizeEntryPledgeText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\r\n/g, "\n").trim();
}

export function assertEntryPledgeTextLength(text: string): void {
  if (text.length > ENTRY_PLEDGE_TEXT_MAX_CHARS) {
    throw new Error(`誓約文は${ENTRY_PLEDGE_TEXT_MAX_CHARS}文字以内にしてください`);
  }
}

/**
 * テキストエリアの選択範囲を Markdown の太字 `**` で囲む。
 * 選択が空のときは `**|**` を挿入し、カーソルを中に置く。
 */
export function wrapMarkdownBoldAroundSelection(
  value: string,
  start: number,
  end: number
): { value: string; caretStart: number; caretEnd: number } {
  const s = Math.max(0, Math.min(start, value.length));
  const e = Math.max(s, Math.min(end, value.length));
  const selected = value.slice(s, e);
  if (selected.length > 0) {
    const wrapped = `**${selected}**`;
    const next = value.slice(0, s) + wrapped + value.slice(e);
    return {
      value: next,
      caretStart: s + 2,
      caretEnd: s + 2 + selected.length,
    };
  }
  const next = value.slice(0, s) + "****" + value.slice(e);
  return {
    value: next,
    caretStart: s + 2,
    caretEnd: s + 2,
  };
}
