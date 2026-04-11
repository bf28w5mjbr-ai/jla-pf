import { Capacitor } from "@capacitor/core";
import { PushNotifications, type Token } from "@capacitor/push-notifications";

type DeviceTokenPayload = {
  token: string;
  platform: string;
};

async function registerTokenOnServer(payload: DeviceTokenPayload) {
  await fetch("/api/device-tokens", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    credentials: "include",
  });
}

async function registerToken(token: Token) {
  await registerTokenOnServer({
    token: token.value,
    platform: Capacitor.getPlatform(),
  });
}

export async function initPushNotifications() {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") {
    return;
  }

  await PushNotifications.register();

  PushNotifications.removeAllListeners();

  PushNotifications.addListener("registration", (token) => {
    void registerToken(token);
  });

  PushNotifications.addListener("registrationError", (error) => {
    console.error("Push registration error:", error);
  });

  PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
    const linkUrl = event.notification.data?.linkUrl as string | undefined;
    if (linkUrl) {
      window.location.assign(linkUrl);
    }
  });
}
