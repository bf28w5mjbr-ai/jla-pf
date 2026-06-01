import type { Metadata } from "next";
import { Users } from "lucide-react";
import { PublicClubDirectory } from "@/components/public/PublicClubDirectory";
import { loadPublicClubList } from "@/lib/clubPublicPageLoader";

export const metadata: Metadata = {
  title: "クラブ一覧 | Bluvium",
  description: "ライフセービングクラブの基本情報一覧",
};

export const revalidate = 60;

export default async function PublicClubsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const clubs = await loadPublicClubList(q ?? "");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-3 py-6 sm:space-y-8 sm:px-5 sm:py-8 lg:px-8">
      <header className="space-y-2 border-b border-border/80 pb-6">
        <div className="flex items-center gap-2 text-primary">
          <Users className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          <span className="text-sm font-medium">クラブ</span>
        </div>
        <h1 className="text-balance text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          クラブ一覧
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          運用中クラブの基本情報を閲覧できます。参加・所属の手続きはログイン後に行えます。
        </p>
      </header>
      <PublicClubDirectory initialClubs={clubs} />
    </div>
  );
}
