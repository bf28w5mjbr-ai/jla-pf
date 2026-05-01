import { describe, expect, it } from "vitest";
import { formatDayOpsServerTiming } from "@/lib/dayOpsMetrics";

describe("formatDayOpsServerTiming", () => {
  it("formats Server-Timing header fragments", () => {
    expect(
      formatDayOpsServerTiming([
        { name: "db", durMs: 12.4 },
        { name: "build", durMs: 3.1 },
      ])
    ).toBe("db;dur=12, build;dur=3");
  });
});
