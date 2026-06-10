import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROFILE_PHOTO_SUBJECT,
  normalizeProfilePhotoSubjectRegion,
  profilePhotoHeroTextPlacement,
  profilePhotoObjectPosition,
} from "./profilePhotoSubject";

describe("normalizeProfilePhotoSubjectRegion", () => {
  it("有効な領域を受け入れる", () => {
    expect(normalizeProfilePhotoSubjectRegion({ x: 0.2, y: 0.1, width: 0.5, height: 0.6 })).toEqual({
      x: 0.2,
      y: 0.1,
      width: 0.5,
      height: 0.6,
    });
  });

  it("範囲外は null", () => {
    expect(normalizeProfilePhotoSubjectRegion({ x: 0.6, y: 0.1, width: 0.5, height: 0.6 })).toBeNull();
  });
});

describe("profilePhotoHeroTextPlacement", () => {
  it("被写体が下端中央ならテキストは上側に配置", () => {
    const placement = profilePhotoHeroTextPlacement({
      x: 0.25,
      y: 0.55,
      width: 0.5,
      height: 0.4,
    });
    expect(placement.anchor.startsWith("top")).toBe(true);
  });

  it("被写体が上端中央ならテキストは下側に配置", () => {
    const placement = profilePhotoHeroTextPlacement({
      x: 0.25,
      y: 0.05,
      width: 0.5,
      height: 0.4,
    });
    expect(placement.anchor.startsWith("bottom")).toBe(true);
  });

  it("被写体が右下ならテキストは左上に配置", () => {
    const placement = profilePhotoHeroTextPlacement({
      x: 0.55,
      y: 0.55,
      width: 0.4,
      height: 0.4,
    });
    expect(placement.anchor).toBe("top-start");
  });

  it("被写体不明時はデフォルト配置", () => {
    const placement = profilePhotoHeroTextPlacement(null);
    expect(placement.objectPosition).toBe(profilePhotoObjectPosition(DEFAULT_PROFILE_PHOTO_SUBJECT));
    expect(placement.anchor).toBeTruthy();
  });
});
