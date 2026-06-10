/** 画像内の被写体領域（正規化座標 0〜1） */
export type ProfilePhotoSubjectRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type HeroTextAnchor = "top-start" | "top-end" | "bottom-start" | "bottom-end";

export type ProfilePhotoHeroPlacement = {
  anchor: HeroTextAnchor;
  objectPosition: string;
  contentClassName: string;
  /** Tailwind gradient 用（テキスト側から被写体へフェード） */
  scrimClassName: string;
};

const TEXT_ZONE_FRACTION = 0.52;

const ANCHOR_ZONES: Record<
  HeroTextAnchor,
  { x0: number; y0: number; x1: number; y1: number }
> = {
  "bottom-start": { x0: 0, y0: 1 - TEXT_ZONE_FRACTION, x1: TEXT_ZONE_FRACTION, y1: 1 },
  "bottom-end": { x0: 1 - TEXT_ZONE_FRACTION, y0: 1 - TEXT_ZONE_FRACTION, x1: 1, y1: 1 },
  "top-start": { x0: 0, y0: 0, x1: TEXT_ZONE_FRACTION, y1: TEXT_ZONE_FRACTION },
  "top-end": { x0: 1 - TEXT_ZONE_FRACTION, y0: 0, x1: 1, y1: TEXT_ZONE_FRACTION },
};

const ANCHOR_CONTENT_CLASS: Record<HeroTextAnchor, string> = {
  "bottom-start": "justify-end items-start text-left",
  "bottom-end": "justify-end items-end text-right",
  "top-start": "justify-start items-start text-left",
  "top-end": "justify-start items-end text-right",
};

const ANCHOR_SCRIM_CLASS: Record<HeroTextAnchor, string> = {
  "bottom-start": "bg-gradient-to-t from-black/50 via-black/20 to-transparent",
  "bottom-end": "bg-gradient-to-t from-black/50 via-black/20 to-transparent",
  "top-start": "bg-gradient-to-b from-black/50 via-black/20 to-transparent",
  "top-end": "bg-gradient-to-b from-black/50 via-black/20 to-transparent",
};

/** デフォルト被写体（顔写真想定の中央やや上） */
export const DEFAULT_PROFILE_PHOTO_SUBJECT: ProfilePhotoSubjectRegion = {
  x: 0.2,
  y: 0.1,
  width: 0.6,
  height: 0.65,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function normalizeProfilePhotoSubjectRegion(
  region: Partial<ProfilePhotoSubjectRegion> | null | undefined
): ProfilePhotoSubjectRegion | null {
  if (region == null) return null;
  const x = region.x;
  const y = region.y;
  const width = region.width;
  const height = region.height;
  if (
    x == null ||
    y == null ||
    width == null ||
    height == null ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  const w = clamp01(width);
  const h = clamp01(height);
  const nx = clamp01(x);
  const ny = clamp01(y);

  if (nx + w > 1 || ny + h > 1) return null;
  return { x: nx, y: ny, width: w, height: h };
}

export function profilePhotoSubjectFromFields(
  x: number | null | undefined,
  y: number | null | undefined,
  width: number | null | undefined,
  height: number | null | undefined
): ProfilePhotoSubjectRegion | null {
  if (x == null || y == null || width == null || height == null) return null;
  return normalizeProfilePhotoSubjectRegion({ x, y, width, height });
}

function overlapArea(
  a: { x0: number; y0: number; x1: number; y1: number },
  b: ProfilePhotoSubjectRegion
): number {
  const bx0 = b.x;
  const by0 = b.y;
  const bx1 = b.x + b.width;
  const by1 = b.y + b.height;
  const ix0 = Math.max(a.x0, bx0);
  const iy0 = Math.max(a.y0, by0);
  const ix1 = Math.min(a.x1, bx1);
  const iy1 = Math.min(a.y1, by1);
  if (ix1 <= ix0 || iy1 <= iy0) return 0;
  return (ix1 - ix0) * (iy1 - iy0);
}

export function profilePhotoObjectPosition(
  subject: ProfilePhotoSubjectRegion | null
): string {
  const region = subject ?? DEFAULT_PROFILE_PHOTO_SUBJECT;
  const cx = (region.x + region.width / 2) * 100;
  const cy = (region.y + region.height / 2) * 100;
  return `${cx.toFixed(1)}% ${cy.toFixed(1)}%`;
}

/**
 * 被写体領域と重ならないテキスト配置を選ぶ。
 * 被写体が不明なときは下端左（読み順に自然）を使う。
 */
export function profilePhotoHeroTextPlacement(
  subject: ProfilePhotoSubjectRegion | null
): ProfilePhotoHeroPlacement {
  const region = subject ?? DEFAULT_PROFILE_PHOTO_SUBJECT;
  const objectPosition = profilePhotoObjectPosition(subject);
  const subjectCx = region.x + region.width / 2;
  const subjectCy = region.y + region.height / 2;

  let bestAnchor: HeroTextAnchor = "bottom-start";
  let bestScore = -Infinity;

  for (const anchor of Object.keys(ANCHOR_ZONES) as HeroTextAnchor[]) {
    const zone = ANCHOR_ZONES[anchor];
    const overlap = overlapArea(zone, region);
    const zoneCx = (zone.x0 + zone.x1) / 2;
    const zoneCy = (zone.y0 + zone.y1) / 2;
    const distance = Math.hypot(subjectCx - zoneCx, subjectCy - zoneCy);
    const score = -overlap * 6 + distance * 1.2;
    if (score > bestScore) {
      bestScore = score;
      bestAnchor = anchor;
    }
  }

  return {
    anchor: bestAnchor,
    objectPosition,
    contentClassName: ANCHOR_CONTENT_CLASS[bestAnchor],
    scrimClassName: ANCHOR_SCRIM_CLASS[bestAnchor],
  };
}
