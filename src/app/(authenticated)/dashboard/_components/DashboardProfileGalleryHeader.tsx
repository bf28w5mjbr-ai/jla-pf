import type { ReactNode } from "react";

export function DashboardProfileGalleryHeader({
  identity,
  actions,
}: {
  identity: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">{identity}</div>
      <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
    </div>
  );
}
