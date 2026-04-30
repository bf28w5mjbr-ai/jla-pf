"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { BluviumWordmark } from "@/components/BluviumWordmark";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { appRoutes } from "@/lib/appRoutes";
import {
  derivePlatformRoleSegments,
  PLATFORM_FEATURE_SEGMENT_LABELS,
} from "@/lib/platformTaxonomy";
import { SHOW_PROFILE_QUALIFICATIONS_MANAGEMENT_NAV } from "@/lib/profileQualificationsNav";
import { isPfAdminRole } from "@/lib/governancePolicy";
import { cn } from "@/lib/utils";
import {
  Award,
  BookOpen,
  Building2,
  ChevronDown,
  Landmark,
  LayoutDashboard,
  Menu,
  Megaphone,
  PlusCircle,
  Shield,
  Trophy,
  Users,
  X,
} from "lucide-react";

interface MenuItem {
  label: string;
  href: string;
  condition?: boolean;
  icon?: ReactNode;
}

interface Organization {
  id: string;
  name: string;
  abbreviation?: string | null;
}

interface SidebarProps {
  userRole?: string;
  isClubAdmin?: boolean;
  isAssociationAdmin?: boolean;
  organizations?: Organization[];
  managedClubs?: Organization[];
}

const navLinkClass = (active: boolean) =>
  cn(
    "group flex min-h-9 w-full items-center gap-3 rounded-xl border border-transparent py-1.5 pl-2.5 pr-3 text-sm font-medium transition-colors",
    active
      ? "border-primary/20 bg-primary/[0.08] text-foreground shadow-sm dark:bg-primary/15"
      : "text-muted-foreground hover:border-border/80 hover:bg-muted/60 hover:text-foreground"
  );

const navIconWrap = (active: boolean) =>
  cn(
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
    active
      ? "bg-primary/15 text-primary"
      : "bg-muted/50 text-muted-foreground group-hover:bg-muted group-hover:text-foreground"
  );

const subNavLinkClass = (active: boolean) =>
  cn(
    "flex min-h-8 items-center rounded-lg py-1.5 pl-3 pr-2 text-sm transition-colors",
    active
      ? "bg-primary/10 font-medium text-foreground"
      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
  );

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1 pt-5 pb-2 first:pt-0">
      <span className="h-px flex-1 bg-border/80" aria-hidden />
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {children}
      </span>
      <span className="h-px flex-1 bg-border/80" aria-hidden />
    </div>
  );
}

const footerLinkClass =
  "flex min-h-10 items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:border-border/80 hover:bg-muted/50 hover:text-foreground";

const footerIconWrap =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground transition-colors group-hover:bg-muted group-hover:text-foreground";

