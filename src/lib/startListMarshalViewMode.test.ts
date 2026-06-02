import { describe, expect, it } from "vitest";
import {
  coerceStoredMarshalViewMode,
  resolveMarshalViewMode,
} from "@/lib/startListMarshalViewMode";

const both = { showMarshalOps: true, showResultOps: true };
const marshalOnly = { showMarshalOps: true, showResultOps: false };
const resultOnly = { showMarshalOps: false, showResultOps: true };

describe("resolveMarshalViewMode", () => {
  it("未設定かつ両方有効ならマーシャル", () => {
    expect(resolveMarshalViewMode(undefined, both)).toBe("marshal");
  });

  it('旧 "normal" はマーシャル', () => {
    expect(resolveMarshalViewMode("normal", both)).toBe("marshal");
  });

  it("マーシャル不可ならリザルトにフォールバック", () => {
    expect(resolveMarshalViewMode("marshal", resultOnly)).toBe("result");
  });

  it("リザルト不可ならマーシャルにフォールバック", () => {
    expect(resolveMarshalViewMode("result", marshalOnly)).toBe("marshal");
  });

  it("未設定でリザルトのみ有効ならリザルト", () => {
    expect(resolveMarshalViewMode(undefined, resultOnly)).toBe("result");
  });
});

describe("coerceStoredMarshalViewMode", () => {
  it("既知の値のみ受け付ける", () => {
    expect(coerceStoredMarshalViewMode("marshal")).toBe("marshal");
    expect(coerceStoredMarshalViewMode("normal")).toBe("normal");
    expect(coerceStoredMarshalViewMode("invalid")).toBeNull();
  });
});
