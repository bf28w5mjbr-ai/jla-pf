import Link from "next/link";
import { appRoutes } from "@/lib/appRoutes";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prisma } from "@/server/db";
import { listClubAdminTechnicalOfficialAlerts } from "@/lib/technicalOfficialQueries";

export default async function ClubAdminTechnicalOfficialBanner({
  userId,
}: {
  userId: string;
}) {
  const alerts = await listClubAdminTechnicalOfficialAlerts(prisma, userId);
  if (alerts.length === 0) return null;

  return (
    <div
      className="rounded-lg border border-amber-500/40 bg-amber-500/[0.09] px-3 py-3 text-sm dark:bg-amber-950/35"
      role="status"
    >
      <div className="flex gap-2">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-800 dark:text-amber-200"
          aria-hidden
        />
        <div className="min-w-0 space-y-2">
          <p className="font-semibold text-amber-950 dark:text-amber-50">
            テクニカルオフィシャルが不足しています
          </p>
          <ul className="space-y-1.5 text-xs leading-snug text-amber-950/90 dark:text-amber-50/90">
            {alerts.map((a) => (
              <li key={`${a.clubId}-${a.competitionId}`}>
                <span className="font-medium">{a.clubName}</span> ·{" "}
                <Button variant="outline" size="sm" className="mx-0.5 h-7 px-2 text-xs" asChild>
                  <Link href={appRoutes.competitions.root(a.competitionId)}>{a.competitionName}</Link>
                </Button>
                <span className="tabular-nums text-muted-foreground">
                  {" "}
                  （必要 {a.required} 人 / 充足 {a.assigned} 人 · 不足 {a.shortage} 人）
                </span>
                {" · "}
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" asChild>
                  <Link href={appRoutes.clubs.tab(a.clubId, "competitions")}>
                    クラブの大会タブで対応
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
