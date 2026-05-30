import { describe, expect, it } from "vitest";
import {
  resolveDayOpsUnlockExpiresAt,
  resolveDayOpsUnlockMaxAgeSec,
} from "@/lib/dayOpsUnlockCookie";

describe("dayOpsUnlockCookie", () => {
  it("expires after endDate calendar day plus one buffer day (UTC)", () => {
    const endDate = new Date("2026-05-30T00:00:00.000Z");
    expect(resolveDayOpsUnlockExpiresAt(endDate).toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("returns remaining seconds until competition unlock window ends", () => {
    const endDate = new Date("2026-05-30T00:00:00.000Z");
    const now = new Date("2026-05-28T12:00:00.000Z");
    const sec = resolveDayOpsUnlockMaxAgeSec(endDate, now);
    expect(sec).toBe(Math.floor((Date.parse("2026-06-01T00:00:00.000Z") - now.getTime()) / 1000));
  });

  it("returns 0 when unlock window has passed", () => {
    const endDate = new Date("2026-05-30T00:00:00.000Z");
    const now = new Date("2026-06-01T00:00:00.000Z");
    expect(resolveDayOpsUnlockMaxAgeSec(endDate, now)).toBe(0);
  });
});
