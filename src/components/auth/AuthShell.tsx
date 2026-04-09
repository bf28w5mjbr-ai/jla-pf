import { ReactNode } from "react";
import Link from "next/link";
import type { ExplanationDensity } from "@/lib/explanation";
import { pageIntroTextClass } from "@/lib/explanation";
import { cn } from "@/lib/utils";

type MaxWidth = "md" | "lg" | "2xl";

const maxWidthClass: Record<MaxWidth, string> = {
  md: "max-w-md",
  lg: "max-w-lg",
  "2xl": "max-w-2xl",
};

/** 認証系ページの外枠（Suspense fallback などと共有） */
export const authShellMainClassName = cn(
  "relative min-h-screen overflow-hidden px-4 py-10 sm:py-14",
  "bg-background",
  "before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_85%_55%_at_50%_-15%,color-mix(in_oklab,var(--ring)_14%,transparent),transparent_58%)]",
  "after:pointer-events-none after:absolute after:inset-0 after:bg-[radial-gradient(ellipse_70%_45%_at_100%_100%,color-mix(in_oklab,var(--muted-foreground)_7%,transparent),transparent_55%)]"
);

export function AuthShell({
  title,
  subtitle,
  subtitleDensity = "balanced",
  children,
  maxWidth = "md",
  className,
  showBrand = true,
}: {
  title: string;
  subtitle?: ReactNode;
  /** サブタイトルの説明量（長い初回フローは guided 推奨） */
  subtitleDensity?: ExplanationDensity;
  children: ReactNode;
  maxWidth?: MaxWidth;
  className?: string;
  /** 上部のロゴ・ブランド行 */
  showBrand?: boolean;
}) {
  return (
    <main className={cn(authShellMainClassName, className)}>
      <div className={cn("relative z-[1] mx-auto w-full", maxWidthClass[maxWidth])}>
        {showBrand && (
          <div className="mb-8 flex justify-center sm:mb-10">
            <Link
              href="/"
              className="group inline-flex items-center gap-3 rounded-2xl px-2 py-1.5 outline-none ring-offset-background transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-600 via-orange-700 to-orange-900 text-sm font-bold tracking-tight text-white shadow-md ring-1 ring-white/15 dark:from-orange-300 dark:via-orange-200 dark:to-orange-100 dark:text-orange-950 dark:ring-orange-950/10"
                aria-hidden
              >
                B
              </span>
              <span className="text-lg font-semibold tracking-tight text-foreground">
                Bluvium
              </span>
            </Link>
          </div>
        )}
        <header className="mb-8 text-center sm:mb-10">
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
            {title}
          </h1>
          {subtitle != null && subtitle !== "" && (
            <div className={cn("mt-2", pageIntroTextClass(subtitleDensity))}>{subtitle}</div>
          )}
        </header>
        {children}
      </div>
    </main>
  );
}

export function AuthPanel({
  children,
  className,
  padding = "default",
}: {
  children: ReactNode;
  className?: string;
  padding?: "default" | "compact";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/90 bg-card/95 shadow-[0_4px_32px_-8px_rgba(15,23,42,0.12),0_0_0_1px_rgba(15,23,42,0.04)] backdrop-blur-sm",
        "dark:border-border dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.04)]",
        padding === "default" ? "p-6 sm:p-8" : "p-5 sm:p-6",
        className
      )}
    >
      {children}
    </div>
  );
}
