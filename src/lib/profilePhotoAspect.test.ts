import { describe, expect, it } from "vitest";
import {
  PROFILE_PHOTO_DEFAULT_PORTRAIT_RATIO,
  profilePhotoHeroBandHeightStyle,
  profilePhotoHeroLayout,
  profilePhotoHeroTemplate,
  profilePhotoOrientationFromRatio,
} from "./profilePhotoAspect";

describe("profilePhotoOrientationFromRatio", () => {
  it("縦長を判定する", () => {
    expect(profilePhotoOrientationFromRatio(0.6)).toBe("portrait");
    expect(profilePhotoOrientationFromRatio(0.84)).toBe("portrait");
  });

  it("正方形付近を判定する", () => {
    expect(profilePhotoOrientationFromRatio(1)).toBe("square");
    expect(profilePhotoOrientationFromRatio(0.9)).toBe("square");
  });

  it("横長を判定する", () => {
    expect(profilePhotoOrientationFromRatio(1.6)).toBe("landscape");
    expect(profilePhotoOrientationFromRatio(1.2)).toBe("landscape");
  });
});

describe("profilePhotoHeroTemplate", () => {
  it("常に overlay", () => {
    expect(profilePhotoHeroTemplate("portrait")).toBe("overlay");
    expect(profilePhotoHeroTemplate("landscape")).toBe("overlay");
    expect(profilePhotoHeroTemplate("square")).toBe("overlay");
  });
});

describe("profilePhotoHeroBandHeightStyle", () => {
  it("アスペクト比に応じた clamp 高さを返す", () => {
    expect(profilePhotoHeroBandHeightStyle(1.6)).toEqual({
      height: "clamp(32vh, calc(100vw / 1.6), 60vh)",
    });
  });

  it("無効な比率は 1 にフォールバックする", () => {
    expect(profilePhotoHeroBandHeightStyle(0)).toEqual({
      height: "clamp(32vh, calc(100vw / 1), 60vh)",
    });
  });
});

describe("profilePhotoHeroLayout", () => {
  it("縦写真は overlay + 写真比率", () => {
    const layout = profilePhotoHeroLayout("portrait", "portrait", 0.6);
    expect(layout.template).toBe("overlay");
    expect(layout.bandAspectRatio).toBe(0.6);
    expect(layout.imageClassName).toContain("object-cover");
  });

  it("横写真も overlay", () => {
    const layout = profilePhotoHeroLayout("landscape", "portrait", 1.6);
    expect(layout.template).toBe("overlay");
    expect(layout.bandAspectRatio).toBe(1.6);
  });

  it("被写体が下端ならテキストは上寄り", () => {
    const layout = profilePhotoHeroLayout("portrait", "landscape", 0.75, {
      x: 0.2,
      y: 0.6,
      width: 0.6,
      height: 0.35,
    });
    expect(layout.contentClassName).toContain("justify-start");
  });

  it("正方形はデフォルト比率 1", () => {
    const layout = profilePhotoHeroLayout("square", "landscape");
    expect(layout.bandAspectRatio).toBe(1);
    expect(layout.template).toBe("overlay");
  });

  it("縦写真で比率不明時はデフォルト縦比率", () => {
    const layout = profilePhotoHeroLayout("portrait", "portrait");
    expect(layout.bandAspectRatio).toBe(PROFILE_PHOTO_DEFAULT_PORTRAIT_RATIO);
  });
});
