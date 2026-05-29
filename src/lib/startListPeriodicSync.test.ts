import { describe, expect, it } from "vitest";
import {
  DEFAULT_START_LIST_PERIODIC_SYNC_INTERVAL_SEC,
  DEFAULT_START_LIST_PUBLIC_REFRESH_INTERVAL_SEC,
  resolveStartListPeriodicSyncIntervalSec,
  resolveStartListPublicRefreshIntervalSec,
} from "@/lib/startListPeriodicSync";

describe("resolveStartListPeriodicSyncIntervalSec", () => {
  it("未指定時は既定 30 秒", () => {
    expect(resolveStartListPeriodicSyncIntervalSec()).toBe(
      DEFAULT_START_LIST_PERIODIC_SYNC_INTERVAL_SEC
    );
  });

  it("15 未満は 15 に clamp", () => {
    expect(resolveStartListPeriodicSyncIntervalSec(5)).toBe(15);
  });

  it("120 超は 120 に clamp", () => {
    expect(resolveStartListPeriodicSyncIntervalSec(999)).toBe(120);
  });
});

describe("resolveStartListPublicRefreshIntervalSec", () => {
  it("未指定時は既定 90 秒", () => {
    expect(resolveStartListPublicRefreshIntervalSec()).toBe(
      DEFAULT_START_LIST_PUBLIC_REFRESH_INTERVAL_SEC
    );
  });

  it("15 未満は 15 に clamp", () => {
    expect(resolveStartListPublicRefreshIntervalSec(5)).toBe(15);
  });
});
