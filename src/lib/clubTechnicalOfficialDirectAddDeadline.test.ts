import { describe, expect, it } from "vitest";
import {
  clubDirectTechnicalOfficialAddDeadlineEndUtc,
  competitionStartCalendarYmdTokyo,
  isClubDirectTechnicalOfficialAddOpen,
} from "./clubTechnicalOfficialDirectAddDeadline";

describe("clubTechnicalOfficialDirectAddDeadline", () => {
  it("開催初日の JST 暦日を取る", () => {
    const start = new Date("2026-06-15T00:00:00+09:00");
    expect(competitionStartCalendarYmdTokyo(start)).toBe("2026-06-15");
  });

  it("締切は開催初日前日の 23:59:59.999 JST", () => {
    const start = new Date("2026-06-15T09:00:00+09:00");
    const end = clubDirectTechnicalOfficialAddDeadlineEndUtc(start);
    expect(end.toISOString()).toBe("2026-06-14T14:59:59.999Z");
  });

  it("締切前は追加可・締切後は不可", () => {
    const start = new Date("2026-06-15T12:00:00+09:00");
    expect(isClubDirectTechnicalOfficialAddOpen(start, new Date("2026-06-14T14:59:59.998Z"))).toBe(true);
    expect(isClubDirectTechnicalOfficialAddOpen(start, new Date("2026-06-14T14:59:59.999Z"))).toBe(true);
    expect(isClubDirectTechnicalOfficialAddOpen(start, new Date("2026-06-14T15:00:00.000Z"))).toBe(false);
  });
});
