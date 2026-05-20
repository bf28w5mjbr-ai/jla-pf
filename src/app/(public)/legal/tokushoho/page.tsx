import type { Metadata } from "next";
import Link from "next/link";
import { BluviumWordmark } from "@/components/BluviumWordmark";
import { authShellMainClassName } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { getPublicAppUrl } from "@/lib/appBaseUrl";
import { organizerYearlySubscriptionAmountYen } from "@/lib/stripe";
import { cn } from "@/lib/utils";

function trimOrNull(v: string | undefined): string | null {
  const t = v?.trim();
  return t && t.length > 0 ? t : null;
}

function formatYen(n: number): string {
  return new Intl.NumberFormat("ja-JP").format(n);
}

export async function generateMetadata(): Promise<Metadata> {
  const base = getPublicAppUrl().replace(/\/$/, "");
  const description =
    "Bluvium（会員・所属・資格・大会エントリー・決済）に関する特定商取引法に基づく表示です。代金、支払方法、キャンセル・返金、お問い合わせ先を記載しています。";
  return {
    title: "特定商取引法に基づく表示",
    description,
    openGraph: {
      title: "特定商取引法に基づく表示 | Bluvium",
      description,
      url: `${base}/legal/tokushoho`,
      siteName: "Bluvium",
      locale: "ja_JP",
      type: "website",
    },
  };
}

