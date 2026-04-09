import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseOfficialPositions } from "@/lib/officialPositions";
import {
  OfficialApplicationsAdminPanel,
  type OfficialApplicationAdminRow,
} from "@/components/OfficialApplicationsAdminPanel";

type ApplicationStatus = "PENDING" | "APPROVED" | "REJECTED";

type ApplicationWithUser = {
  id: string;
  positionName: string;
  message: string | null;
  status: ApplicationStatus;
  createdAt: Date;
  user: { familyName: string; givenName: string; email: string };
};

type Props = {
  organizationId: string;
  competitionId: string;
  canEdit: boolean;
  officialPositions: unknown;
  applications: ApplicationWithUser[];
  /** embedded: 親カード内に埋め込むとき外枠 Card を出さない */
  variant?: "card" | "embedded";
};

function countForPosition(
  applications: ApplicationWithUser[],
  positionName: string,
  status: ApplicationStatus
) {
  return applications.filter((a) => a.positionName === positionName && a.status === status).length;
}

export default function OfficialApplicationsStatusSection({
  organizationId,
  competitionId,
  canEdit,
  officialPositions,
  applications,
  variant = "card",
}: Props) {
  const positions = parseOfficialPositions(officialPositions);
  const pendingTotal = applications.filter((a) => a.status === "PENDING").length;
  const approvedTotal = applications.filter((a) => a.status === "APPROVED").length;

  const rows: OfficialApplicationAdminRow[] = applications.map((a) => ({
    id: a.id,
    positionName: a.positionName,
    message: a.message,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
    user: {
      familyName: a.user.familyName,
      givenName: a.user.givenName,
      email: a.user.email,
    },
  }));

  const inner = (
    <>
        {positions.length > 0 ? (
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {positions.map((p) => {
              const approved = countForPosition(applications, p.positionName, "APPROVED");
              const pending = countForPosition(applications, p.positionName, "PENDING");
              return (
                <div
                  key={p.positionName}
                  className="rounded-md border border-border bg-card px-2.5 py-2"
                >
                  <p className="text-xs font-semibold leading-tight">{p.positionName}</p>
                  <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
                    募集{" "}
                    <span className="font-medium tabular-nums text-foreground">{p.count}</span>
                    <span className="mx-1 opacity-50">·</span>
                    承認{" "}
                    <span className="font-medium tabular-nums text-foreground">{approved}</span>
                    <span className="mx-1 opacity-50">·</span>
                    審査中{" "}
                    <span className="font-medium tabular-nums text-foreground">{pending}</span>
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            募集ポジション未設定のため応募は受け付けられません。上の設定を保存してください。
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>
            総数{" "}
            <strong className="tabular-nums text-foreground">{applications.length}</strong>
          </span>
          <span className="hidden sm:inline opacity-40">|</span>
          <span>
            審査中 <strong className="tabular-nums text-foreground">{pendingTotal}</strong>
          </span>
          <span>
            承認 <strong className="tabular-nums text-foreground">{approvedTotal}</strong>
          </span>
        </div>

        <OfficialApplicationsAdminPanel
          organizationId={organizationId}
          competitionId={competitionId}
          canEdit={canEdit}
          applications={rows}
        />
    </>
  );

  if (variant === "embedded") {
    return (
      <div className="space-y-3 border-t border-border pt-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">応募の審査・状況</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            大会ページからの応募。ポジション別の承認数は募集人数の目安にどうぞ。
          </p>
        </div>
        {inner}
      </div>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-1 border-b border-border bg-muted/15 px-4 py-3">
        <CardTitle className="text-base font-semibold">応募状況</CardTitle>
        <CardDescription className="text-xs leading-relaxed">
          大会ページからの応募。ポジション別の承認数は募集人数の目安にどうぞ。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-4 py-3 sm:px-4">{inner}</CardContent>
    </Card>
  );
}
