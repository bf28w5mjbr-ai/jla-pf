import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { initPushNotifications } from "@/lib/capacitor/pushNotifications";

let initialized = false;

export async function initCapacitorApp() {
  if (initialized || !Capacitor.isNativePlatform()) {
    return;
  }

  initialized = true;

  await StatusBar.setStyle({ style: Style.Default });
  await SplashScreen.hide();

  App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      void App.exitApp();
    }
  });

  await initPushNotifications();
}
