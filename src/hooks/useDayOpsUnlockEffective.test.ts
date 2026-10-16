import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { useDayOpsUnlockEffective } from "@/hooks/useDayOpsUnlockEffective";
import { markDayOpsUnlockedClient, clearDayOpsUnlockedClient } from "@/lib/dayOpsClientUnlock";

describe("useDayOpsUnlockEffective", () => {
  const competitionId = "comp-unlock-hook";

  beforeEach(() => {
    refresh.mockClear();
    clearDayOpsUnlockedClient(competitionId);
  });

  afterEach(() => {
    clearDayOpsUnlockedClient(competitionId);
  });

  it("returns server unlocked without client hint", () => {
    const { result } = renderHook(() => useDayOpsUnlockEffective(competitionId, true));
    expect(result.current).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("uses sessionStorage hint and refreshes when server is still locked", () => {
    markDayOpsUnlockedClient(competitionId);
    const { result } = renderHook(() => useDayOpsUnlockEffective(competitionId, false));
    expect(result.current).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes the storage listener on unmount", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useDayOpsUnlockEffective(competitionId, false));
    expect(add).toHaveBeenCalledWith("storage", expect.any(Function));
    const listener = add.mock.calls.find((c) => c[0] === "storage")?.[1];
    unmount();
    expect(remove).toHaveBeenCalledWith("storage", listener);
    add.mockRestore();
    remove.mockRestore();
  });

  it("does not leak a hint from another competition id", () => {
    markDayOpsUnlockedClient("other-comp");
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useDayOpsUnlockEffective(id, false),
      { initialProps: { id: competitionId } }
    );
    expect(result.current).toBe(false);
    rerender({ id: "other-comp" });
    expect(result.current).toBe(true);
    clearDayOpsUnlockedClient("other-comp");
  });
});
