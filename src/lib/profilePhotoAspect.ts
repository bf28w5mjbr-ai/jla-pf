import {
  profilePhotoHeroTextPlacement,
  profilePhotoObjectPosition,
  type ProfilePhotoSubjectRegion,
} from "./profilePhotoSubject";

export type ProfilePhotoOrientation = "portrait" | "square" | "landscape";
export type ViewportOrientation = "portrait" | "landscape";
export type HeroTemplate = "overlay";

/** width / height がこれ未満なら縦長 */
export const PROFILE_PHOTO_PORTRAIT_MAX_RATIO = 0.85;

/** width / height がこれより大きければ横長 */
export const PROFILE_PHOTO_LANDSCAPE_MIN_RATIO = 1.15;

/** 縦写真のデフォルト比率（3:4） */
export const PROFILE_PHOTO_DEFAULT_PORTRAIT_RATIO = 0.75;

export type ProfilePhotoHeroLayout = {
  template: HeroTemplate;
  containerClassName: string;
  imageClassName: string;
  /** ヒーロー帯の高さ計算用（width / height） */
  bandAspectRatio: number;
  objectPosition: string;
  contentClassName: string;
  scrimClassName: string;
};

function resolveAspectRatio(
  aspectRatio: number | null | undefined,
  fallback: number
): number {
  return aspectRatio != null && Number.isFinite(aspectRatio) && aspectRatio > 0
    ? aspectRatio
    : fallback;
}

export function profilePhotoOrientationFromRatio(
  ratio: number
): ProfilePhotoOrientation {
  if (!Number.isFinite(ratio) || ratio <= 0) return "square";
  if (ratio < PROFILE_PHOTO_PORTRAIT_MAX_RATIO) return "portrait";
  if (ratio > PROFILE_PHOTO_LANDSCAPE_MIN_RATIO) return "landscape";
  return "square";
}

/** @deprecated 全形式で overlay テンプレを使用 */
export function profilePhotoHeroTemplate(
  _photo: ProfilePhotoOrientation
): HeroTemplate {
  return "overlay";
}

function defaultBandAspectRatio(photo: ProfilePhotoOrientation): number {
  if (photo === "portrait") return PROFILE_PHOTO_DEFAULT_PORTRAIT_RATIO;
  if (photo === "landscape") return 1.6;
  return 1;
}

/** ヒーロー帯: height = clamp(32vh, 100vw / ratio, 60vh) */
export function profilePhotoHeroBandHeightStyle(
  aspectRatio: number
): { height: string } {
  const ratio = resolveAspectRatio(aspectRatio, 1);
  return { height: `clamp(32vh, calc(100vw / ${ratio}), 60vh)` };
}

/**
 * 被写体領域を考慮した統一オーバーレイレイアウト。
 * アスペクト比に関わらず写真の上にテキストを載せ、被写体と重ならない位置を選ぶ。
 */
export function profilePhotoHeroLayout(
  photo: ProfilePhotoOrientation,
  _viewport: ViewportOrientation,
  aspectRatio?: number | null,
  subject?: ProfilePhotoSubjectRegion | null
): ProfilePhotoHeroLayout {
  const bandAspectRatio = resolveAspectRatio(
    aspectRatio,
    defaultBandAspectRatio(photo)
  );
  const placement = profilePhotoHeroTextPlacement(subject ?? null);

  return {
    template: "overlay",
    containerClassName: "w-full",
    imageClassName: "h-full w-full object-cover",
    bandAspectRatio,
    objectPosition: subject ? placement.objectPosition : profilePhotoObjectPosition(null),
    contentClassName: placement.contentClassName,
    scrimClassName: placement.scrimClassName,
  };
}
