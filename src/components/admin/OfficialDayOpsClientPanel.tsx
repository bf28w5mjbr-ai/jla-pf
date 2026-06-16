"use client";

import { useCallback, useEffect, useState } from "react";
import OfficialApplicationsCsvExportButton, {
  type OfficialApplicationsCsvRow,
} from "@/components/OfficialApplicationsCsvExportButton";
import OfficialAttendancesCsvExportButton, {
  type OfficialAttendancesCsvRow,
} from "@/components/OfficialAttendancesCsvExportButton";
import TechnicalOfficialShortagePanel from "@/components/TechnicalOfficialShortagePanel";
import type { TechnicalOfficialShortageRow } from "@/lib/technicalOfficialQueries";
import {
  officialStatusLabel,
  type OfficialApplicationListItem,
} from "@/lib/officialApplicationAdminData";

type DayOpsPayload = {
  applications: OfficialApplicationListItem[];
  applicationsCsvRows: OfficialApplicationsCsvRow[];
  attendancesCsvRows: OfficialAttendancesCsvRow[];
  competitionTypeLabel: string;
  attendanceCountAdditionLabel: string;
};

export default function OfficialDayOpsClientPanel({
  organizationId,
  competitionId,
  competitionName,
  showTechnicalOfficialRecruitment,
}: {
  organizationId: string;
  competitionId: string;
  competitionName: string;
  showTechnicalOfficialRecruitment: boolean;
}) {
  const [payload, setPayload] = useState<DayOpsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shortageRows, setShortageRows] = useState<TechnicalOfficialShortageRow[] | null>(null);
  const [shortageLoading, setShortageLoading] = useState(false);
  const [shortageError, setShortageError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/organizations/${organizationId}/competitions/${competitionId}/official-dayops-data`,
          { cache: "no-store" }
        );
        const body = (await res.json().catch(() => ({}))) as DayOpsPayload & { error?: string };
        if (!res.ok) {
          throw new Error(body.error || "応募・出席データの取得に失敗しました");
        }
        if (!cancelled) {
          setPayload(body);
          setLoadError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "応募・出席データの取得に失敗しました");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, competitionId]);

  const loadShortage = useCallback(async () => {
    if (shortageRows !== null || shortageLoading) return;
    setShortageLoading(true);
    setShortageError(null);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/competitions/${competitionId}/technical-official-shortage`,
        { cache: "no-store" }
      );
      const body = (await res.json().catch(() => ({}))) as {
        shortage?: TechnicalOfficialShortageRow[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error || "不足人数の取得に失敗しました");
      }
      setShortageRows(body.shortage ?? []);
    } catch (error) {
      setShortageError(error instanceof Error ? error.message : "不足人数の取得に失敗しました");
    } finally {
      setShortageLoading(false);
    }
  }, [organizationId, competitionId, shortageRows, shortageLoading]);

  if (loadError) {
    return (
      <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-3 text-sm text-destructive">
        {loadError}
      </p>
    );
  }

  if (!payload) {
    return (
      <div
        className="flex min-h-[6rem] flex-col justify-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-4 py-3"
        role="status"
        aria-live="polite"
      >
        <div className="h-6 max-w-[12rem] animate-pulse rounded-md bg-muted-foreground/15" aria-hidden />
        <p className="text-sm text-muted-foreground">当日運用データを読み込んでいます…</p>
      </div>
    );
  }

  return (
    <>
      <section className="space-y-3 rounded-xl border border-border/70 bg-background p-3 sm:p-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">オフィシャル応募</h2>
          <p className="text-xs text-muted-foreground">
            CSV で一括出力するか、下の一覧で内容を確認できます。
          </p>
        </div>
        <OfficialApplicationsCsvExportButton
          rows={payload.applicationsCsvRows}
          fileNameBase={`${competitionName}_オフィシャル応募一覧`}
        />
        <details className="rounded-lg border border-border/70 bg-muted/15">
          <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
            応募一覧を表示・非表示
          </summary>
          <div className="max-h-[min(24rem,50vh)] overflow-auto border-t border-border/60">
            <table className="w-full min-w-[20rem] border-collapse text-left text-xs">
              <thead className="sticky top-0 z-[1] bg-muted/90 backdrop-blur-sm">
                <tr className="border-b border-border/60">
                  <th className="px-2 py-2 font-medium">応募日時</th>
                  <th className="px-2 py-2 font-medium">状態</th>
                  <th className="px-2 py-2 font-medium">氏名</th>
                  <th className="px-2 py-2 font-medium">希望ポジション</th>
                </tr>
              </thead>
              <tbody>
                {payload.applications.length === 0 ? (
                  <tr>
                    <td className="px-2 py-4 text-muted-foreground" colSpan={4}>
                      応募はまだありません。
                    </td>
                  </tr>
                ) : (
                  payload.applications.map((application) => (
                    <tr key={application.id} className="border-b border-border/40 last:border-0">
                      <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-muted-foreground">
                        {new Date(application.createdAt).toLocaleString("ja-JP", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        {officialStatusLabel[
                          application.status as keyof typeof officialStatusLabel
                        ] ?? application.status}
                      </td>
                      <td className="px-2 py-1.5">{application.userName}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{application.positionName}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      {showTechnicalOfficialRecruitment ? (
        <details
          className="rounded-xl border border-border/70 bg-background"
          onToggle={(event) => {
            if ((event.currentTarget as HTMLDetailsElement).open) {
              void loadShortage();
            }
          }}
        >
          <summary className="cursor-pointer select-none border-b border-transparent px-3 py-3 text-sm font-semibold text-foreground hover:bg-muted/20 [&::-webkit-details-marker]:hidden">
            不足クラブの確認（開いて表示）
          </summary>
          <div className="space-y-2 border-t border-border/60 p-3">
            <p className="text-[11px] text-muted-foreground">
              現在のエントリー状況に基づく不足人数を表示します。
            </p>
            {shortageLoading ? (
              <div
                className="flex min-h-[4rem] flex-col justify-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2"
                role="status"
                aria-live="polite"
              >
                <div
                  className="h-6 max-w-[10rem] animate-pulse rounded bg-muted-foreground/15"
                  aria-hidden
                />
                <p className="text-xs text-muted-foreground">不足人数を集計しています…</p>
              </div>
            ) : shortageError ? (
              <p className="text-sm text-destructive">{shortageError}</p>
            ) : shortageRows ? (
              <TechnicalOfficialShortagePanel rows={shortageRows} />
            ) : null}
          </div>
        </details>
      ) : null}

      <section className="space-y-2 rounded-xl border border-border/70 bg-background p-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">出席実績CSV出力</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              提出・集計用途向けに出席実績をCSVで出力できます。
            </p>
          </div>
          <OfficialAttendancesCsvExportButton
            rows={payload.attendancesCsvRows}
            fileNameBase={`${competitionName}_当日出席オフィシャル一覧`}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          現在の大会種別: {payload.competitionTypeLabel} / 1出席あたりの加算:{" "}
          {payload.attendanceCountAdditionLabel}
        </p>
      </section>
    </>
  );
}
