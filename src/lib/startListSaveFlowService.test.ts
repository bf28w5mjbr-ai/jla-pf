import { describe, expect, it } from "vitest";
import { resolveRoundSetupConfirmEventIds } from "./startListSaveFlowService";

describe("resolveRoundSetupConfirmEventIds", () => {
  it("requestedIds が有効なら eventId 集合でフィルタして返す", () => {
    const eventIds = new Set(["ev1", "ev2"]);
    const eventsById = new Map([
      ["ev1", { id: "ev1", startListHeatPlanConfirmedAt: null }],
      ["ev2", { id: "ev2", startListHeatPlanConfirmedAt: null }],
    ]);
    const resolved = resolveRoundSetupConfirmEventIds({
      requestedIds: ["ev2", "evX", 3],
      itemsEventIds: ["ev1"],
      allEventIds: eventIds,
      eventsById,
    });
    expect(resolved).toEqual(["ev2"]);
  });

  it("requestedIds 未指定時は未確定かつマーシャル締切前の items のみ返す", () => {
    const eventsById = new Map([
      ["ev1", { id: "ev1", startListHeatPlanConfirmedAt: null }],
      ["ev2", { id: "ev2", startListHeatPlanConfirmedAt: new Date() }],
      ["ev3", { id: "ev3", startListHeatPlanConfirmedAt: null }],
    ]);
    const resolved = resolveRoundSetupConfirmEventIds({
      requestedIds: undefined,
      itemsEventIds: ["ev1", "ev2", "ev3"],
      allEventIds: new Set(["ev1", "ev2", "ev3"]),
      eventsById,
      marshalCallClosedEventIds: new Set(["ev3"]),
    });
    expect(resolved).toEqual(["ev1"]);
  });
});
