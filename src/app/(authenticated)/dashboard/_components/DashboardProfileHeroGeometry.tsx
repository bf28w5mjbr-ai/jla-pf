import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  variant?: "full" | "accent";
};

/**
 * ダッシュボードヒーロー用のオレンジ幾何学装飾（SVG・フラット）
 */
export function DashboardProfileHeroGeometry({ className, variant = "full" }: Props) {
  if (variant === "accent") {
    return (
      <div
        className={cn("pointer-events-none relative aspect-square w-36 select-none sm:w-40", className)}
        aria-hidden
      >
        <svg viewBox="0 0 144 144" className="h-full w-full" fill="none">
          <circle cx="96" cy="48" r="40" className="stroke-orange-500/30 dark:stroke-orange-400/25" strokeWidth="2" />
          <path
            d="M96 8 A40 40 0 0 1 136 48"
            className="stroke-orange-600/45 dark:stroke-orange-400/40"
            strokeWidth="14"
            strokeLinecap="butt"
          />
          <rect
            x="18"
            y="86"
            width="36"
            height="36"
            rx="1"
            className="fill-orange-500/35 dark:fill-orange-400/25"
            transform="rotate(-18 36 104)"
          />
        </svg>
      </div>
    );
  }

  return (
    <div
      className={cn("pointer-events-none relative aspect-square w-full max-w-[17.5rem] select-none lg:max-w-[19rem]", className)}
      aria-hidden
    >
      <svg viewBox="0 0 280 280" className="h-full w-full" fill="none">
        <circle
          cx="140"
          cy="140"
          r="96"
          className="stroke-orange-500/25 dark:stroke-orange-400/20"
          strokeWidth="2"
        />
        <path
          d="M140 44 A96 96 0 0 1 236 140"
          className="stroke-orange-600/40 dark:stroke-orange-400/35"
          strokeWidth="22"
          strokeLinecap="butt"
        />
        <circle cx="68" cy="196" r="32" className="fill-orange-500/30 dark:fill-orange-400/22" />
        <rect
          x="178"
          y="28"
          width="52"
          height="52"
          rx="2"
          className="fill-orange-600/45 dark:fill-orange-400/30"
          transform="rotate(15 204 54)"
        />
        <polygon
          points="44,72 88,72 66,32"
          className="fill-orange-500/25 dark:fill-orange-400/18"
        />
        <line
          x1="200"
          y1="200"
          x2="248"
          y2="248"
          className="stroke-orange-600/50 dark:stroke-orange-400/40"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle
          cx="210"
          cy="210"
          r="6"
          className="fill-orange-600/60 dark:fill-orange-400/50"
        />
      </svg>
    </div>
  );
}
