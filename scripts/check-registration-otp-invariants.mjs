#!/usr/bin/env node
/**
 * 登録 OTP verify ルートの再発防止インバリアントを静的チェックする。
 * CI で実行し、グローバル Supabase 分岐への巻き戻し等を検出する。
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

const errors = [];

const verifyRoute = read("src/app/api/registration/verify/route.ts");

if (verifyRoute.includes("isSupabaseSmsOtpChannelActive(")) {
  errors.push(
    "registration/verify must not branch on isSupabaseSmsOtpChannelActive(); use verifyRegistrationOtp"
  );
}

if (!verifyRoute.includes("verifyRegistrationOtp(")) {
  errors.push("registration/verify must call verifyRegistrationOtp()");
}

if (!verifyRoute.includes("$transaction")) {
  errors.push("registration/verify must wrap user.create + session delete in $transaction");
}

if (
  !verifyRoute.includes("issueSessionCookieWithRecovery") &&
  !verifyRoute.includes("issueSessionCookie(")
) {
  errors.push("registration/verify must issue session cookie via issueSessionCookie helper");
}

const verifyRegistrationOtpSrc = read("src/lib/registration/verifyRegistrationOtp.ts");
if (!verifyRegistrationOtpSrc.includes('registrationOtpDelivery === "EMAIL"')) {
  errors.push("verifyRegistrationOtp must force stored OTP for EMAIL delivery");
}

if (errors.length > 0) {
  console.error("Registration OTP invariant check failed:\n");
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  process.exit(1);
}

console.log("Registration OTP invariant check passed.");
