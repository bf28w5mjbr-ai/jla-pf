#!/usr/bin/env node

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const sessionCookie = process.env.SESSION_COOKIE;
const userId = process.env.TARGET_USER_ID;
const title = process.env.PUSH_TITLE || "Pushテスト";
const body = process.env.PUSH_BODY || "通知テスト本文です";
const linkUrl = process.env.PUSH_LINK_URL;

if (!sessionCookie || !userId) {
  console.error(
    "Missing env. Required: SESSION_COOKIE, TARGET_USER_ID. Optional: BASE_URL, PUSH_TITLE, PUSH_BODY, PUSH_LINK_URL"
  );
  process.exit(1);
}

const payload = {
  userId,
  title,
  body,
  ...(linkUrl ? { linkUrl } : {}),
};

const response = await fetch(`${baseUrl}/api/admin/notifications/test`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Cookie: `session=${sessionCookie}`,
  },
  body: JSON.stringify(payload),
});

const text = await response.text();
console.log(`status=${response.status}`);
console.log(text);

if (!response.ok) {
  process.exit(1);
}
