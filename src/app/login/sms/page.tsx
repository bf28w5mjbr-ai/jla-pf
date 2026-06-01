import { redirectIfAuthenticated } from "@/lib/auth";
import { SMSLoginPageClient } from "./SMSLoginPageClient";

export default async function SMSLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const sp = await searchParams;
  await redirectIfAuthenticated(sp.redirect);

  return <SMSLoginPageClient />;
}
