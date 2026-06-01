const MOBILE_APP_BUNDLE_ID = "com.bluvium.app";
const MOBILE_APP_HOST = "bluvium.jp";

function resolveAppleTeamId(): string | null {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  return teamId || null;
}

function resolveAndroidReleaseSha256(): string | null {
  const sha = process.env.ANDROID_RELEASE_SHA256?.trim();
  return sha || null;
}

export function buildAppleAppSiteAssociation() {
  const teamId = resolveAppleTeamId();
  const appId = teamId ? `${teamId}.${MOBILE_APP_BUNDLE_ID}` : null;

  return {
    webcredentials: appId ? { apps: [appId] } : { apps: [] as string[] },
    applinks: {
      apps: [] as string[],
      details: appId
        ? [
            {
              appID: appId,
              paths: ["*"],
            },
          ]
        : [],
    },
  };
}

export function buildAssetLinksJson() {
  const sha256 = resolveAndroidReleaseSha256();
  const fingerprints = sha256 ? [sha256] : ["REPLACE_WITH_RELEASE_KEY_SHA256"];

  return [
    {
      relation: ["delegate_permission/common.get_login_creds"],
      target: {
        namespace: "android_app",
        package_name: MOBILE_APP_BUNDLE_ID,
        sha256_cert_fingerprints: fingerprints,
      },
    },
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: MOBILE_APP_BUNDLE_ID,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

export function mobileAppLinkHost(): string {
  return MOBILE_APP_HOST;
}
