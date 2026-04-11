import { afterEach, describe, expect, it } from "vitest";
import {
  COMPETITION_ADMIN_DATE_TIME_ZONE,
  datetimeLocalInputValueToUtcIsoString,
  formatDateForDatetimeLocalInput,
} from "./datetimeLocal";

describe("entry period (Asia/Tokyo) datetime-local", () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("formats UTC instant as JST wall clock regardless of host TZ", () => {
    process.env.TZ = "UTC";
    const utc = new Date("2026-07-01T06:00:00.000Z");
    expect(
      formatDateForDatetimeLocalInput(utc, {
        timeZone: COMPETITION_ADMIN_DATE_TIME_ZONE,
      })
    ).toBe("2026-07-01T15:00");
  });

  it("parses JST wall clock to UTC ISO regardless of host TZ", () => {
    process.env.TZ = "America/New_York";
    expect(
      datetimeLocalInputValueToUtcIsoString("2026-07-01T15:00", {
        timeZone: COMPETITION_ADMIN_DATE_TIME_ZONE,
      })
    ).toBe("2026-07-01T06:00:00.000Z");
  });

  it("returns null for empty or invalid", () => {
    expect(
      datetimeLocalInputValueToUtcIsoString("", {
        timeZone: COMPETITION_ADMIN_DATE_TIME_ZONE,
      })
    ).toBe(null);
    expect(
      datetimeLocalInputValueToUtcIsoString("not-a-date", {
        timeZone: COMPETITION_ADMIN_DATE_TIME_ZONE,
      })
    ).toBe(null);
  });

  it("round-trips format → parse in Tokyo mode with host TZ = UTC", () => {
    process.env.TZ = "UTC";
    const utc = "2026-07-01T06:00:00.000Z";
    const local = formatDateForDatetimeLocalInput(new Date(utc), {
      timeZone: COMPETITION_ADMIN_DATE_TIME_ZONE,
    });
    expect(local).toBe("2026-07-01T15:00");
    expect(
      datetimeLocalInputValueToUtcIsoString(local, {
        timeZone: COMPETITION_ADMIN_DATE_TIME_ZONE,
      })
    ).toBe(utc);
  });
});

describe("datetimeLocalInputValueToUtcIsoString (host local, no timeZone)", () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("uses local calendar components in Tokyo", () => {
    process.env.TZ = "Asia/Tokyo";
    expect(datetimeLocalInputValueToUtcIsoString("2026-07-01T15:00")).toBe(
      "2026-07-01T06:00:00.000Z"
    );
  });
});
