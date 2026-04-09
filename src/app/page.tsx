import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HomeLanding } from "@/components/HomeLanding";
import { verifySession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Bluvium",
  description:
    "会員・所属・資格・大会エントリー・決済を一気通貫で扱うプラットフォーム",
};

export default async function Home() {
  const jar = await cookies();
  const token = jar.get("session")?.value;
  const sess = token ? await verifySession(token) : null;

  if (sess?.userId) {
    redirect("/dashboard");
  }

  return <HomeLanding />;
}
