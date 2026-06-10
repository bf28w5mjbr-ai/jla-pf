import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

function SettingsClientBlockSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-lg border border-border/60 bg-muted/25", className)} aria-hidden />
  );
}

export const NfcTagManagerLazy = dynamic(() => import("@/components/NfcTagManager"), {
  loading: () => <SettingsClientBlockSkeleton className="h-28" />,
});
