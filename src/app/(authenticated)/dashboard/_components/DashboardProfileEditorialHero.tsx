"use client";

import type { ReactNode } from "react";
import { useDashboardHeroOrientation } from "./DashboardProfileHeroFrame";
import { DashboardProfileHeroLayout } from "./DashboardProfileHeroLayout";

export function DashboardProfileEditorialHero({
  overlayActions,
  overlayIdentity,
  overlayCredits,
}: {
  overlayActions: ReactNode;
  overlayIdentity: ReactNode;
  overlayCredits: ReactNode;
  /** @deprecated split レイアウト廃止 */
  splitActions?: ReactNode;
  splitIdentity?: ReactNode;
  splitCredits?: ReactNode;
}) {
  const { layout } = useDashboardHeroOrientation();

  return (
    <DashboardProfileHeroLayout
      actions={overlayActions}
      identity={overlayIdentity}
      credits={overlayCredits}
      contentClassName={layout.contentClassName}
    />
  );
}
