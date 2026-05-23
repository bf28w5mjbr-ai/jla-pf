export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";
import { getSmsAuthPublicFlags, getRegistrationEmailOtpConfigWarnings } from "@/lib/smsHoldPolicy";

export async function GET(request: NextRequest) {
  const deepCheck = request.nextUrl.searchParams.get("deep") === "1";
  const authSecretOk =
    typeof process.env.AUTH_SECRET === "string" && process.env.AUTH_SECRET.length >= 32;
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
  const hasStripeSecret = Boolean(process.env.STRIPE_SECRET_KEY);
  const hasSupabaseUrl = Boolean(getSupabaseUrl());
  const hasSupabasePublishableKey = Boolean(getSupabasePublishableKey());
  const hasFirebaseServiceAccount = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const hasCronSecret = process.env.NODE_ENV === "production" ? Boolean(process.env.CRON_SECRET) : true;
  const required = {
    authSecret: authSecretOk,
    databaseUrl: hasDatabaseUrl,
  };
  const integrations = {
    stripeSecret: hasStripeSecret,
    supabaseUrl: hasSupabaseUrl,
    supabasePublishableKey: hasSupabasePublishableKey,
    firebaseServiceAccount: hasFirebaseServiceAccount,
    cronSecret: hasCronSecret,
  };
  const registrationWarnings = getRegistrationEmailOtpConfigWarnings();
  if (!required.authSecret || !required.databaseUrl) {
    return NextResponse.json(
      {
        ok: false,
        mode: "ready",
        error: "required_env_missing",
        required,
        integrations,
        warnings: registrationWarnings,
        ...getSmsAuthPublicFlags(),
      },
      { status: 503 }
    );
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    let stripeApi = "skipped";
    if (deepCheck && hasStripeSecret) {
      try {
        const { stripe } = await import("@/lib/stripe");
        await stripe.balance.retrieve();
        stripeApi = "ok";
      } catch {
        stripeApi = "failed";
      }
    }
    const deep = {
      stripeApi,
    };
    const ok = stripeApi !== "failed" && registrationWarnings.length === 0;
    return NextResponse.json(
      {
        ok,
        mode: "ready",
        required,
        integrations,
        warnings: registrationWarnings,
        deep,
        ...getSmsAuthPublicFlags(),
      },
      { status: ok ? 200 : 503 }
    );
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json(
      {
        ok: false,
        mode: "ready",
        error: "database_connection_failed",
        required,
        integrations,
        warnings: registrationWarnings,
        ...getSmsAuthPublicFlags(),
      },
      { status: 503 }
    );
  }
}
