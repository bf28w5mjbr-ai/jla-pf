import { describe, expect, it } from "vitest";
import {
  isPendingDirectOrganizationLogoPath,
  logoUploadExtensionFromFileName,
} from "./organizationLogoUploadServer";

describe("isPendingDirectOrganizationLogoPath", () => {
  it("accepts expected keys", () => {
    const orgId = "cmnw_org_test";
    const path = `organizations/${orgId}-1710000000000-a1b2c3d4.png`;
    expect(isPendingDirectOrganizationLogoPath(path, orgId)).toBe(true);
  });

  it("rejects other org ids", () => {
    const path = "organizations/other-1710000000000-a1b2c3d4.png";
    expect(isPendingDirectOrganizationLogoPath(path, "cmnw_org_test")).toBe(false);
  });
});

describe("logoUploadExtensionFromFileName", () => {
  it("maps jpeg to jpg", () => {
    expect(logoUploadExtensionFromFileName("x.jpeg")).toBe("jpg");
  });

  it("defaults unknown to png", () => {
    expect(logoUploadExtensionFromFileName("x.exe")).toBe("png");
  });
});
