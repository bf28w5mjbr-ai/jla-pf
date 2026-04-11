import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  sanitizeUploadBasename,
  validateAndNormalizeCompetitionRelationLogoBuffer,
  validateCompetitionAttachmentBuffer,
  validateOrganizationLogoBuffer,
  validateRasterImageBuffer,
  validateSvgSecurityBuffer,
} from "./uploadValidation";

/** 1x1 PNG（実ファイル相当のマジックバイト） */
const ONE_PX_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

describe("sanitizeUploadBasename", () => {
  it("strips extension and unsafe chars", () => {
    expect(sanitizeUploadBasename("foo/bar.exe")).toBe("foo_bar");
    expect(sanitizeUploadBasename("資料.pdf")).toBe("file");
    expect(sanitizeUploadBasename("report-2024_最終.pdf")).toBe("report-2024");
  });
});

describe("validateRasterImageBuffer", () => {
  it("accepts a minimal PNG", async () => {
    const r = await validateRasterImageBuffer(ONE_PX_PNG);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.mime).toBe("image/png");
      expect(r.value.ext).toBe("png");
    }
  });

  it("rejects empty and garbage", async () => {
    expect((await validateRasterImageBuffer(Buffer.alloc(0))).ok).toBe(false);
    expect((await validateRasterImageBuffer(Buffer.from("not an image"))).ok).toBe(false);
  });
});

describe("validateSvgSecurityBuffer", () => {
  it("accepts minimal svg", () => {
    const b = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', "utf8");
    expect(validateSvgSecurityBuffer(b).ok).toBe(true);
  });

  it("rejects script", () => {
    const b = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      "utf8"
    );
    expect(validateSvgSecurityBuffer(b).ok).toBe(false);
  });
});

describe("validateOrganizationLogoBuffer", () => {
  it("accepts png", async () => {
    const r = await validateOrganizationLogoBuffer(ONE_PX_PNG);
    expect(r.ok).toBe(true);
  });

  it("accepts safe svg", async () => {
    const b = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>', "utf8");
    const r = await validateOrganizationLogoBuffer(b);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.mime).toBe("image/svg+xml");
      expect(r.value.ext).toBe("svg");
    }
  });
});

describe("validateAndNormalizeCompetitionRelationLogoBuffer", () => {
  it("accepts png like validateRaster", async () => {
    const r = await validateAndNormalizeCompetitionRelationLogoBuffer(ONE_PX_PNG);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.mime).toBe("image/png");
      expect(r.value.buffer.equals(ONE_PX_PNG)).toBe(true);
    }
  });

  it("passes through jpeg from sharp", async () => {
    const jpeg = await sharp(ONE_PX_PNG).jpeg({ quality: 90 }).toBuffer();
    const r = await validateAndNormalizeCompetitionRelationLogoBuffer(jpeg);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.mime).toBe("image/jpeg");
      expect(r.value.buffer.equals(jpeg)).toBe(true);
    }
  });

  it("converts tiff to webp", async () => {
    const tiff = await sharp({
      create: { width: 2, height: 2, channels: 3, background: { r: 10, g: 200, b: 10 } },
    })
      .tiff()
      .toBuffer();
    const r = await validateAndNormalizeCompetitionRelationLogoBuffer(tiff);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.mime).toBe("image/webp");
      expect(r.value.ext).toBe("webp");
      const check = await import("file-type").then((m) => m.fileTypeFromBuffer(r.value.buffer));
      expect(check?.mime).toBe("image/webp");
    }
  });

  it("rejects garbage", async () => {
    const r = await validateAndNormalizeCompetitionRelationLogoBuffer(Buffer.from("not an image"));
    expect(r.ok).toBe(false);
  });
});

describe("validateCompetitionAttachmentBuffer", () => {
  it("accepts same png as attachment", async () => {
    const r = await validateCompetitionAttachmentBuffer(ONE_PX_PNG);
    expect(r.ok).toBe(true);
  });

  it("rejects exe-like header", async () => {
    const b = Buffer.from("MZ\x90\x00", "utf8");
    const padded = Buffer.concat([b, Buffer.alloc(512, 0)]);
    const r = await validateCompetitionAttachmentBuffer(padded);
    expect(r.ok).toBe(false);
  });
});
