import PaymentIntentResponseClient from "@/components/public/PaymentIntentResponseClient";

export const dynamic = "force-dynamic";

export default async function PaymentIntentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { id: competitionId } = await params;
  const sp = await searchParams;
  const raw = sp.token;
  const token = typeof raw === "string" ? raw.trim() : Array.isArray(raw) ? raw[0]?.trim() ?? "" : "";

  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center text-sm text-muted-foreground">
        リンクが不正です。メールに記載の URL をそのまま開いてください。
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <PaymentIntentResponseClient competitionId={competitionId} token={token} />
    </div>
  );
}