export default function TokushohoPage() {
  const baseUrl = getPublicAppUrl().replace(/\/$/, "");
  const yearlyPlatformYen = organizerYearlySubscriptionAmountYen();
  const yearlyFormatted = formatYen(yearlyPlatformYen);

  const sellerName = trimOrNull(process.env.NEXT_PUBLIC_TOKUSHOHO_SELLER_NAME);
  const representative = trimOrNull(process.env.NEXT_PUBLIC_TOKUSHOHO_REPRESENTATIVE);
  const address = trimOrNull(process.env.NEXT_PUBLIC_TOKUSHOHO_ADDRESS);
  const phone = trimOrNull(process.env.NEXT_PUBLIC_TOKUSHOHO_PHONE);
  const officeHours = trimOrNull(process.env.NEXT_PUBLIC_TOKUSHOHO_PHONE_HOURS);
  const contactEmail =
    trimOrNull(process.env.NEXT_PUBLIC_TOKUSHOHO_CONTACT_EMAIL) ??
    trimOrNull(process.env.NEXT_PUBLIC_BUSINESS_CONTACT_EMAIL);

  const rowClass = "grid gap-1 border-b border-border/80 py-3 text-sm last:border-b-0 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-4";
  const dtClass = "font-medium text-foreground";
  const ddClass = "leading-relaxed text-muted-foreground";

  return (
    <div className={cn(authShellMainClassName, "flex flex-col")}>
      <article className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
        <div className="mb-8 flex justify-center">
          <BluviumWordmark variant="hero" />
        </div>

        <h1 className="text-balance text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          特定商取引法に基づく表示
        </h1>
        <p className="mx-auto mt-4 max-w-prose text-pretty text-center text-sm leading-relaxed text-muted-foreground sm:text-base">
          インターネット通信販売（役務の提供を含む）に関する表示です。サービス名は「Bluvium」です。
        </p>

        <section className="mt-10 rounded-2xl border border-border/90 bg-card/80 p-6 shadow-sm dark:border-border dark:bg-card/60">
          <h2 className="text-sm font-semibold text-foreground">販売事業者等</h2>
          {!sellerName && (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              法人名（又は商号）・所在地・代表者名・電話番号の本ページへの掲載は順次整備します。それまではお問い合わせ先にてご確認いただけます。
            </p>
          )}
          <dl className="mt-4">
            <div className={rowClass}>
              <dt className={dtClass}>販売事業者名</dt>
              <dd className={ddClass}>{sellerName ?? "（準備中・お問い合わせにてご確認ください）"}</dd>
            </div>
            <div className={rowClass}>
              <dt className={dtClass}>運営責任者／代表者</dt>
              <dd className={ddClass}>{representative ?? "（準備中・お問い合わせにてご確認ください）"}</dd>
            </div>
            <div className={rowClass}>
              <dt className={dtClass}>所在地</dt>
              <dd className={ddClass}>
                {address ? (
                  address.split(/\n/).map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))
                ) : (
                  "（準備中・お問い合わせにてご確認ください）"
                )}
              </dd>
            </div>
            <div className={rowClass}>
              <dt className={dtClass}>電話番号</dt>
              <dd className={ddClass}>
                {phone ? (
                  <>
                    <span className="block">{phone}</span>
                    {officeHours ? (
                      <span className="mt-1 block text-xs text-muted-foreground/90">受付時間: {officeHours}</span>
                    ) : null}
                  </>
                ) : (
                  "（準備中・お問い合わせにてご確認ください）"
                )}
              </dd>
            </div>
            <div className={rowClass}>
              <dt className={dtClass}>メールアドレス</dt>
              <dd className={ddClass}>
                {contactEmail ? (
                  <Button variant="outline" size="sm" asChild>
                    <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
                  </Button>
                ) : (
                  "登録済みの方はログインのうえアプリ内の案内に従ってご連絡ください。法人・大会主催者の方は契約・導入時の窓口までお願いいたします。"
                )}
              </dd>
            </div>
            <div className={rowClass}>
              <dt className={dtClass}>サービスURL</dt>
              <dd className={ddClass}>
                <span className="break-all">{baseUrl}</span>
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-6 space-y-3 rounded-2xl border border-border/90 bg-card/80 p-6 shadow-sm dark:border-border dark:bg-card/60">
          <h2 className="text-sm font-semibold text-foreground">販売価格（対価）</h2>
          <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
            <div>
              <h3 className="font-medium text-foreground">1. 大会エントリー料（競技参加の申込に伴う対価）</h3>
              <p className="mt-2">
                大会ごと、並びに申込種目・区分（個人／チーム等）により異なります。適用される金額は、申込手続きの画面上に表示される日本円建ての金額（税込）を正とします。エントリー料が無料（0円）の大会・区分もあります。
              </p>
            </div>
            <div>
              <h3 className="font-medium text-foreground">2. 大会主催団体向けプラットフォーム利用料（年額）</h3>
              <p className="mt-2">
                本サービスにおける大会運営団体向けの年額利用料は、
                <span className="font-semibold text-foreground"> 税込 {yearlyFormatted} 円／年 </span>
                です（本ページの表示は運用設定に基づき更新される場合があります）。
              </p>
              <p className="mt-2 text-xs text-muted-foreground/90">
                ※本ページの記載と Stripe の決済画面の表示に差異がある場合は、決済時に表示される内容を優先してください。
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 space-y-3 rounded-2xl border border-border/90 bg-card/80 p-6 shadow-sm dark:border-border dark:bg-card/60">
          <h2 className="text-sm font-semibold text-foreground">商品代金以外に必要となる金額</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            インターネット接続料金、通信料金、およびご利用端末に関する費用は、お客様のご負担となります。
          </p>
        </section>

        <section className="mt-6 space-y-3 rounded-2xl border border-border/90 bg-card/80 p-6 shadow-sm dark:border-border dark:bg-card/60">
          <h2 className="text-sm font-semibold text-foreground">支払方法・支払時期</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">支払方法:</span>{" "}
              クレジットカード決済（決済処理は Stripe 株式会社のシステムを利用します。利用可能なブランド等は決済画面の表示に従います）。
            </li>
            <li>
              <span className="font-medium text-foreground">エントリー料等（一括払）:</span>{" "}
              申込手続きに従い、決済が完了した時点で支払いが行われます。
            </li>
            <li>
              <span className="font-medium text-foreground">主催団体向け年額利用料:</span>{" "}
              Stripe のサブスクリプションに基づき、契約内容に従ったタイミングで課金・決済されます。
            </li>
          </ul>
        </section>

        <section className="mt-6 space-y-3 rounded-2xl border border-border/90 bg-card/80 p-6 shadow-sm dark:border-border dark:bg-card/60">
          <h2 className="text-sm font-semibold text-foreground">役務の提供時期</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">エントリー:</span>{" "}
              決済完了後、当サービス上で申込が有効となります。なお、参加資格や承認手続きは大会規程および主催団体の運用によります。
            </li>
            <li>
              <span className="font-medium text-foreground">主催団体向け年額利用:</span>{" "}
              決済およびサブスクリプションの有効化後、契約期間中に本サービスの該当機能をご利用いただけます。
            </li>
          </ul>
        </section>

        <section className="mt-6 space-y-3 rounded-2xl border border-border/90 bg-card/80 p-6 shadow-sm dark:border-border dark:bg-card/60">
          <h2 className="text-sm font-semibold text-foreground">キャンセル、契約解除、返金</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">エントリー:</span>{" "}
              未決済の申込は、決済期限の経過や大会の設定により失効する場合があります。決済完了後の取消・返金は、法令、当該大会の規程・案内、および主催団体の判断・運用に従います。主催団体の管理者が当サービス上で取消処理を行う場合、決済内容に応じて返金処理が行われることがあります。返金の有無・範囲・手数料の取扱いは大会ごとの案内をご確認ください。
            </li>
            <li>
              <span className="font-medium text-foreground">主催団体向け年額利用料（サブスクリプション）:</span>{" "}
              解約・更新停止の手続き、ならびに途中解約時の日割返金の有無等は、契約条件および運営者の定めるところによります。ご希望の場合はお問い合わせ先までご連絡ください（Stripe 上のサブスクリプション管理が利用可能な場合は、その手順に従ってください）。
            </li>
            <li>
              <span className="font-medium text-foreground">クーリングオフ:</span>{" "}
              取引形態により特定商取引法上のクーリングオフが適用されない場合があります。個別の適否については法令に従います。
            </li>
          </ul>
        </section>

        <section className="mt-6 space-y-3 rounded-2xl border border-border/90 bg-card/80 p-6 shadow-sm dark:border-border dark:bg-card/60">
          <h2 className="text-sm font-semibold text-foreground">動作環境</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            本サービスは、一般的なウェブブラウザおよび当サービスが配布するモバイルアプリからご利用いただくことを想定しています。推奨環境の詳細は導入時の案内またはヘルプに従います。
          </p>
        </section>

        <section className="mt-6 space-y-3 rounded-2xl border border-border/90 bg-card/80 p-6 shadow-sm dark:border-border dark:bg-card/60">
          <h2 className="text-sm font-semibold text-foreground">表現・広告に関する合理的な注意事項</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            画面上の申込内容、金額表示、大会案内、および決済前に表示される内容をご確認のうえお申込みください。表示内容と口頭説明等に差異がある場合は、法令に従い、一般に消費者に有利な表示を優先します。
          </p>
        </section>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild variant="default" size="lg">
            <Link href="/">サービストップへ</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/business">事業者情報</Link>
          </Button>
        </div>
      </article>
    </div>
  );
}
