import { describe, expect, it, vi } from "vitest";
import { createMarshalHeatFetchRunner } from "./marshalHeatFetchRunner";

describe("createMarshalHeatFetchRunner", () => {
  it("allows the first fetch to start", () => {
    const runner = createMarshalHeatFetchRunner();
    expect(runner.tryStart()).toBe(true);
  });

  it("queues a retry when a second fetch is requested while in flight", () => {
    const runner = createMarshalHeatFetchRunner();
    const onRetry = vi.fn();

    expect(runner.tryStart()).toBe(true);
    expect(runner.tryStart()).toBe(false);

    runner.finish(onRetry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not retry when no overlapping fetch was requested", () => {
    const runner = createMarshalHeatFetchRunner();
    const onRetry = vi.fn();

    expect(runner.tryStart()).toBe(true);
    runner.finish(onRetry);

    expect(onRetry).not.toHaveBeenCalled();
  });

  it("runs only one retry after multiple overlapping requests", () => {
    const runner = createMarshalHeatFetchRunner();
    const onRetry = vi.fn();

    expect(runner.tryStart()).toBe(true);
    expect(runner.tryStart()).toBe(false);
    expect(runner.tryStart()).toBe(false);

    runner.finish(onRetry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("allows a new fetch after finish without pending retry", () => {
    const runner = createMarshalHeatFetchRunner();

    expect(runner.tryStart()).toBe(true);
    runner.finish(() => {});
    expect(runner.tryStart()).toBe(true);
  });

  it("retry callback can start a follow-up fetch", () => {
    const runner = createMarshalHeatFetchRunner();
    const calls: string[] = [];

    expect(runner.tryStart()).toBe(true);
    expect(runner.tryStart()).toBe(false);

    runner.finish(() => {
      calls.push("retry");
      expect(runner.tryStart()).toBe(true);
      calls.push("started");
    });

    expect(calls).toEqual(["retry", "started"]);
  });
});
