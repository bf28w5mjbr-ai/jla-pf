import { describe, expect, it } from "vitest";
import { parsePasskeyAuthOptionsBody } from "@/lib/passkeyAuthenticationOptions";

describe("parsePasskeyAuthOptionsBody", () => {
  it("空 body は discoverable モード", () => {
    expect(parsePasskeyAuthOptionsBody({})).toEqual({ ok: true, mode: "discoverable" });
  });

  it("email 未指定は discoverable モード", () => {
    expect(parsePasskeyAuthOptionsBody({ email: "   " })).toEqual({
      ok: true,
      mode: "discoverable",
    });
  });

  it("有効な email は legacy モード", () => {
    expect(parsePasskeyAuthOptionsBody({ email: "User@Example.com" })).toEqual({
      ok: true,
      mode: "legacy",
      email: "user@example.com",
    });
  });

  it("不正な email は 400 相当", () => {
    expect(parsePasskeyAuthOptionsBody({ email: "not-an-email" })).toEqual({
      ok: false,
      error: "メールアドレスの形式が正しくありません",
    });
  });
});
