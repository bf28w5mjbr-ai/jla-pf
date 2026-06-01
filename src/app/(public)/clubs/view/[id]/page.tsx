import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PublicClubDetailPanel } from "@/components/public/PublicClubDirectory";
import { loadPublicClubDetail } from "@/lib/clubPublicPageLoader";
import { Button } from "@/components/ui/button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const club = await loadPublicClubDetail(id);
  if (!club) {
    return { title: "クラブ | Bluvium" };
  }
  return {
    title: `${club.name} | クラブ | Bluvium`,
    description: `${club.name}の基本情報`,
  };
}

export default async function PublicClubDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const club = await loadPublicClubDetail(id);
  if (!club) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-3 py-6 sm:px-5 sm:py-8 lg:px-6">
      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
        <Link href="/clubs">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          クラブ一覧に戻る
        </Link>
      </Button>
      <PublicClubDetailPanel club={club} />
    </div>
  );
}
