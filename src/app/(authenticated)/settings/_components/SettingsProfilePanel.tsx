import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { CalendarDays, Hash, IdCard, Mail, MapPin, Phone, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

function sexLabel(sex: string): string {
  if (sex === "MALE") return "男性";
  if (sex === "FEMALE") return "女性";
  return "その他";
}

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

function ProfileSubheading({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}

function ProfilePanel({
  children,
  className,
  accent = "orange",
}: {
  children: ReactNode;
  className?: string;
  accent?: "orange" | "muted";
}) {
  const accentClass =
    accent === "orange"
      ? "from-orange-500/70 via-orange-400/30"
      : "from-border/80 via-border/40";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/55 bg-background/70 px-5 py-5 sm:px-6 sm:py-6",
        "transition-[border-color,background-color] duration-200",
        accent === "orange" &&
          "hover:border-orange-200/70 hover:bg-orange-50/20 dark:hover:border-orange-900/45 dark:hover:bg-orange-950/10",
        className
      )}
    >
      {accent === "orange" ? (
        <div
          className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-orange-500/8 dark:bg-orange-400/6"
          aria-hidden
        />
      ) : null}
      <div
        className={cn(
          "absolute bottom-5 left-0 top-5 w-0.5 rounded-full bg-gradient-to-b to-transparent sm:bottom-6 sm:top-6",
          accentClass
        )}
        aria-hidden
      />
      <div className="relative pl-3 sm:pl-4">{children}</div>
    </div>
  );
}

function ProfileFact({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-muted-foreground">
        <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-0.5 break-all text-sm font-medium leading-snug text-foreground sm:text-[0.9375rem]",
            mono && "font-mono"
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function ProfileMetaTag({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border/70 bg-background/80 px-3 py-1 text-[11px] font-medium text-foreground">
      {children}
    </span>
  );
}

export function SettingsProfilePanel({
  familyName,
  givenName,
  familyNameKana,
  givenNameKana,
  dateOfBirth,
  sex,
  email,
  phoneNumber,
  jlaMemberNumber,
  postalCode,
  prefecture,
  city,
  addressLine1,
  addressLine2,
  userId,
  createdAt,
}: {
  familyName: string;
  givenName: string;
  familyNameKana: string;
  givenNameKana: string;
  dateOfBirth: Date | null;
  sex: string;
  email: string;
  phoneNumber: string | null;
  jlaMemberNumber: string | null;
  postalCode: string | null;
  prefecture: string | null;
  city: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  userId: string;
  createdAt: Date;
}) {
  const hasAddress = Boolean(postalCode || prefecture || city || addressLine1 || addressLine2);
  const birthLabel = dateOfBirth
    ? new Date(dateOfBirth).toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <ProfilePanel>
          <ProfileSubheading>Identity</ProfileSubheading>
          <div className="mt-4 space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-muted-foreground">
                <UserRound className="size-4" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
                  {familyName} {givenName}
                </p>
                <p className="mt-1 text-sm tracking-wide text-muted-foreground">
                  {familyNameKana} {givenNameKana}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {birthLabel ? (
                <ProfileMetaTag>
                  {birthLabel}
                  {dateOfBirth ? ` · ${calcAge(dateOfBirth)}歳` : ""}
                </ProfileMetaTag>
              ) : (
                <ProfileMetaTag>生年月日 未登録</ProfileMetaTag>
              )}
              <ProfileMetaTag>{sexLabel(sex)}</ProfileMetaTag>
            </div>
          </div>
        </ProfilePanel>

        <ProfilePanel>
          <ProfileSubheading>Contact</ProfileSubheading>
          <div className="mt-4 space-y-4">
            <ProfileFact icon={Mail} label="メールアドレス" value={email} />
            <ProfileFact
              icon={Phone}
              label="電話番号"
              value={phoneNumber ?? "未登録"}
              mono={Boolean(phoneNumber)}
            />
            {jlaMemberNumber ? (
              <ProfileFact icon={IdCard} label="JLA会員番号" value={jlaMemberNumber} mono />
            ) : null}
          </div>
        </ProfilePanel>
      </div>

      {hasAddress ? (
        <ProfilePanel className="lg:col-span-2">
          <ProfileSubheading>Address</ProfileSubheading>
          <div className="mt-4 flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-muted-foreground">
              <MapPin className="size-3.5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0 space-y-1">
              {postalCode ? (
                <p className="font-mono text-sm font-medium text-foreground">〒{postalCode}</p>
              ) : null}
              <p className="text-sm font-medium leading-relaxed text-foreground sm:text-[0.9375rem]">
                {prefecture}
                {city}
                {addressLine1}
                {addressLine2 ? (
                  <>
                    <br />
                    {addressLine2}
                  </>
                ) : null}
              </p>
            </div>
          </div>
        </ProfilePanel>
      ) : null}

      <ProfilePanel accent="muted">
        <ProfileSubheading>Account</ProfileSubheading>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ProfileFact icon={Hash} label="ユーザーID" value={userId} mono />
          <ProfileFact
            icon={CalendarDays}
            label="登録日"
            value={new Date(createdAt).toLocaleDateString("ja-JP", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          />
        </div>
      </ProfilePanel>
    </div>
  );
}
