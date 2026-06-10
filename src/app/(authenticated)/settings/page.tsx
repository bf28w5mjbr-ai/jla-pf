import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, Mail, Smartphone } from "lucide-react";
import { dashboardSectionClassName } from "@/app/(authenticated)/dashboard/_components/dashboardLayout";
import { NfcTagManagerLazy } from "./_components/settingsDynamicClients";
import { SettingsEditorialNavLink } from "./_components/SettingsEditorialNavLink";
import { SettingsEditorialSection } from "./_components/SettingsEditorialSection";
import { SettingsProfilePanel } from "./_components/SettingsProfilePanel";
import { verifySessionCached } from "@/lib/auth";
import { prisma } from "@/server/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AccountDangerZone from "@/components/AccountDangerZone";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "設定 | Bluvium",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  const sess = await verifySessionCached(token);
  if (!sess?.userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: sess.userId },
    select: {
      id: true,
      email: true,
      security: { select: { passwordHash: true } },
      profile: true,
      contact: true,
      role: true,
      address: true,
      jlaProfile: true,
      nfcTag: { select: { nfcTagId: true } },
      createdAt: true,
    },
  });

  if (!user) redirect("/login");
  const profile = user.profile;
  const contact = user.contact;
  const address = user.address;
  const jlaProfile = user.jlaProfile;

  const isSecure = true;

  return (
    <div className="flex flex-col">
      <h1 className="sr-only">設定</h1>

      <SettingsEditorialSection
        isFirst
        label="Security"
        title="セキュリティ"
        description="ログイン方法と連絡先の確認・変更"
        contentClassName="space-y-4"
      >
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border border-border/55 bg-background/70 px-5 py-5 sm:px-6 sm:py-6",
            "transition-[border-color,background-color] duration-200 hover:border-emerald-200/70 hover:bg-emerald-50/20 dark:hover:border-emerald-900/45 dark:hover:bg-emerald-950/10"
          )}
        >
          <div
            className="pointer-events-none absolute -left-8 top-1/2 size-32 -translate-y-1/2 rounded-full bg-emerald-500/8 dark:bg-emerald-400/6"
            aria-hidden
          />
          <div
            className="absolute bottom-4 left-0 top-4 w-0.5 rounded-full bg-gradient-to-b from-emerald-500/70 via-emerald-400/30 to-transparent sm:bottom-5 sm:top-5"
            aria-hidden
          />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="size-5" strokeWidth={1.5} aria-hidden />
            </div>
            <div className="min-w-0 space-y-3">
              <h3 className="text-base font-semibold text-foreground">アカウントは保護されています</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                メールアドレスとパスワードが設定済みです。電話番号が使えなくなってもアカウントにアクセスできます。
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="secondary"
                  className="border border-emerald-200/80 bg-emerald-50 font-normal text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                >
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                  メールアドレス
                </Badge>
                <Badge
                  variant="secondary"
                  className="border border-emerald-200/80 bg-emerald-50 font-normal text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                >
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                  パスワード
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <SettingsEditorialNavLink
          href="/profile/security"
          icon={Mail}
          title="メールアドレスとパスワード"
          description="ログインに使うメール・パスワードの確認と変更"
        />
        <SettingsEditorialNavLink
          href="/profile/phone-change"
          icon={Smartphone}
          title="電話番号の変更"
          description={
            <span className="font-mono text-[11px] sm:text-xs">
              現在: {contact?.phoneNumber ?? "未登録"}
            </span>
          }
        />
      </SettingsEditorialSection>

      <SettingsEditorialSection
        label="NFC"
        title="NFCタグ"
        description="大会やイベントで利用する NFC タグをアカウントに登録します。"
      >
        <div
          className={cn(
            "rounded-2xl border border-border/55 bg-background/60 px-4 py-4 sm:px-5 sm:py-5",
            "transition-colors hover:border-orange-200/60 hover:bg-orange-50/15 dark:hover:border-orange-900/40 dark:hover:bg-orange-950/10"
          )}
        >
          <NfcTagManagerLazy initialNfcTagId={user.nfcTag?.nfcTagId ?? null} />
        </div>
      </SettingsEditorialSection>

      <SettingsEditorialSection
        label="Profile"
        title="個人情報"
        description="登録されている氏名・住所・連絡先"
        action={
          <Button size="sm" variant="outline" className="gap-1.5" asChild>
            <Link href="/settings/edit-profile">
              編集する
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </Button>
        }
      >
        <SettingsProfilePanel
          familyName={profile?.familyName ?? ""}
          givenName={profile?.givenName ?? ""}
          familyNameKana={profile?.familyNameKana ?? ""}
          givenNameKana={profile?.givenNameKana ?? ""}
          dateOfBirth={profile?.dateOfBirth ?? null}
          sex={profile?.sex ?? ""}
          email={user.email}
          phoneNumber={contact?.phoneNumber ?? null}
          jlaMemberNumber={jlaProfile?.jlaMemberNumber ?? null}
          postalCode={address?.postalCode ?? null}
          prefecture={address?.prefecture ?? null}
          city={address?.city ?? null}
          addressLine1={address?.addressLine1 ?? null}
          addressLine2={address?.addressLine2 ?? null}
          userId={user.id}
          createdAt={user.createdAt}
        />
      </SettingsEditorialSection>

      {isSecure ? (
        <section
          className={cn(
            dashboardSectionClassName,
            "border-t border-border/40 pb-16 pt-12 sm:pb-20 sm:pt-16"
          )}
        >
          <AccountDangerZone />
        </section>
      ) : null}
    </div>
  );
}
