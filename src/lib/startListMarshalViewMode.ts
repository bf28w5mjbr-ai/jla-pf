import type { StartListMarshalViewMode } from "@/lib/startListEventTypes";

export type ResolveMarshalViewModeOptions = {
  showMarshalOps: boolean;
  showResultOps: boolean;
};

/** localStorage や旧 "normal" を含む生値を当日運用の表示モードに正規化する */
export function resolveMarshalViewMode(
  mode: StartListMarshalViewMode | "normal" | undefined | null,
  options: ResolveMarshalViewModeOptions
): StartListMarshalViewMode {
  const { showMarshalOps, showResultOps } = options;

  let resolved: StartListMarshalViewMode;
  if (mode === "result") {
    resolved = "result";
  } else if (mode === "marshal" || mode === "normal") {
    resolved = "marshal";
  } else {
    resolved = showMarshalOps ? "marshal" : showResultOps ? "result" : "marshal";
  }

  if (resolved === "marshal" && !showMarshalOps && showResultOps) {
    return "result";
  }
  if (resolved === "result" && !showResultOps && showMarshalOps) {
    return "marshal";
  }
  return resolved;
}

/** localStorage から読んだ未知の文字列を保存可能なモードに寄せる（未対応は捨てる） */
export function coerceStoredMarshalViewMode(
  v: unknown
): StartListMarshalViewMode | "normal" | null {
  if (v === "marshal" || v === "result" || v === "normal") return v;
  return null;
}
