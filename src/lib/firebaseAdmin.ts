function getServiceAccountFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
  } catch {
    return null;
  }
}

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

function getFirebaseApp() {
  const existing = getApps()[0];
  if (existing) {
    return existing;
  }

  const serviceAccount = getServiceAccountFromEnv();
  if (!serviceAccount) {
    return null;
  }

  return initializeApp({
    credential: cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key,
    }),
  });
}

export function getFirebaseMessaging() {
  const app = getFirebaseApp();
  if (!app) {
    return null;
  }
  return getMessaging(app);
}
