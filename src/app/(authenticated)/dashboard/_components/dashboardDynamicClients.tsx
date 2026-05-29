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
