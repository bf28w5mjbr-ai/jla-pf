import { describe, expect, it } from "vitest";
import { resolveRowHeatExpanded } from "@/components/StartListEventRoundSettingsRow";

describe("resolveRowHeatExpanded", () => {
  it("uses parent force while expand-all / collapse-all is active", () => {
    expect(resolveRowHeatExpanded(true, false)).toBe(true);
    expect(resolveRowHeatExpanded(false, true)).toBe(false);
  });

  it("keeps last forced value after parent releases without a row click", () => {
    let force: boolean | undefined = true;
    let uncontrolled = false;
    if (force !== undefined) uncontrolled = force;
    force = undefined;
    expect(resolveRowHeatExpanded(force, uncontrolled)).toBe(true);
  });

  it("closes the clicked row when parent releases after expand-all", () => {
    let force: boolean | undefined = true;
    let uncontrolled = false;
    if (force !== undefined) uncontrolled = force;
    const displayed = resolveRowHeatExpanded(force, uncontrolled);
    uncontrolled = !displayed;
    force = undefined;
    expect(resolveRowHeatExpanded(force, uncontrolled)).toBe(false);
  });
});
