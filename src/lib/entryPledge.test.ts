import { describe, expect, it } from "vitest";
import { wrapMarkdownBoldAroundSelection } from "./entryPledge";

describe("wrapMarkdownBoldAroundSelection", () => {
  it("wraps non-empty selection in bold markers", () => {
    const r = wrapMarkdownBoldAroundSelection("hello world", 6, 11);
    expect(r.value).toBe("hello **world**");
    expect(r.caretStart).toBe(8);
    expect(r.caretEnd).toBe(13);
  });

  it("inserts empty bold pair when nothing selected", () => {
    const r = wrapMarkdownBoldAroundSelection("ab", 1, 1);
    expect(r.value).toBe("a****b");
    expect(r.caretStart).toBe(3);
    expect(r.caretEnd).toBe(3);
  });

  it("clamps out-of-range indices", () => {
    const r = wrapMarkdownBoldAroundSelection("x", 0, 99);
    expect(r.value).toBe("**x**");
  });
});
