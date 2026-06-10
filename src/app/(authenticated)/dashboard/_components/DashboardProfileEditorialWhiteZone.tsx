"use client";

import type { ReactNode } from "react";
import type { ProfilePhotoOrientation } from "@/lib/profilePhotoAspect";
import { useViewportOrientation } from "./useViewportOrientation";

export function DashboardProfileEditorialWhiteZone({
  photoOrientation,
  meta,
  credits,
}: {
  photoOrientation: ProfilePhotoOrientation;
  meta: ReactNode;
  credits: ReactNode;
}) {
  const viewportOrientation = useViewportOrientation();
  const isSplit =
    photoOrientation === "portrait" && viewportOrientation === "portrait";

  return (
    <>
      {!isSplit ? meta : null}
      {credits}
    </>
  );
}
