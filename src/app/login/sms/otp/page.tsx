import { redirectIfAuthenticated } from "@/lib/auth";
import { OTPLoginPageClient } from "./OTPLoginPageClient";

export default async function SMSLoginOTPPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; sessionId?: string }>;
}) {
  const sp = await searchParams;
  await redirectIfAuthenticated(sp.redirect);

  return <OTPLoginPageClient />;
}
