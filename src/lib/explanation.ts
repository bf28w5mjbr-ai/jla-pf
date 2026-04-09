import { cn } from "@/lib/utils";

/**
 * 操作性グラデーション（説明量・視認性の段階）
 *
 * - guided: 初回・条件が多い・誤操作コストが高い（読みやすさ優先）
 * - balanced: 通常のフォーム・一覧操作
 * - compact: 繰り返し操作・形式だけの補足・ラベルと重複しやすい箇所
 */
export type ExplanationDensity = "guided" | "balanced" | "compact";

/** 画面タイトル直下の本文（マージンなし。親が mt を付与） */
export function pageIntroTextClass(density: ExplanationDensity): string {
  return cn(
    density === "guided" && "text-sm leading-relaxed text-muted-foreground",
    density === "balanced" && "text-sm leading-relaxed text-muted-foreground/95",
    density === "compact" && "text-xs leading-relaxed text-muted-foreground/90"
  );
}

/** 画面内ブロックの見出し直下（RegisterForm 内の「必須情報」など） */
export function pageLeadClass(density: ExplanationDensity): string {
  return cn("mt-2", pageIntroTextClass(density));
}

/** フォームセクションのリード文 */
export function sectionLeadClass(density: ExplanationDensity): string {
  return cn(
    "mt-1",
    density === "guided" && "text-sm leading-relaxed text-muted-foreground",
    density === "balanced" && "text-xs leading-relaxed text-muted-foreground/95",
    density === "compact" && "text-[11px] leading-relaxed text-muted-foreground/85"
  );
}

/** ラベル直下の形式・制約の補足 */
export function fieldHintClass(density: ExplanationDensity): string {
  return cn(
    "mt-1",
    density === "guided" && "text-xs leading-relaxed text-muted-foreground",
    density === "balanced" && "text-xs leading-relaxed text-muted-foreground",
    density === "compact" && "text-[11px] leading-relaxed text-muted-foreground/80"
  );
}
