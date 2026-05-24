import { describe, expect, it } from "vitest";
import {
  calendarDayKeyInTokyo,
  dayKeyFromInstant,
  enumerateCompetitionScheduleDays,
  firstCompetitionScheduleDayKey,
} from "@/lib/competitionScheduleDays";

describe("competitionScheduleDays", () => {
  it("enumerateCompetitionScheduleDays lists inclusive JST days", () => {
    const days = enumerateCompetitionScheduleDays(
      new Date("2026-05-01T00:00:00+09:00"),
      new Date("2026-05-02T23:59:59+09:00")
    );
    expect(days.map((d) => d.key)).toEqual(["2026-05-01", "2026-05-02"]);
    expect(days[0]?.label).toMatch(/5\/1/);
  });

  it("firstCompetitionScheduleDayKey returns first day", () => {
    expect(
      firstCompetitionScheduleDayKey(
        new Date("2026-05-01T00:00:00+09:00"),
        new Date("2026-05-03T00:00:00+09:00")
      )
    ).toBe("2026-05-01");
  });

  it("dayKeyFromInstant uses JST calendar day", () => {
    expect(dayKeyFromInstant(new Date("2026-05-01T20:00:00+09:00"))).toBe("2026-05-01");
    expect(dayKeyFromInstant(new Date("2026-04-30T15:00:00Z"))).toBe("2026-05-01");
  });

  it("calendarDayKeyInTokyo formats YYYY-MM-DD", () => {
    expect(calendarDayKeyInTokyo(new Date("2026-01-05T12:00:00+09:00"))).toBe("2026-01-05");
  });
});