export default function Sidebar({
  userRole,
  isClubAdmin,
  isAssociationAdmin,
  organizations = [],
  managedClubs = [],
}: SidebarProps = {}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isClubListOpen, setIsClubListOpen] = useState(true);
  const [isOrgListOpen, setIsOrgListOpen] = useState(true);

  const roleSegments = derivePlatformRoleSegments({
    userRole,
    isClubAdmin,
    isAssociationAdmin,
    organizationCount: organizations.length,
  });
  const isPfAdmin = isPfAdminRole(userRole);
  const isOrgAdmin = roleSegments.includes("ORGANIZER") || isPfAdmin;
  const hasAssociationAccess = roleSegments.includes("ASSOCIATION") || isPfAdmin;
  /** 団体未登録時は作成へ。複数団体時はアコーディオンで href は未使用だがキー用に dashboard */
  const hostOrganizerNavHref =
    organizations.length === 0 ? "/organizations/create" : appRoutes.dashboard();

  const adminMenuItems: MenuItem[] = [
    {
      label: "アカウント管理",
      href: "/admin/account",
      condition: hasAssociationAccess,
      icon: <Building2 className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />,
    },
    {
      label: "ログイン監査",
      href: "/admin/user-security",
      condition: isPfAdmin,
      icon: <Shield className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />,
    },
    {
      label: "通知配信",
      href: "/admin/notifications",
      condition: isPfAdmin,
      icon: <Megaphone className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />,
    },
  ];

  const coreMenuItems: MenuItem[] = [
    {
      label: "個人",
      href: appRoutes.dashboard(),
      icon: <LayoutDashboard className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />,
    },
    {
      label: PLATFORM_FEATURE_SEGMENT_LABELS.COMPETITION,
      href: "/competitions",
      icon: <Trophy className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />,
    },
    {
      label: PLATFORM_FEATURE_SEGMENT_LABELS.QUALIFICATION,
      href: "/lessons",
      condition: SHOW_PROFILE_QUALIFICATIONS_MANAGEMENT_NAV,
      icon: <BookOpen className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />,
    },
    {
      label: "資格の管理",
      href: "/profile/qualifications",
      condition: SHOW_PROFILE_QUALIFICATIONS_MANAGEMENT_NAV,
      icon: <Award className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />,
    },
    {
      label: "クラブ",
      href: managedClubs.length > 0 ? appRoutes.clubs.root(managedClubs[0].id) : appRoutes.dashboard(),
      condition: managedClubs.length > 0,
      icon: <Users className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />,
    },
    {
      label: "主催団体",
      href: hostOrganizerNavHref,
      condition: isOrgAdmin,
      icon: <Landmark className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />,
    },
  ];

  const visibleAdminCount = adminMenuItems.filter(
    (i) => i.condition === undefined || i.condition
  ).length;

  const bottomMenuItems: MenuItem[] = [
    {
      label: "クラブを作成",
      href: appRoutes.clubs.create(),
      icon: <PlusCircle className="h-4 w-4 shrink-0 opacity-90" strokeWidth={1.75} aria-hidden />,
    },
    {
      label: "大会主催団体を作成",
      href: "/organizations/create",
      icon: <PlusCircle className="h-4 w-4 shrink-0 opacity-90" strokeWidth={1.75} aria-hidden />,
    },
  ];

  const renderNavLink = (item: MenuItem, active: boolean) => (
    <Link
      key={item.href + item.label}
      href={item.href}
      onClick={() => setIsOpen(false)}
      className={navLinkClass(active)}
    >
      <span className={navIconWrap(active)}>{item.icon}</span>
      <span className="min-w-0 truncate">{item.label}</span>
    </Link>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed z-50 flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/25 bg-card text-primary shadow-lg shadow-primary/10 backdrop-blur-sm transition-[transform,box-shadow] active:scale-[0.98] dark:shadow-black/40",
          "left-[max(1rem,var(--safe-area-left))] top-[calc(var(--safe-area-top)+0.75rem)]",
          isOpen ? "hidden" : "flex",
          "lg:hidden"
        )}
        aria-label="メニューを開く"
        aria-expanded={isOpen}
        aria-controls="app-sidebar-nav"
      >
        <Menu className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </button>

      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/45 backdrop-blur-[3px] lg:hidden"
          aria-label="オーバーレイを閉じる"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        id="app-sidebar"
        className={cn(
          "fixed top-0 z-40 flex h-[100dvh] w-[min(19rem,calc(100vw-2.25rem))] max-w-[88vw] flex-col border-r border-border/80 bg-card/98 shadow-xl shadow-black/[0.06] backdrop-blur-xl transition-transform duration-300 ease-out dark:bg-card/95 dark:shadow-black/40 lg:sticky lg:w-[17rem] lg:max-w-none lg:translate-x-0 lg:shadow-sm",
          "pt-[var(--safe-area-top,0px)]",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 pb-2.5 pt-3 sm:px-4 sm:pt-4">
          <div className="mb-3 flex min-h-[3.25rem] shrink-0 items-center gap-2 border-b border-border/60 pb-3">
            <Link
              href={appRoutes.dashboard()}
              className="group flex min-w-0 flex-1 items-center rounded-2xl px-1.5 py-1.5 outline-none ring-offset-background transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setIsOpen(false)}
            >
              <span className="min-w-0 flex-1 overflow-hidden text-left">
                <BluviumWordmark variant="nav" />
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/30 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
              aria-label="メニューを閉じる"
            >
              <X className="h-5 w-5" strokeWidth={2} aria-hidden />
            </button>
          </div>

          <nav id="app-sidebar-nav" className="flex flex-col gap-0.5" aria-label="メインメニュー">
            <SectionLabel>メニュー</SectionLabel>

            {coreMenuItems.map((item) => {
              if (item.condition !== undefined && !item.condition) {
                return null;
              }

              if (item.label === "クラブ" && managedClubs.length > 0) {
                const isClubActive = managedClubs.some(
                  (club) =>
                    pathname === appRoutes.clubs.root(club.id) ||
                    pathname?.startsWith(`${appRoutes.clubs.root(club.id)}/`)
                );
                return (
                  <div key={item.label} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setIsClubListOpen((prev) => !prev)}
                      aria-expanded={isClubListOpen}
                      aria-controls="managed-club-list"
                      className={navLinkClass(isClubActive)}
                    >
                      <span className={navIconWrap(isClubActive)}>
                        <Users className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                      </span>
                      <span className="min-w-0 truncate">クラブ</span>
                      <span className="ml-1 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 px-1.5 text-[10px] font-semibold tabular-nums text-primary">
                        {managedClubs.length}
                      </span>
                      <ChevronDown
                        className={cn(
                          "ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          isClubListOpen && "rotate-180"
                        )}
                        aria-hidden
                      />
                    </button>
                    {isClubListOpen && (
                      <div
                        id="managed-club-list"
                        className="ml-1 space-y-0.5 border-l-2 border-primary/15 pl-3"
                      >
                        {managedClubs.map((club) => {
                          const clubHref = appRoutes.clubs.root(club.id);
                          const isActive =
                            pathname === clubHref || pathname?.startsWith(`${clubHref}/`);
                          return (
                            <Link
                              key={club.id}
                              href={clubHref}
                              onClick={() => setIsOpen(false)}
                              className={subNavLinkClass(isActive)}
                            >
                              <span className="truncate">{club.abbreviation || club.name}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              if (item.label === "主催団体" && organizations.length > 0) {
                const isOrgActive = organizations.some(
                  (org) =>
                    pathname === `/organizations/${org.id}` ||
                    pathname?.startsWith(`/organizations/${org.id}/`)
                );
                return (
                  <div key={item.label} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setIsOrgListOpen((prev) => !prev)}
                      aria-expanded={isOrgListOpen}
                      aria-controls="managed-org-list"
                      className={navLinkClass(isOrgActive)}
                    >
                      <span className={navIconWrap(isOrgActive)}>
                        <Landmark className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                      </span>
                      <span className="min-w-0 truncate">主催団体</span>
                      <span className="ml-1 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 px-1.5 text-[10px] font-semibold tabular-nums text-primary">
                        {organizations.length}
                      </span>
                      <ChevronDown
                        className={cn(
                          "ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          isOrgListOpen && "rotate-180"
                        )}
                        aria-hidden
                      />
                    </button>
                    {isOrgListOpen && (
                      <div
                        id="managed-org-list"
                        className="ml-1 space-y-0.5 border-l-2 border-primary/15 pl-3"
                      >
                        {organizations.map((org) => {
                          const orgHref = `/organizations/${org.id}`;
                          const isActive =
                            pathname === orgHref || pathname?.startsWith(`${orgHref}/`);
                          return (
                            <Link
                              key={org.id}
                              href={orgHref}
                              onClick={() => setIsOpen(false)}
                              className={subNavLinkClass(isActive)}
                            >
                              <span className="truncate">{org.abbreviation || org.name}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
              return (
                <div key={item.href + item.label}>
                  {renderNavLink(item, !!isActive)}
                </div>
              );
            })}

            {visibleAdminCount > 0 ? (
              <>
                <SectionLabel>管理者</SectionLabel>
                {adminMenuItems.map((item) => {
                  if (item.condition !== undefined && !item.condition) {
                    return null;
                  }
                  const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
                  return <div key={item.href}>{renderNavLink(item, !!isActive)}</div>;
                })}
              </>
            ) : null}
          </nav>
        </div>

        <div className="shrink-0 rounded-t-2xl border-t border-border/70 bg-gradient-to-b from-muted/25 to-muted/40 px-3 pb-[calc(0.85rem+var(--safe-area-bottom,0px))] pt-3 sm:px-4">
          <nav className="flex flex-col gap-1" aria-label="作成・管理">
            <p className="px-1 pb-1 text-[11px] font-medium text-muted-foreground">新規作成</p>
            {bottomMenuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={cn(footerLinkClass, "group")}
              >
                <span className={footerIconWrap}>{item.icon}</span>
                <span className="min-w-0 truncate">{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </aside>
    </>
  );
}
