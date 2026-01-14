import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

type Entry = {
  id: string; status: string; amountJPY: number; createdAt: string;
  competition: { title: string } | null;
};
type Payment = {
  id: string; status: string; amount: number; applicationFeeAmount: number; createdAt: string;
  competition: { title: string } | null;
};

async function fetchOverview(): Promise<{ entries: Entry[]; payments: Payment[] }> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_ORIGIN}/api/me/overview`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load");
  return res.json();
}

export default async function DashboardPage() {
  const token = cookies().get("session")?.value;
  const sess = token ? await verifySession(token) : null;
  if (!sess?.userId) redirect("/login");

  const userId = sess.userId;

  const [entries, payments] = await Promise.all([
    prisma.entry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { competition: { select: { title: true } } },
    }),
    prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { competition: { select: { title: true } } },
    }),
  ]);
  
  return (
    <main className="mx-auto max-w-4xl p-6 space-y-10">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <section>
        <h2 className="font-semibold mb-3">Entries</h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Competition</th>
                <th className="px-3 py-2 text-left">Amount</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Created</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="border-t">
                  <td className="px-3 py-2">{e.competition?.title ?? "-"}</td>
                  <td className="px-3 py-2">¥{e.amountJPY.toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full px-2 py-1 text-xs border">
                      {e.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{new Date(e.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr><td className="px-3 py-6 text-center text-gray-500" colSpan={4}>No entries</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-semibold mb-3">Payments</h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Competition</th>
                <th className="px-3 py-2 text-left">Amount / Fee</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Created</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} className="border-t">
                  <td className="px-3 py-2">{p.competition?.title ?? "-"}</td>
                  <td className="px-3 py-2">¥{p.amount.toLocaleString()} <span className="opacity-60 text-xs">(PF ¥{p.applicationFeeAmount?.toLocaleString?.() ?? 0})</span></td>
                  <td className="px-3 py-2">
                    <span className="rounded-full px-2 py-1 text-xs border">
                      {p.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{new Date(p.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr><td className="px-3 py-6 text-center text-gray-500" colSpan={4}>No payments</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
import { LogoutButton } from "@/app/components/LogoutButton";
<LogoutButton />