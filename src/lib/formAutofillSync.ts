import { flushSync } from "react-dom"

const skipInputTypes = new Set([
  "submit",
  "button",
  "reset",
  "hidden",
  "file",
  "image",
])

/**
 * ブラウザの自動入力が DOM だけ更新し React の state が古いままになる場合に、
 * 送信直前などで各コントロールへネイティブの input/change を発火して同期します。
 */
export function flushFormControlAutofill(form: HTMLFormElement): void {
  flushSync(() => {
    for (const el of form.elements) {
      if (el instanceof HTMLInputElement) {
        if (skipInputTypes.has(el.type)) continue
        el.dispatchEvent(new Event("input", { bubbles: true }))
        el.dispatchEvent(new Event("change", { bubbles: true }))
        continue
      }
      if (el instanceof HTMLTextAreaElement) {
        el.dispatchEvent(new Event("input", { bubbles: true }))
        el.dispatchEvent(new Event("change", { bubbles: true }))
        continue
      }
      if (el instanceof HTMLSelectElement) {
        el.dispatchEvent(new Event("change", { bubbles: true }))
      }
    }
  })
}
