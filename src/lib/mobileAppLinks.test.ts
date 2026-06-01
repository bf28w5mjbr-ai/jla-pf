import { afterEach, describe, expect, it } from "vitest";
import { buildAppleAppSiteAssociation, buildAssetLinksJson } from "@/lib/mobileAppLinks";

describe("mobileAppLinks", () => {
  afterEach(() => {
    delete process.env.APPLE_TEAM_ID;
    delete process.env.ANDROID_RELEASE_SHA256;
  });

  it("APPLE_TEAM_ID があるとき webcredentials を含む AASA を生成", () => {
    process.env.APPLE_TEAM_ID = "ABCDE12345";
    expect(buildAppleAppSiteAssociation()).toEqual({
      webcredentials: { apps: ["ABCDE12345.com.bluvium.app"] },
      applinks: {
        apps: [],
        details: [{ appID: "ABCDE12345.com.bluvium.app", paths: ["*"] }],
      },
    });
  });

  it("ANDROID_RELEASE_SHA256 があるとき assetlinks に反映", () => {
    process.env.ANDROID_RELEASE_SHA256 = "AA:BB:CC";
    const links = buildAssetLinksJson();
    expect(links).toHaveLength(2);
    expect(links[0]?.relation).toContain("delegate_permission/common.get_login_creds");
    expect(links[0]?.target.sha256_cert_fingerprints).toEqual(["AA:BB:CC"]);
    expect(links[1]?.relation).toContain("delegate_permission/common.handle_all_urls");
  });
});
