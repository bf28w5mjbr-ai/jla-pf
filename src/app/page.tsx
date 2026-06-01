import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { HomeLanding } from "@/components/HomeLanding";
import { PublicSiteShellWrapper } from "@/components/public/PublicSiteShellWrapper";
import { redirectIfAuthenticated } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Bluvium",
  description:
    "ライフセービングの大会情報・クラブ情報を閲覧でき、会員・所属・資格・エントリー・決済を一括で扱えるプラットフォーム",
};

const COVER_PAGE_URL = "https://bluvium.jp/";

function hostnameFromHeaders(headerList: Headers): string | null {
  const forwarded = headerList.get("x-forwarded-host");
  const raw =
    forwarded?.split(",")[0]?.trim() || headerList.get("host") || "";
  const host = raw.split(":")[0]?.toLowerCase();
  return host || null;
}

function isCoverPageHost(hostname: string | null): boolean {
  if (!hostname) return false;
  return (
    hostname === "bluvium.jp" ||
    hostname === "www.bluvium.jp" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1"
  );
}

export default async function Home() {
  const headerList = await headers();
  if (isCoverPageHost(hostnameFromHeaders(headerList))) {
    await redirectIfAuthenticated(null);
    return (
      <PublicSiteShellWrapper>
        <HomeLanding />
      </PublicSiteShellWrapper>
    );
  }
  redirect(COVER_PAGE_URL);
}
