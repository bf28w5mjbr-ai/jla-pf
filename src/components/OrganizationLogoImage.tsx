"use client";

import { useState, useCallback, useSyncExternalStore } from "react";
import type { CSSProperties, SyntheticEvent } from "react";
import { cn } from "@/lib/utils";
import { organizationNameInitials } from "@/lib/organizationLogo";
import {
  analyzeLogoFromHtmlImage,
  fallbackLogoAnalysisForUrl,
  type LogoImageAnalysis,
} from "@/lib/logoImageAnalysis";

type Props = {
  logoUrl: string | null | undefined;
  organizationName: string;
  /** 枠のサイズ・形（例: h-11 w-11 shrink-0） */
  frameClassName?: string;
  className?: string;
  /**
   * 画像を解析して背景色・枠をロゴに合わせる（透過は枠なし寄り）。
   * 外部URLで CORS が通らない場合は URL からの推測にフォールバック。
   */
  adaptive?: boolean;
};

function hueFromName(organizationName: string): number {
  let h = 0;
  for (let i = 0; i < organizationName.length; i++) {
    h = (h * 31 + organizationName.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

function initialsBackground(organizationName: string, prefersDark: boolean): CSSProperties {
  const hue = hueFromName(organizationName);
  if (prefersDark) {
    return {
      background: `linear-gradient(135deg, hsl(${hue}, 24%, 22%), hsl(${hue}, 20%, 16%))`,
    };
  }
  return {
    background: `linear-gradient(135deg, hsl(${hue}, 42%, 93%), hsl(${hue}, 34%, 87%))`,
  };
}

function subscribePrefersDark(callback: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getPrefersDarkSnapshot() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getServerPrefersDarkSnapshot() {
  return false;
}

/**
 * 団体ロゴ。透過・主色に応じて背景と枠を調整。任意オリジン URL は img + CORS 試行。
 */
export function OrganizationLogoImage({
  logoUrl,
  organizationName,
  frameClassName = "h-11 w-11 shrink-0",
  className,
  adaptive = true,
}: Props) {
  const [failed, setFailed] = useState(false);
  const [analysis, setAnalysis] = useState<LogoImageAnalysis | null>(null);
  const initials = organizationNameInitials(organizationName);
  const prefersDark = useSyncExternalStore(
    subscribePrefersDark,
    getPrefersDarkSnapshot,
    getServerPrefersDarkSnapshot,
  );

  const url = logoUrl?.trim() ?? "";

  const probeAndAnalyze = useCallback(
    (displayImg: HTMLImageElement) => {
      if (!adaptive) return;
      const probe = new Image();
      probe.crossOrigin = "anonymous";
      probe.onload = () => {
        const result = analyzeLogoFromHtmlImage(probe);
        if (result) {
          setAnalysis(result);
          return;
        }
        setAnalysis(fallbackLogoAnalysisForUrl(url));
      };
      probe.onerror = () => {
        setAnalysis(fallbackLogoAnalysisForUrl(url));
      };
      probe.src = displayImg.currentSrc || displayImg.src;
    },
    [adaptive, url],
  );

  const handleDisplayLoad = useCallback(
    (e: SyntheticEvent<HTMLImageElement>) => {
      probeAndAnalyze(e.currentTarget);
    },
    [probeAndAnalyze],
  );

  const frameBase = cn("overflow-hidden rounded-lg", frameClassName, className);

  if (!url || failed) {
    return (
      <div
        className={cn(
          frameBase,
          "flex items-center justify-center border border-dashed border-border/60 text-xs font-semibold text-muted-foreground",
          "ring-1 ring-inset ring-black/[0.04] dark:border-border dark:ring-white/10",
        )}
        style={initialsBackground(organizationName, prefersDark)}
        aria-label={`${organizationName}（ロゴなし）`}
      >
        <span className="select-none">{initials}</span>
      </div>
    );
  }

  const frameless = adaptive && analysis?.prefersFrameless;
  const tint =
    adaptive && analysis
      ? prefersDark
        ? analysis.softTintDark
        : analysis.softTintLight
      : null;
  const insetPadding =
    adaptive && analysis
      ? analysis.insetPadding
      : "clamp(0.35rem, 8%, 0.75rem)";

  return (
    <div
      className={cn(
        frameBase,
        frameless
          ? "border-0 shadow-sm shadow-black/[0.06] dark:shadow-black/30"
          : "border border-border/70 bg-muted/20 dark:bg-muted/15",
      )}
      style={
        tint
          ? { background: tint }
          : frameless
            ? { backgroundColor: "transparent" }
            : undefined
      }
    >
      <div
        className="box-border flex h-full w-full items-center justify-center"
        style={{ padding: insetPadding }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- 任意オリジンのロゴURLを許可するため */}
        <img
          src={url}
          alt={`${organizationName}のロゴ`}
          className="max-h-full max-w-full object-contain"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={handleDisplayLoad}
          onError={() => setFailed(true)}
        />
      </div>
    </div>
  );
}
