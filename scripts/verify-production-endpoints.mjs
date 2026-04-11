#!/usr/bin/env node
/**
 * 本番（または指定 BASE）の公開エンドポイントを検証する。
 *
 *   BASE_URL=https://bluvium.jp node scripts/verify-production-endpoints.mjs
 *
 * SMS / Stripe Checkout / Passkey はブラウザ・実機が必要なため、このスクリプトでは検証しない。
 */

const base = (process.env.BASE_URL || process.env.E2E_BASE_URL || "https://bluvium.jp").replace(
  /\/$/,
  ""
);

async function fetchJson(path) {
  const url = `${base}${path}`;
  const res = await fetch(url, { redirect: "follow" });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${path}: HTTP ${res.status}, body is not JSON (first 120 chars): ${text.slice(0, 120)}`);
  }
  return { url, res, json };
}

function fail(msg) {
  console.error(`\x1b[31mFAIL\x1b[0m ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`\x1b[32mOK\x1b[0m   ${msg}`);
}

async function main() {
  console.log(`Base: ${base}\n`);

  // /api/health/live
  {
    const r = await fetch(`${base}/api/health/live`);
    if (!r.ok) fail(`/api/health/live HTTP ${r.status}`);
    else ok(`/api/health/live HTTP ${r.status}`);
  }

  // /api/health — DB は一時失敗しうるので 2 回試行
  let health;
  for (let i = 0; i < 2; i++) {
    const { json } = await fetchJson("/api/health");
    health = json;
    if (json.ok !== false || json.error !== "database_connection_failed") break;
    if (i === 0) await new Promise((r) => setTimeout(r, 1500));
  }

  if (health.required?.authSecret !== true || health.required?.databaseUrl !== true) {
    fail(`/api/health required: ${JSON.stringify(health.required)}`);
  } else ok("/api/health required.authSecret & databaseUrl");

  const int = health.integrations || {};
  const need = ["stripeSecret", "supabaseUrl", "supabasePublishableKey", "firebaseServiceAccount", "cronSecret"];
  for (const k of need) {
    if (int[k] !== true) fail(`/api/health integrations.${k} = ${int[k]} (expected true)`);
  }
  ok("/api/health all integrations true");

  if (health.ok === false && health.error === "database_connection_failed") {
    fail("/api/health ok=false (database_connection_failed) — Supabase 接続 or プールを確認");
  }
  if (health.ok !== true) {
    fail(`/api/health ok=${health.ok} (expected true when DB is up)`);
  } else ok("/api/health ok=true");

  // deep + Stripe
  {
    const { json } = await fetchJson("/api/health?deep=1");
    if (json.deep?.stripeApi !== "ok") {
      fail(`/api/health?deep=1 deep.stripeApi = ${json.deep?.stripeApi} (expected ok)`);
    } else ok("/api/health?deep=1 Stripe API ok");
  }

  // Cron: シークレットなしは 401
  {
    const r = await fetch(`${base}/api/cron/ensure-start-list-snapshots`);
    if (r.status !== 401) {
      fail(`/api/cron/ensure-start-list-snapshots without Bearer: HTTP ${r.status} (expected 401)`);
    } else ok("/api/cron/ensure-start-list-snapshots rejects unauthenticated (401)");
  }

  console.log(`
--- 手動で確認すること（このスクリプトでは不可） ---
  [ ] SMS: 運用方針に応じて SKIP_SMS を入れないこと、または SKIP_SMS + REGISTRATION_EMAIL_OTP + RESEND_API_KEY で登録メール OTP を確認すること。SMSログインは SKIP_SMS 時に無効。
  [ ] Stripe: Dashboard の Webhook が ${base}/api/webhooks/stripe であること。テスト決済でイベントが届くこと。
  [ ] Passkey: ${base} で登録・ログインできること（WEBAUTHN_RP_ID / ORIGIN がこのホストと一致）。
  [ ] Firebase: 実機プッシュが届くこと。
  [ ] Vercel Cron: ${base}/api/cron/ensure-start-list-snapshots に Authorization: Bearer <CRON_SECRET> が付いていること（ダッシュボードの Cron 設定）。
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
