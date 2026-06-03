import { HomeSectionHeading } from "@/components/home/HomeSectionHeading";

export function HomeAboutSection() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-14 sm:max-w-4xl sm:py-20 lg:max-w-5xl">
      <HomeSectionHeading label="About" title="エントリーから当日まで、手続きをそろえる" />
      <div className="mt-8 space-y-6 text-pretty leading-relaxed text-muted-foreground">
        <p className="text-base sm:text-lg">
          クラブの所属、資格の確認、大会へのエントリー、決済まで。
          選手・クラブ・主催者がバラバラの手続きに振り回されないよう、必要な情報と操作をまとめています。
        </p>
        <p className="text-sm sm:text-base">
          開催予定の大会やクラブを公開で閲覧でき、ログイン後はエントリーや管理機能をそのまま使えます。
        </p>
        <p className="text-xs tracking-wide text-muted-foreground/90 sm:text-sm">
          Membership, qualifications, entries, and payments — in one place for lifesaving
          competitions.
        </p>
      </div>
    </section>
  );
}
