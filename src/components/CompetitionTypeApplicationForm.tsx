"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type CompetitionType = "A" | "B";
type ApplicationStatus = "PENDING" | "APPROVED" | "REJECTED";

type HistoryRow = {
  id: string;
  requestedType: CompetitionType;
  status: ApplicationStatus;
  rejectionReason: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
};

const typeLabel: Record<CompetitionType, string> = {
  A: "A級",
  B: "B級",
};

const statusLabel: Record<ApplicationStatus, string> = {
  PENDING: "審査中",
  APPROVED: "承認済み",
  REJECTED: "却下",
};

export default function CompetitionTypeApplicationForm({
  organizationId,
  competitionId,
  competitionName,
  currentCompetitionType,
  initialHistory,
}: {
  organizationId: string;
  competitionId: string;
  competitionName: string;
  currentCompetitionType: CompetitionType | null;
  initialHistory: HistoryRow[];
}) {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<CompetitionType>("A");
  const [submitting, setSubmitting] = useState(false);

  const hasPending = initialHistory.some((row) => row.status === "PENDING");

  const onSubmit = async () => {
    if (hasPending) {
      toast.error("審査中の申請があるため新規申請できません");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/competitions/${competitionId}/type-applications`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestedType: selectedType }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error || "申請に失敗しました");
      }
      toast.success("大会種別申請を送信しました");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "申請に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-border/80">
        <CardHeader className="border-b border-border/60 bg-muted/15">
          <CardTitle className="text-base">大会種別申請</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            大会単位で種別（A級 / B級）を申請します。付与先は主催団体アカウントではなく、この大会そのものです。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">対象大会:</span>
            <span className="font-medium text-foreground">{competitionName}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">現在の種別:</span>
            <Badge variant={currentCompetitionType ? "secondary" : "outline"}>
              {currentCompetitionType ? typeLabel[currentCompetitionType] : "未付与"}
            </Badge>
          </div>

          <div className="space-y-2 rounded-lg border border-border/70 bg-background p-3">
            <Label className="text-sm font-medium">申請する大会種別</Label>
            <RadioGroup
              value={selectedType}
              onValueChange={(v) => setSelectedType(v as CompetitionType)}
              className="grid gap-2 sm:grid-cols-2"
            >
              <Label
                htmlFor="type-a"
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm"
              >
                <RadioGroupItem id="type-a" value="A" />
                <span>A級</span>
              </Label>
              <Label
                htmlFor="type-b"
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm"
              >
                <RadioGroupItem id="type-b" value="B" />
                <span>B級</span>
              </Label>
            </RadioGroup>
          </div>

          {hasPending ? (
            <p className="rounded-lg border border-amber-400/40 bg-amber-500/[0.08] px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
              現在、審査中の申請があります。結果が確定するまで新規申請はできません。
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button type="button" onClick={onSubmit} disabled={submitting || hasPending}>
              {submitting ? "申請中…" : "申請する"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/80">
        <CardHeader className="border-b border-border/60 bg-muted/15">
          <CardTitle className="text-base">申請履歴</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            直近の大会種別申請を表示します。
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          {initialHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">申請履歴はありません。</p>
          ) : (
            <div className="space-y-2">
              {initialHistory.map((row) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-border/70 bg-background px-3 py-2.5 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">申請: {typeLabel[row.requestedType]}</Badge>
                    <Badge variant={row.status === "APPROVED" ? "secondary" : "outline"}>
                      {statusLabel[row.status]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString("ja-JP")}
                    </span>
                  </div>
                  {row.status === "REJECTED" && row.rejectionReason ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      却下理由: {row.rejectionReason}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
