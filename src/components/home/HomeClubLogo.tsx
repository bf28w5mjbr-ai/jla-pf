"use client";

import { useState } from "react";
import { publicUploadDisplaySrc } from "@/lib/publicUploadSupabaseInfer";

type Props = {
  name: string;
  logoUrl: string | null;
  className?: string;
};

export function HomeClubLogo({ name, logoUrl, className }: Props) {
  const [broken, setBroken] = useState(false);
  const src = publicUploadDisplaySrc(logoUrl);
  const chars = [...name.trim()];
  const initialsLabel = chars.length >= 2 ? `${chars[0]}${chars[1]}` : (chars[0] ?? "?");

  if (!src || broken) {
    return (
      <div
        className={
          className ??
          "flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/40 text-sm font-semibold text-muted-foreground"
        }
        aria-hidden
      >
        {initialsLabel}
      </div>
    );
  }

  return (
    <div
      className={
        className ??
        "relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-muted/30 shadow-sm"
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 任意オリジンのクラブロゴ */}
      <img
        src={src}
        alt=""
        className="h-full w-full object-contain p-1.5"
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
      />
    </div>
  );
}
