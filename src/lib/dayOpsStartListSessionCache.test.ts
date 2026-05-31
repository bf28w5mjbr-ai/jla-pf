import { describe, expect, it, beforeEach } from "vitest";
import type { HeatMarshalHeatRow } from "@/components/HeatMarshalLanePanel";
import {
  clearDayOpsStartListSessionCacheForTests,
  getMarshalSessionCache,
  getResultCaptureSessionCache,
  invalidateDayOpsStartListSessionCacheForEvent,
  invalidateDayOpsStartListSessionCacheForRound,
  invalidateMarshalSessionCacheForEvent,
  invalidateResultCaptureSessionCacheForEvent,
  invalidateResultCaptureSessionCacheForRound,
  setMarshalSessionCache,
  setResultCaptureSessionCache,
} from "@/lib/dayOpsStartListSessionCache";

const key = {
  competitionId: "comp1",
  eventId: "ev1",
  round: "HEAT" as const,
};

describe("dayOpsStartListSessionCache", () => {
  beforeEach(() => {
    clearDayOpsStartListSessionCacheForTests();
  });

  it("stores and retrieves marshal cache", () => {
    const heats: HeatMarshalHeatRow[] = [
      { heatIndex: 1, callClosedAt: null, participants: [] },
    ];
    setMarshalSessionCache(key, { heats, hasParticipants: false });
    expect(getMarshalSessionCache(key)?.heats).toEqual(heats);
  });

  it("stores and retrieves result capture cache", () => {
    setResultCaptureSessionCache(key, {
      rows: [],
      locked: false,
      confirmedHeats: [1],
    });
    expect(getResultCaptureSessionCache(key)?.confirmedHeats).toEqual([1]);
  });

  it("invalidates by round", () => {
    setMarshalSessionCache(key, { heats: [], hasParticipants: false });
    setResultCaptureSessionCache(key, { rows: [], locked: false, confirmedHeats: [] });
    invalidateDayOpsStartListSessionCacheForRound(key);
    expect(getMarshalSessionCache(key)).toBeUndefined();
    expect(getResultCaptureSessionCache(key)).toBeUndefined();
  });

  it("invalidates by event prefix", () => {
    setMarshalSessionCache(key, { heats: [], hasParticipants: false });
    setMarshalSessionCache(
      { ...key, eventId: "ev2", round: "SEMI" },
      { heats: [], hasParticipants: false }
    );
    invalidateDayOpsStartListSessionCacheForEvent("comp1", "ev1");
    expect(getMarshalSessionCache(key)).toBeUndefined();
    expect(getMarshalSessionCache({ ...key, eventId: "ev2", round: "SEMI" })).toBeDefined();
  });

  it("invalidateResultCaptureSessionCacheForEvent keeps marshal cache", () => {
    setMarshalSessionCache(key, { heats: [], hasParticipants: false });
    setResultCaptureSessionCache(key, { rows: [], locked: false, confirmedHeats: [1] });
    invalidateResultCaptureSessionCacheForEvent("comp1", "ev1");
    expect(getMarshalSessionCache(key)).toBeDefined();
    expect(getResultCaptureSessionCache(key)).toBeUndefined();
  });

  it("invalidateMarshalSessionCacheForEvent keeps result capture cache", () => {
    setMarshalSessionCache(key, { heats: [], hasParticipants: false });
    setResultCaptureSessionCache(key, { rows: [], locked: false, confirmedHeats: [1] });
    invalidateMarshalSessionCacheForEvent("comp1", "ev1");
    expect(getMarshalSessionCache(key)).toBeUndefined();
    expect(getResultCaptureSessionCache(key)?.confirmedHeats).toEqual([1]);
  });

  it("invalidateResultCaptureSessionCacheForRound keeps marshal cache", () => {
    setMarshalSessionCache(key, { heats: [], hasParticipants: false });
    setResultCaptureSessionCache(key, { rows: [], locked: false, confirmedHeats: [] });
    invalidateResultCaptureSessionCacheForRound(key);
    expect(getMarshalSessionCache(key)).toBeDefined();
    expect(getResultCaptureSessionCache(key)).toBeUndefined();
  });
});
