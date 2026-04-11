import { describe, expect, it } from "vitest";
import { maskEmailForHint } from "./maskEmail";

describe("maskEmailForHint", () => {
  it("masks local part", () => {
    expect(maskEmailForHint("tanaka@example.com")).toBe("t***a@example.com");
  });

  it("handles single-char local", () => {
    expect(maskEmailForHint("a@b.co")).toBe("a***@b.co");
  });
});
