import { describe, expect, it } from "vitest";
import {
  PREVIEW_EMAIL_ALLOWLIST_UNSET,
  PREVIEW_EMAIL_BLOCKED,
  PREVIEW_EMAIL_RECIPIENT_NOT_ALLOWED,
} from "./previewEmailAllowlist";
import {
  mapPreviewEmailBlockedApiFailure,
  mapRegistrationEmailSendError,
} from "./mapEmailSendApiFailure";

describe("mapRegistrationEmailSendError", () => {
  it("maps allowlist unset to 503 PREVIEW_EMAIL_BLOCKED", () => {
    const mapped = mapRegistrationEmailSendError(
      new Error(
        `${PREVIEW_EMAIL_ALLOWLIST_UNSET}: Preview では PREVIEW_EMAIL_ALLOWED_RECIPIENTS の設定が必要です`
      )
    );
    expect(mapped?.status).toBe(503);
    expect(mapped?.body.code).toBe(PREVIEW_EMAIL_BLOCKED);
    expect(mapped?.body.error).toContain("Preview");
    expect(JSON.stringify(mapped)).not.toMatch(/@/);
    expect(JSON.stringify(mapped)).not.toMatch(/re_/);
    expect(JSON.stringify(mapped)).not.toMatch(/\d{6}/);
  });

  it("maps recipient not allowed to 503 PREVIEW_EMAIL_BLOCKED", () => {
    const mapped = mapRegistrationEmailSendError(
      new Error(
        `${PREVIEW_EMAIL_RECIPIENT_NOT_ALLOWED}: Preview では許可リスト外への送信はできません`
      )
    );
    expect(mapped?.status).toBe(503);
    expect(mapped?.body.code).toBe(PREVIEW_EMAIL_BLOCKED);
    // 内部理由や宛先はレスポンスに出さない
    expect(mapped?.body.error).not.toContain(PREVIEW_EMAIL_RECIPIENT_NOT_ALLOWED);
    expect(mapped?.body.error).not.toContain("example.com");
  });

  it("keeps Resend HTTP failures as 503 with existing codes", () => {
    const mapped = mapRegistrationEmailSendError(
      new Error("Resend が失敗しました (429): rate limit")
    );
    expect(mapped?.status).toBe(503);
    expect(mapped?.body.code).toBe("RESEND_SEND_FAILED");
    expect(mapped?.body.error).toContain("レート制限");
  });

  it("maps missing API key without leaking secrets", () => {
    const mapped = mapRegistrationEmailSendError(
      new Error("RESEND_API_KEY_REQUIRED")
    );
    expect(mapped?.status).toBe(503);
    expect(mapped?.body.code).toBeUndefined();
    expect(JSON.stringify(mapped)).not.toContain("REQUIRED");
  });

  it("returns null for unrelated errors", () => {
    expect(mapRegistrationEmailSendError(new Error("db down"))).toBeNull();
    expect(mapRegistrationEmailSendError("string")).toBeNull();
  });
});

describe("mapPreviewEmailBlockedApiFailure", () => {
  it("maps preview blocks to 503 with PREVIEW_EMAIL_BLOCKED", () => {
    const mapped = mapPreviewEmailBlockedApiFailure(
      new Error(`${PREVIEW_EMAIL_ALLOWLIST_UNSET}: x`),
      "再設定用メールの送信に失敗しました。"
    );
    expect(mapped).toEqual({
      status: 503,
      body: {
        code: PREVIEW_EMAIL_BLOCKED,
        error: "再設定用メールの送信に失敗しました。",
      },
    });
  });

  it("ignores non-preview errors", () => {
    expect(
      mapPreviewEmailBlockedApiFailure(
        new Error("Resend が失敗しました (500): x"),
        "fail"
      )
    ).toBeNull();
  });
});
