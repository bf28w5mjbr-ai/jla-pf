import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import OfficialApplicationsStatusSection from "@/components/OfficialApplicationsStatusSection";

type ApplicationWithUser = {
  id: string;
  positionName: string;
  message: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: Date;
  user: { familyName: string; givenName: string; email: string };
};

type Props = {
  organizationId: string;
  competitionId: string;
  canEdit: boolean;
  officialPositions: unknown;
  applications: ApplicationWithUser[];
};

export default function OfficialAssignmentSection({
  organizationId,
  competitionId,
  canEdit,
  officialPositions,
  applications,
}: Props) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-1 border-b border-border bg-muted/15 px-4 py-3">
        <CardTitle className="text-base font-semibold">応募審査</CardTitle>
        <CardDescription className="text-xs leading-relaxed">
          当日の出席確認が入ったオフィシャルは自動でスタートリスト編集権限対象になります。ここでは応募の承認・却下のみを行います。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-4 py-3 sm:px-4">
        <OfficialApplicationsStatusSection
          organizationId={organizationId}
          competitionId={competitionId}
          canEdit={canEdit}
          officialPositions={officialPositions}
          applications={applications}
          variant="embedded"
        />
      </CardContent>
    </Card>
  );
}
