import { describe, expect, it } from "vitest";
import {
  ORG_OPERATIONAL_STATUS,
  OrganizerLifecycleError,
  organizerLifecycleErrorStatus,
} from "./organizerLifecycle";

describe("organizerLifecycle", () => {
  it("ORG_OPERATIONAL_STATUS is APPROVED", () => {
    expect(ORG_OPERATIONAL_STATUS).toBe("APPROVED");
  });

  it("maps lifecycle error codes to HTTP status", () => {
    expect(organizerLifecycleErrorStatus("ORG_NOT_FOUND")).toBe(404);
    expect(organizerLifecycleErrorStatus("ORG_NOT_OPERATIONAL")).toBe(403);
    expect(organizerLifecycleErrorStatus("ORG_SUSPENDED")).toBe(403);
  });

  it("OrganizerLifecycleError carries code", () => {
    const err = new OrganizerLifecycleError("ORG_SUSPENDED", "停止中");
    expect(err.code).toBe("ORG_SUSPENDED");
    expect(err.message).toBe("停止中");
  });
});
