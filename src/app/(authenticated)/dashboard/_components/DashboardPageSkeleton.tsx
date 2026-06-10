import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

function DashboardClientBlockSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-lg border border-border/60 bg-muted/25", className)} aria-hidden />
  );
}

export const DashboardProfilePhotoLazy = dynamic(
  () => import("@/components/DashboardProfilePhoto"),
  { loading: () => <DashboardClientBlockSkeleton className="h-[88px] w-[88px] rounded-full" /> }
);

export const NfcTagManagerLazy = dynamic(() => import("@/components/NfcTagManager"), {
  loading: () => <DashboardClientBlockSkeleton className="h-20" />,
});

export const EntryWithdrawRequestButtonLazy = dynamic(
  () => import("@/components/EntryWithdrawRequestButton"),
  { loading: () => <DashboardClientBlockSkeleton className="h-9 w-28" /> }
);

/** プロフィール・資格ブロック（DashboardMain）用 */
export function DashboardMainSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true">
      <div className="h-64 animate-pulse rounded-xl border border-border/60 bg-muted/25 sm:h-72" />
    </div>
  );
}

/** エントリー・経歴ブロック（DashboardMainDeferred）用 */
export function DashboardDeferredSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true">
      <div className="h-96 animate-pulse rounded-xl border border-border/60 bg-muted/25" />
      <div className="h-64 animate-pulse rounded-xl border border-border/60 bg-muted/25" />
    </div>
  );
}

