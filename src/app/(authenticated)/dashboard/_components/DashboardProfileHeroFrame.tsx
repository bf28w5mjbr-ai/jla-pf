"use client";

import type { CSSProperties, ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  profilePhotoHeroBandHeightStyle,
  profilePhotoHeroLayout,
  profilePhotoOrientationFromRatio,
  type HeroTemplate,
  type ProfilePhotoHeroLayout,
  type ProfilePhotoOrientation,
  type ViewportOrientation,
} from "@/lib/profilePhotoAspect";
import {
  profilePhotoSubjectFromFields,
  type ProfilePhotoSubjectRegion,
} from "@/lib/profilePhotoSubject";
import { cn } from "@/lib/utils";
import { useViewportOrientation } from "./useViewportOrientation";

type HeroOrientationContextValue = {
  photoOrientation: ProfilePhotoOrientation;
  viewportOrientation: ViewportOrientation;
  layout: ProfilePhotoHeroLayout;
  template: HeroTemplate;
  hasPhoto: boolean;
};

const HeroOrientationContext = createContext<HeroOrientationContextValue | null>(null);

export function useDashboardHeroOrientation() {
  const value = useContext(HeroOrientationContext);
  if (!value) {
    throw new Error("useDashboardHeroOrientation must be used within DashboardProfileHeroFrame");
  }
  return value;
}

function resolveOrientation(aspectRatio: number | null | undefined): ProfilePhotoOrientation | null {
  if (aspectRatio == null || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return null;
  }
  return profilePhotoOrientationFromRatio(aspectRatio);
}

export function DashboardProfileHeroFrame({
  photoUrl,
  aspectRatio,
  subjectX,
  subjectY,
  subjectWidth,
  subjectHeight,
  children,
}: {
  photoUrl: string | null | undefined;
  aspectRatio: number | null | undefined;
  subjectX?: number | null;
  subjectY?: number | null;
  subjectWidth?: number | null;
  subjectHeight?: number | null;
  children: ReactNode;
}) {
  const hasPhoto = Boolean(photoUrl?.trim());
  const viewportOrientation = useViewportOrientation();
  const initialSubject = profilePhotoSubjectFromFields(
    subjectX,
    subjectY,
    subjectWidth,
    subjectHeight
  );

  const [photoOrientation, setPhotoOrientation] = useState<ProfilePhotoOrientation | null>(() =>
    resolveOrientation(aspectRatio)
  );
  const [loadedAspectRatio, setLoadedAspectRatio] = useState<number | null>(() =>
    aspectRatio != null && Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : null
  );
  const loadedSubject = initialSubject;

  const handleImageLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      const img = event.currentTarget;
      if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
      const ratio = img.naturalWidth / img.naturalHeight;
      if (photoOrientation == null) {
        setPhotoOrientation(profilePhotoOrientationFromRatio(ratio));
      }
      if (loadedAspectRatio == null) {
        setLoadedAspectRatio(ratio);
      }
    },
    [photoOrientation, loadedAspectRatio]
  );

  const activePhotoOrientation = photoOrientation ?? "square";
  const activeAspectRatio =
    aspectRatio != null && Number.isFinite(aspectRatio) && aspectRatio > 0
      ? aspectRatio
      : loadedAspectRatio;
  const activeSubject = loadedSubject ?? initialSubject;

  const layout = useMemo(
    () =>
      profilePhotoHeroLayout(
        activePhotoOrientation,
        viewportOrientation,
        activeAspectRatio,
        activeSubject
      ),
    [activePhotoOrientation, viewportOrientation, activeAspectRatio, activeSubject]
  );

  const contextValue = useMemo(
    () => ({
      photoOrientation: activePhotoOrientation,
      viewportOrientation,
      layout,
      template: layout.template,
      hasPhoto,
    }),
    [activePhotoOrientation, viewportOrientation, layout, hasPhoto]
  );

  const bandStyle: CSSProperties | undefined = hasPhoto
    ? profilePhotoHeroBandHeightStyle(layout.bandAspectRatio)
    : undefined;

  const photoImage = hasPhoto ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={photoUrl!.trim()}
      alt=""
      className={layout.imageClassName}
      style={{ objectPosition: layout.objectPosition }}
      onLoad={handleImageLoad}
    />
  ) : null;

  return (
    <HeroOrientationContext.Provider value={contextValue}>
      <div
        className={cn(
          "relative flex flex-col",
          layout.containerClassName,
          !hasPhoto && "min-h-[50vh] bg-muted/30 sm:min-h-[32rem]"
        )}
        style={bandStyle}
      >
        {hasPhoto ? (
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            {photoImage}
          </div>
        ) : null}

        {hasPhoto ? (
          <div
            className={cn(
              "pointer-events-none absolute inset-0",
              layout.scrimClassName
            )}
            aria-hidden
          />
        ) : null}

        {children}
      </div>
    </HeroOrientationContext.Provider>
  );
}
