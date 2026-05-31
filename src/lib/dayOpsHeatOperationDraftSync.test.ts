import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isDayOpsMarshalDraftServerSyncEnabled,
  isDayOpsResultDraftServerSyncEnabled,
  parseServerMarshalDraftPayload,
  parseServerResultDraftPayload,
} from "./dayOpsHeatOperationDraftSync";

describe("isDayOpsResultDraftServerSyncEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to enabled", () => {
    vi.stubEnv("NEXT_PUBLIC_DAY_OPS_RESULT_DRAFT_SYNC", undefined);
    expect(isDayOpsResultDraftServerSyncEnabled()).toBe(true);
  });

  it("can be disabled with =0", () => {
    vi.stubEnv("NEXT_PUBLIC_DAY_OPS_RESULT_DRAFT_SYNC", "0");
    expect(isDayOpsResultDraftServerSyncEnabled()).toBe(false);
  });
});

describe("isDayOpsMarshalDraftServerSyncEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to enabled", () => {
    vi.stubEnv("NEXT_PUBLIC_DAY_OPS_MARSHAL_DRAFT_SYNC", undefined);
    expect(isDayOpsMarshalDraftServerSyncEnabled()).toBe(true);
  });

  it("can be disabled with =0", () => {
    vi.stubEnv("NEXT_PUBLIC_DAY_OPS_MARSHAL_DRAFT_SYNC", "0");
    expect(isDayOpsMarshalDraftServerSyncEnabled()).toBe(false);
  });
});

describe("parseServerMarshalDraftPayload", () => {
  it("parses entries including empty object", () => {
    expect(parseServerMarshalDraftPayload({ entries: {} })).toEqual({});
  });
});

describe("parseServerResultDraftPayload", () => {
  it("parses entries including empty object", () => {
    expect(parseServerResultDraftPayload({ entries: {} })).toEqual({});
  });
});
