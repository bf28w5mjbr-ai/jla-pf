import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

function DashboardClientBlockSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-lg border border-border/60 bg-muted/25", className)} aria-hidden />
  );
}

export const DashboardProfilePhotoLazy = dynamic(
  () => import("@/components/DashboardProfilePhoto"),
  { loading: () => <DashboardClientBlockSkeleton className="h-9 w-14 rounded-lg" /> }
);

export const EntryWithdrawRequestButtonLazy = dynamic(
  () => import("@/components/EntryWithdrawRequestButton"),
  { loading: () => <DashboardClientBlockSkeleton className="h-9 w-28" /> }
);
