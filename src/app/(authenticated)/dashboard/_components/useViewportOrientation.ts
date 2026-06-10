"use client";

import { useSyncExternalStore } from "react";
import type { ViewportOrientation } from "@/lib/profilePhotoAspect";

function getViewportOrientation(): ViewportOrientation {
  if (typeof window === "undefined") return "landscape";
  return window.matchMedia("(orientation: portrait)").matches ? "portrait" : "landscape";
}

function subscribeViewportOrientation(onStoreChange: () => void) {
  const media = window.matchMedia("(orientation: portrait)");
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

export function useViewportOrientation(): ViewportOrientation {
  return useSyncExternalStore(
    subscribeViewportOrientation,
    getViewportOrientation,
    () => "portrait"
  );
}
