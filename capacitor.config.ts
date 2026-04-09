import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.bluvium.app",
  appName: "Bluvium",
  webDir: "out",
  server: {
    url: process.env.CAPACITOR_SERVER_URL ?? "https://app.bluvium.com",
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    SplashScreen: {
      launchAutoHide: true,
      androidScaleType: "CENTER_CROP",
    },
  },
};

export default config;
