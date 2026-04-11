import { cn } from "@/lib/utils";

const variantClass = {
  /** ランディング上部など */
  hero: "text-[1.75rem] font-semibold tracking-[-0.045em] sm:text-[2rem]",
  /** サイドバー先頭 */
  nav: "text-[1.35rem] font-semibold tracking-[-0.04em] sm:text-[1.45rem]",
  /** ログイン等のコンパクトなブランド行 */
  inline: "text-lg font-semibold tracking-[-0.035em] sm:text-xl",
  /** モバイル上部バーなど狭い領域 */
  compact: "text-base font-semibold tracking-[-0.03em] sm:text-[1.05rem]",
} as const;

export type BluviumWordmarkVariant = keyof typeof variantClass;

type Props = {
  variant?: BluviumWordmarkVariant;
  className?: string;
};

/**
 * Bluvium のタイポグラフィ・ワードマーク（画像ロゴの代わりに統一利用）
 */
export function BluviumWordmark({ variant = "nav", className }: Props) {
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap bg-gradient-to-br from-orange-600 via-orange-700 to-orange-950 bg-clip-text text-transparent",
        "dark:from-orange-200 dark:via-orange-100 dark:to-amber-50",
        variantClass[variant],
        className
      )}
    >
      Bluvium
    </span>
  );
}
