"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props =
  | {
      /** コピーする絶対 URL */
      url: string;
      path?: never;
      label?: string;
      className?: string;
    }
  | {
      /** 先頭 `/` 付きのパス。コピー時に現在のオリジンを付与（例: `/competitions/xxx` → 公開大会ページの共有用） */
      path: string;
      url?: never;
      label?: string;
      className?: string;
    };

export default function CopyAbsoluteUrlButton({
  label = "公開URLをコピー",
  className,
  ...rest
}: Props) {
  const [copied, setCopied] = useState(false);

  function resolveCopyText(): string | null {
    if ("path" in rest && rest.path) {
      const p = rest.path.startsWith("/") ? rest.path : `/${rest.path}`;
      if (typeof window === "undefined") return null;
      return `${window.location.origin}${p}`;
    }
    if ("url" in rest && rest.url?.trim()) {
      return rest.url.trim();
    }
    return null;
  }

  async function handleCopy() {
    const text = resolveCopyText();
    if (!text) {
      toast.error("コピーするURLを組み立てられませんでした");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("クリップボードにコピーしました");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("コピーに失敗しました");
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("gap-1.5", className)}
      onClick={() => void handleCopy()}
    >
      {copied ? (
        <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      ) : (
        <Copy className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
      )}
      <span>{copied ? "コピー済み" : label}</span>
    </Button>
  );
}
