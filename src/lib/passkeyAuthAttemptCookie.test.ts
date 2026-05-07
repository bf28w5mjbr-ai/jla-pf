import { describe, expect, it } from "vitest";
import {
  consumePasskeyAuthAttempt,
  issuePasskeyAuthAttempt,
} from "@/lib/passkeyAuthAttemptCookie";

describe("passkeyAuthAttemptCookie", () => {
  it("issues attemptId and consumes matching challenge", () => {
    const now = 1_700_000_000_000;
    const issued = issuePasskeyAuthAttempt(undefined, "challenge-a", now);

    expect(issued.attemptId).toBeTruthy();
    expect(issued.cookieValue).toContain("%5B");

    const consumed = consumePasskeyAuthAttempt(issued.cookieValue, issued.attemptId, now + 1_000);
    expect(consumed.challenge).toBe("challenge-a");
    expect(consumed.cookieValue).toBeNull();
  });

  it("keeps multiple attempts and consumes only target", () => {
    const baseNow = 1_700_000_000_000;
    const first = issuePasskeyAuthAttempt(undefined, "challenge-1", baseNow);
    const second = issuePasskeyAuthAttempt(first.cookieValue, "challenge-2", baseNow + 1_000);

    const consumeFirst = consumePasskeyAuthAttempt(
      second.cookieValue,
      first.attemptId,
      baseNow + 2_000
    );
    expect(consumeFirst.challenge).toBe("challenge-1");
    expect(consumeFirst.cookieValue).toBeTruthy();

    const consumeSecond = consumePasskeyAuthAttempt(
      consumeFirst.cookieValue ?? undefined,
      second.attemptId,
      baseNow + 3_000
    );
    expect(consumeSecond.challenge).toBe("challenge-2");
    expect(consumeSecond.cookieValue).toBeNull();
  });

  it("prunes expired attempts and returns null when missing", () => {
    const baseNow = 1_700_000_000_000;
    const issued = issuePasskeyAuthAttempt(undefined, "challenge-expire", baseNow);
    const consumed = consumePasskeyAuthAttempt(
      issued.cookieValue,
      issued.attemptId,
      baseNow + 5 * 60 * 1000 + 1
    );
    expect(consumed.challenge).toBeNull();
    expect(consumed.cookieValue).toBeNull();
  });
});
