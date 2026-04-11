"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  url: string;
  label?: string;
  className?: string;
};

export default function CopyAbsoluteUrlButton({ url, label = "公開URLをコピー", className }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
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
