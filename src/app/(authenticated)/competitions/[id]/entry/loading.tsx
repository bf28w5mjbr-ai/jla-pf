import { BluviumWordmark } from "@/components/BluviumWordmark";

export default function CompetitionEntryLoading() {
  return (
    <div className="app-page mx-auto flex min-h-[50vh] w-full max-w-5xl flex-col items-center justify-center gap-4 px-3 py-8 sm:px-5">
      <BluviumWordmark variant="inline" />
      <p className="text-center text-sm text-muted-foreground">
        エントリー情報を読み込んでいます…
        <br />
        <span className="mt-1 block text-xs opacity-80">
          決済確認のため外部サービスと通信する場合、数十秒かかることがあります。
        </span>
      </p>
    </div>
  );
}
