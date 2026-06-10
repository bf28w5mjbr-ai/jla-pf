import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Settings, Shield } from "lucide-react";
import { appRoutes } from "@/lib/appRoutes";
import { getAuthenticatedAppUser } from "@/lib/authenticatedLayoutData";
import { getCachedQualificationTemplates } from "@/lib/qualificationTemplateCache";
import {
  buildClubCaptionLine,
  buildQualificationCaptionLine,
} from "./DashboardProfileHeroCaption";
import { DashboardKeywordTagWithAdd } from "./DashboardKeywordTag";
import { DashboardProfileHeroContact } from "./DashboardProfileHeroContact";
import { DashboardProfileHeroSection } from "./DashboardProfileHeroSection";
import { DashboardSectionHeading } from "./DashboardSectionHeading";
import { dashboardSectionClassName } from "./dashboardLayout";
import { cn } from "@/lib/utils";

function calcAge(dateOfBirth: Date): number {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

export async function DashboardMain({ userId }: { userId: string }) {
  const [user, qualificationTemplates] = await Promise.all([
    getAuthenticatedAppUser(userId),
    getCachedQualificationTemplates(),
  ]);
  if (!user) redirect("/login");

  const qualificationLabelByKind = new Map<string, string>();
  for (const t of qualificationTemplates) {
    if (!qualificationLabelByKind.has(t.kind)) {
      qualificationLabelByKind.set(t.kind, t.name.trim() || t.kind);
    }
  }
  const qualificationDisplayLabel = (kind: string) => qualificationLabelByKind.get(kind) ?? kind;

  const applicationQualifications = user.qualifications.filter(
    (q) => q.recordOrigin === "USER_APPLICATION"
  );
  const heldQualifications = user.qualifications.filter(
    (q) => q.recordOrigin === "ASSOCIATION_IMPORT"
  );
  const allQualifications = [...applicationQualifications, ...heldQualifications];

  const clubCaption = buildClubCaptionLine(user.memberships);
  const qualificationCaption = buildQualificationCaptionLine(
    allQualifications,
    qualificationDisplayLabel
  );

  const heroCaptions = (
    <>
      <DashboardKeywordTagWithAdd
        sublabel="Club"
        addHref={appRoutes.profile.clubs()}
        addLabel="クラブを追加"
      >
        {clubCaption ?? "未所属"}
      </DashboardKeywordTagWithAdd>
      <DashboardKeywordTagWithAdd
        sublabel="License"
        addHref="/qualifications"
        addLabel="資格を追加"
      >
        {qualificationCaption ?? "資格なし"}
      </DashboardKeywordTagWithAdd>
    </>
  );

  const heroMeta = (
    <p>
      {user.familyNameKana} {user.givenNameKana}
      <span className="mx-2 opacity-60">·</span>
      {calcAge(user.dateOfBirth)}歳
    </p>
  );

  const settingsAction = (
    <Link
      href="/settings"
      aria-label="設定"
      title="設定"
      className={cn(
        "group inline-flex shrink-0 items-center justify-center p-1 text-muted-foreground",
        "transition-colors hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      )}
    >
      <Settings
        className="size-[1.125rem] transition-transform duration-300 group-hover:rotate-90 sm:size-5"
        strokeWidth={1.75}
        aria-hidden
      />
    </Link>
  );

  return (
    <div className="flex flex-col">
      <h1 className="sr-only">マイページ</h1>

      <DashboardProfileHeroSection
        familyName={user.familyName}
        givenName={user.givenName}
        meta={heroMeta}
        contact={
          <DashboardProfileHeroContact
            phoneNumber={user.phoneNumber}
            email={user.email}
            jlaMemberNumber={user.jlaMemberNumber}
          />
        }
        captions={heroCaptions}
        settingsAction={settingsAction}
      />

      {user._count.passkeyCredentials === 0 ? (
        <section
          className={cn(
            dashboardSectionClassName,
            "border-t border-border/40 py-16 sm:py-20"
          )}
        >
          <DashboardSectionHeading
            label="Security"
            title="パスキーでログインを強化"
            subtitle="端末の顔・指紋やセキュリティキーで、より安全にログインできます。"
          />
          <div className="mt-10">
            <Link
              href="/register/passkey?returnTo=%2Fdashboard"
              className="group inline-flex items-center gap-3 border-b border-transparent pb-0.5 text-sm font-medium tracking-wide text-foreground transition-colors hover:border-foreground/30"
            >
              <span>パスキーを登録</span>
              <span className="flex size-8 items-center justify-center rounded-full border border-border/80 transition-colors group-hover:border-foreground/30 group-hover:bg-muted/40">
                <Shield className="size-3.5" aria-hidden />
                <ArrowRight
                  className="size-3.5 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </span>
            </Link>
          </div>
        </section>
      ) : (
        <div className="pb-10 sm:pb-12" />
      )}
    </div>
  );
}
