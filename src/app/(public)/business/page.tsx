import type { Metadata } from "next";
import Link from "next/link";
import { BluviumWordmark } from "@/components/BluviumWordmark";
import { authShellMainClassName } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { getPublicAppUrl } from "@/lib/appBaseUrl";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const base = getPublicAppUrl().replace(/\/$/, "");
  const description =
    "Bluvium は会員・所属・資格・大会エントリー・決済を扱うクラウドサービスです。日本ライフセービング協会向けの業務支援を目的としています。";
  return {
    title: "事業者情報",
    description,
    openGraph: {
      title: "事業者情報 | Bluvium",
      description,
      url: `${base}/business`,
      siteName: "Bluvium",
      locale: "ja_JP",
      type: "website",
    },
  };
}

export default function BusinessInfoPage() {
  /** 任意。本番で設定すると公開メールリンクを表示（事業者確認用の連絡先として利用可） */
  const contactEmail = process.env.NEXT_PUBLIC_BUSINESS_CONTACT_EMAIL?.trim();

  return (
    <div className={cn(authShellMainClassName, "flex flex-col")}>
      <article className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
        <div className="mb-8 flex justify-center">
          <BluviumWordmark variant="hero" />
        </div>

        <h1 className="text-balance text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          事業者情報・サービス概要
        </h1>
        <p className="mx-auto mt-4 max-w-prose text-pretty text-center text-sm leading-relaxed text-muted-foreground sm:text-base">
          当サービスは、ライフセービング競技に関わる会員管理、所属、資格、大会エントリー、および関連する決済をオンラインで行うためのプラットフォームです。
        </p>

        <section className="mt-10 space-y-3 rounded-2xl border border-border/90 bg-card/80 p-6 shadow-sm dark:border-border dark:bg-card/60">
          <h2 className="text-sm font-semibold text-foreground">提供する主な機能</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>ユーザー登録・認証、プロフィールおよび所属クラブの管理</li>
            <li>資格情報の登録・確認</li>
            <li>大会・種目へのエントリー、チーム申込、スタートリスト閲覧</li>
            <li>エントリー料等の決済（決済処理は Stripe を利用）</li>
          </ul>
        </section>

        <section className="mt-6 space-y-2 rounded-2xl border border-border/90 bg-card/80 p-6 shadow-sm dark:border-border dark:bg-card/60">
          <h2 className="text-sm font-semibold text-foreground">利用対象</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            日本ライフセービング協会およびその傘下のクラブ・大会主催者、並びに当該コミュニティに参加する競技者・関係者を想定しています。
          </p>
        </section>

        <section className="mt-6 space-y-3 rounded-2xl border border-border/90 bg-card/80 p-6 shadow-sm dark:border-border dark:bg-card/60">
          <h2 className="text-sm font-semibold text-foreground">お問い合わせ</h2>
          {contactEmail ? (
            <p className="text-sm text-muted-foreground">
              サービス全般に関するお問い合わせ:{" "}
              <a className="font-medium text-primary underline-offset-4 hover:underline" href={`mailto:${contactEmail}`}>
                {contactEmail}
              </a>
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              登録済みの方はログインのうえ、アプリ内の案内に従ってご連絡ください。法人・大会主催者の方は、契約・導入時にご案内した窓口までお願いいたします。
            </p>
          )}
        </section>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild variant="default" size="lg">
            <Link href="/">サービストップへ</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/login">ログイン</Link>
          </Button>
        </div>
      </article>
    </div>
  );
}
