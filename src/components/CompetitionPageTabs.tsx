import Link from "next/link";
import { appRoutes } from "@/lib/appRoutes";
import { cn } from "@/lib/utils";

type Props = {
  competitionId: string;
  active: "overview" | "start-list" | "result-manage";
  canManage: boolean;
};

export default function CompetitionPageTabs({ competitionId, active, canManage }: Props) {
  const tabs = [
    { id: "overview" as const, label: "大会ページ", href: appRoutes.competitions.root(competitionId) },
    {
      id: "start-list" as const,
      label: "スタートリスト",
      href: appRoutes.competitions.startList(competitionId),
    },
    ...(canManage
      ? [
          {
            id: "result-manage" as const,
            label: "結果管理",
            href: appRoutes.competitions.resultsManage(competitionId),
          },
        ]
      : []),
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-1">
      <div className="flex flex-wrap gap-1">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            className={cn(
              "inline-flex items-center rounded-md px-3 py-2 text-sm transition-colors",
              active === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
