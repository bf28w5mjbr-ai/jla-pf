import { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionCached } from "@/lib/auth";
import CreateOrganizationForm from "@/components/CreateOrganizationForm";
import { organizerYearlySubscriptionAmountYen } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "団体作成 | Bluvium",
  description: "新しい大会運営団体を作成します",
};

export default async function CreateOrganizationPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const session = await verifySessionCached(token);

  if (!session?.userId) {
    redirect("/login");
  }

  const onboardingFeeAmount = organizerYearlySubscriptionAmountYen();

  return <CreateOrganizationForm onboardingFeeAmount={onboardingFeeAmount} />;
}
