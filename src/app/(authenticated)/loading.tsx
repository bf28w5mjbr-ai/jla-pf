import { BluviumWordmark } from "@/components/BluviumWordmark";

export default function AuthenticatedSegmentLoading() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4 pt-6">
      <BluviumWordmark variant="inline" />
      <p className="text-sm text-muted-foreground">読み込み中…</p>
    </div>
  );
}
