import { afterEach, describe, expect, it } from "vitest";
import {
  datetimeLocalInputValueToUtcIsoString,
  formatDateForDatetimeLocalInput,
} from "./datetimeLocal";

describe("datetimeLocalInputValueToUtcIsoString", () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("interprets datetime-local as host local time (Tokyo)", () => {
    process.env.TZ = "Asia/Tokyo";
    expect(datetimeLocalInputValueToUtcIsoString("2026-07-01T15:00")).toBe(
      "2026-07-01T06:00:00.000Z"
    );
  });

  it("returns null for empty or invalid", () => {
    process.env.TZ = "Asia/Tokyo";
    expect(datetimeLocalInputValueToUtcIsoString("")).toBe(null);
    expect(datetimeLocalInputValueToUtcIsoString("   ")).toBe(null);
    expect(datetimeLocalInputValueToUtcIsoString("not-a-date")).toBe(null);
  });

  it("round-trips with formatDateForDatetimeLocalInput in Tokyo", () => {
    process.env.TZ = "Asia/Tokyo";
    const utc = "2026-07-01T06:00:00.000Z";
    const local = formatDateForDatetimeLocalInput(new Date(utc));
    expect(local).toBe("2026-07-01T15:00");
    expect(datetimeLocalInputValueToUtcIsoString(local)).toBe(utc);
  });
});
