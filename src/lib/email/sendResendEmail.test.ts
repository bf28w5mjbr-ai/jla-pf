import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PREVIEW_EMAIL_ALLOWLIST_UNSET,
  PREVIEW_EMAIL_RECIPIENT_NOT_ALLOWED,
} from "./previewEmailAllowlist";
import { sendResendEmail } from "./sendResendEmail";

describe("sendResendEmail", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.RESEND_API_KEY = "re_test_key_not_real";
    delete process.env.VERCEL_ENV;
    delete process.env.PREVIEW_EMAIL_ALLOWED_RECIPIENTS;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
    delete process.env.VERCEL_ENV;
    delete process.env.PREVIEW_EMAIL_ALLOWED_RECIPIENTS;
  });

  it("sends in production without allowlist", async () => {
    process.env.VERCEL_ENV = "production";
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "msg_1" } }),
    });

    const result = await sendResendEmail({
      from: "Bluvium <noreply@example.com>",
      to: "user@example.com",
      subject: "hi",
      text: "body",
    });

    expect(result.id).toBe("msg_1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body)) as { to: string[] };
    expect(body.to).toEqual(["user@example.com"]);
  });

  it("blocks preview send when allowlist is unset (no fetch)", async () => {
    process.env.VERCEL_ENV = "preview";
    await expect(
      sendResendEmail({
        from: "Bluvium <noreply@example.com>",
        to: "user@example.com",
        subject: "hi",
        text: "body",
      })
    ).rejects.toThrow(PREVIEW_EMAIL_ALLOWLIST_UNSET);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks preview send to non-allowlisted recipient (no fetch)", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.PREVIEW_EMAIL_ALLOWED_RECIPIENTS = "ok@example.com";
    await expect(
      sendResendEmail({
        from: "Bluvium <noreply@example.com>",
        to: "other@example.com",
        subject: "hi",
        text: "body",
      })
    ).rejects.toThrow(PREVIEW_EMAIL_RECIPIENT_NOT_ALLOWED);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows preview send to allowlisted recipient", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.PREVIEW_EMAIL_ALLOWED_RECIPIENTS = "ok@example.com";
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "msg_ok" } }),
    });

    const result = await sendResendEmail({
      from: "Bluvium <noreply@example.com>",
      to: "ok@example.com",
      subject: "hi",
      text: "body",
    });
    expect(result.id).toBe("msg_ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks preview when bcc is outside allowlist", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.PREVIEW_EMAIL_ALLOWED_RECIPIENTS = "ok@example.com";
    await expect(
      sendResendEmail({
        from: "Bluvium <noreply@example.com>",
        to: "ok@example.com",
        bcc: ["secret@example.com"],
        subject: "hi",
        text: "body",
      })
    ).rejects.toThrow(PREVIEW_EMAIL_RECIPIENT_NOT_ALLOWED);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
