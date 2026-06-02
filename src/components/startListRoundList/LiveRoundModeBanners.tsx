"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LiveRoundContentProps } from "./types";
import type { MarshalDraftOp } from "@/hooks/liveRound/types";

type StartListMarshal = NonNullable<LiveRoundContentProps["startListMarshal"]>;
type ResultCapture = NonNullable<StartListMarshal["resultCapture"]>;

export type LiveRoundModeBannersProps = {
  resultCaptureVisible: boolean;
  resultMode: boolean;
  marshalInline: boolean;
  m: StartListMarshal | null;
  resultCapture: ResultCapture | undefined;
  localConfirmedHeats: number[];
  resultInputOrder: "asc" | "desc";
  setResultInputOrder: (order: "asc" | "desc") => void;
  nfcResultInline: "idle" | "listening" | "unsupported" | "error";
  nfcMarshalInline: "idle" | "listening" | "unsupported" | "error";
  marshalDraftOps: Record<string, MarshalDraftOp>;
  marshalDraftErrors: Record<string, string>;
  marshalBulkSubmitting: boolean;
  discardMarshalDrafts: () => void;
  submitMarshalDrafts: () => void | Promise<void>;
  hasResultDraftOps?: boolean;
};

export function LiveRoundModeBanners({
  resultCaptureVisible,
  resultMode,
  marshalInline,
  m,
  resultCapture,
  localConfirmedHeats,
  resultInputOrder,
  setResultInputOrder,
  nfcResultInline,
  nfcMarshalInline,
  marshalDraftOps,
  marshalDraftErrors,
  marshalBulkSubmitting,
  discardMarshalDrafts,
  submitMarshalDrafts,
  hasResultDraftOps = false,
}: LiveRoundModeBannersProps) {
  const marshalParticipantsPending = Boolean(
    m?.loading && !m.heats?.some((h) => h.participants.length > 0)
  );
  const resultCaptureInitialLoading = Boolean(
    resultCapture?.loading && (resultCapture.rows.length ?? 0) === 0 && !hasResultDraftOps
  );

  return (
    <>
      {resultCaptureVisible && m && resultCapture ? (
        <>
          <div className="space-y-1.5 rounded-md border border-violet-200/90 bg-violet-50/60 px-2 py-1.5 text-[10px] leading-snug text-violet-950 dark:border-violet-900/70 dark:bg-violet-950/35 dark:text-violet-100">
            <p>
              <span className="font-semibold">リザルトモード</span>
              {" — "}
              各ヒートでマーシャル締切後にのみ記録できます。召集済みのみ対象で、ヒート単位です。チェックまたは NFC
              で記録し、召集済み全員分そろってから「リザルト確定」してください。記録済みの行は PC ではドラッグ、スマホでは行右の矢印で並べ替えられます（未確定チェックのみのときも同様）。
            </p>
            <p className="text-muted-foreground dark:text-violet-200/85">
              <span className="font-semibold text-violet-950 dark:text-violet-100">脱落式</span>
              {" — "}
              「下位から」で脱落着順を入れたあと、ヒート見出しの
              <span className="font-medium text-foreground"> 残りをランアップ </span>
              で生存者を着順なし進出として登録できます（アップ枠表示があるとき）。
            </p>
            <p className="text-muted-foreground dark:text-violet-200/85">
              レーン単位の終了ステータス（欠場・棄権・DNF・失格）は、直上の
              <span className="font-medium text-foreground"> 終了ステータス管理 </span>
              から登録・取り消しできます（公開用の公式結果に自動反映されます）。終了ステータス後は残りの着順が自動で詰まり、未確定チェックは対象外になります。
            </p>
            <p className="text-muted-foreground dark:text-violet-200/85">
              <span className="font-semibold text-violet-950 dark:text-violet-100">公開</span>
              {" — "}
              Web の一般掲載は主催の「公式結果」で
              <span className="font-medium text-foreground"> 公開日時 </span>
              が設定されたときです（当日の確定だけでは結果一覧に載りません）。
            </p>
            {resultCapture.locked ? (
              <p className="font-semibold text-amber-800 dark:text-amber-200">
                公式結果が確定済みのため記録できません。
              </p>
            ) : null}
            {localConfirmedHeats.length > 0 && !resultCapture.locked ? (
              <p className="border-t border-violet-200/80 pt-1.5 text-muted-foreground dark:border-violet-800/60">
                <span className="font-semibold text-violet-950 dark:text-violet-100">確定済みヒート</span>
                {" — "}
                左は着順、記録がない行は L＋レーン番号です。
              </p>
            ) : null}
          </div>
          {!marshalParticipantsPending &&
          !resultCaptureInitialLoading &&
          !m.marshalOpsBlocked &&
          !resultCapture.locked ? (
            <p
              className={cn(
                "rounded-md border px-2 py-1 text-[10px] leading-snug",
                nfcResultInline === "listening" &&
                  "border-violet-200/80 bg-violet-50/90 text-violet-950 dark:border-violet-900 dark:bg-violet-950/35 dark:text-violet-100",
                nfcResultInline === "unsupported" &&
                  "border-border/80 bg-muted/30 text-muted-foreground",
                nfcResultInline === "error" &&
                  "border-amber-200/90 bg-amber-50/80 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
                nfcResultInline === "idle" && "border-transparent bg-transparent text-muted-foreground"
              )}
              role="status"
            >
              {nfcResultInline === "listening"
                ? "NFC 待機中（ヒートを順に試し、タグの選手がいるヒートで次の着順に記録されます）"
                : nfcResultInline === "unsupported"
                  ? "この環境では NFC を利用できません。レーン左のチェックで記録してください。"
                  : nfcResultInline === "error"
                    ? "NFC を開始できませんでした。「リザルト」をもう一度タップするか、チェックで記録してください。"
                    : "NFC を準備しています…"}
            </p>
          ) : null}
          <div className="sticky top-2 z-20 mt-1 rounded-md border border-violet-200/90 bg-violet-50/95 px-2 py-1.5 shadow-sm backdrop-blur-[1px] dark:border-violet-900/70 dark:bg-violet-950/70 sm:static sm:bg-violet-50/70 sm:shadow-none dark:sm:bg-violet-950/35">
            <div
              className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end"
              role="radiogroup"
              aria-label="着順の入力方向"
            >
              <span className="text-[10px] font-semibold text-violet-900 dark:text-violet-100 sm:mr-1">
                着順の入れ方
              </span>
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={resultInputOrder === "asc" ? "default" : "outline"}
                  className="h-8 min-w-[7.5rem] px-2.5 text-[10px] font-semibold sm:h-7"
                  role="radio"
                  aria-checked={resultInputOrder === "asc"}
                  onClick={() => setResultInputOrder("asc")}
                  title="1位から空き番を順に埋めます。失格・未記録の行は一覧では末尾に並びます。"
                >
                  上位から<span className="ml-0.5 font-normal opacity-90">（1位〜）</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={resultInputOrder === "desc" ? "default" : "outline"}
                  className="h-8 min-w-[7.5rem] px-2.5 text-[10px] font-semibold sm:h-7"
                  role="radio"
                  aria-checked={resultInputOrder === "desc"}
                  onClick={() => setResultInputOrder("desc")}
                  title="最下位から埋めます。基準人数は当ヒートの召集済人数です（団体は構成員全員が召集済のとき1枠）。失格・未記録は末尾です。"
                >
                  下位から<span className="ml-0.5 font-normal opacity-90">（最下位〜）</span>
                </Button>
              </div>
            </div>
            <p
              className="mt-1 text-left text-[10px] text-muted-foreground sm:text-right"
              title="降順ではマーシャル一覧の召集済人数が上限です。団体は構成員全員が召集済のとき1枠として数えます。"
            >
              失格・未記録は一覧では末尾に並びます。
            </p>
          </div>
        </>
      ) : resultMode && m && !resultCapture ? (
        <p className="rounded-md border border-violet-200/90 bg-violet-50/60 px-2 py-1.5 text-[10px] leading-snug text-violet-950 dark:border-violet-900/70 dark:bg-violet-950/35 dark:text-violet-100">
          <span className="font-semibold">リザルトモード</span>
          — 状態を読み込めませんでした。ページを更新するか、しばらく待ってから再度お試しください。
        </p>
      ) : null}
      {marshalInline && m ? (
        <div className="space-y-1.5">
          <div className="rounded-md border border-emerald-200/90 bg-emerald-50/60 px-2 py-1.5 text-[10px] leading-snug text-emerald-950 dark:border-emerald-900/70 dark:bg-emerald-950/35 dark:text-emerald-100">
            <p>
              <span className="font-semibold">マーシャルモード</span>
              {" — "}
              チェックは端末間で下書き共有されます。データベースへの召集反映は、上部の
              <span className="font-medium text-foreground"> 確定 </span>
              または各ヒートの
              <span className="font-medium text-foreground"> マーシャル締切 </span>
              のときです。
            </p>
          </div>
          {Object.keys(marshalDraftOps).length > 0 ? (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5 text-[10px]">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="font-semibold text-foreground">
                  未確定 {Object.keys(marshalDraftOps).length}件
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    disabled={marshalBulkSubmitting}
                    onClick={discardMarshalDrafts}
                  >
                    取り消し
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    disabled={marshalBulkSubmitting}
                    onClick={() => void submitMarshalDrafts()}
                  >
                    {marshalBulkSubmitting ? "確定中…" : "確定"}
                  </Button>
                </div>
              </div>
              {Object.keys(marshalDraftErrors).length > 0 ? (
                <p className="mt-1 text-[10px] text-destructive">
                  {Object.keys(marshalDraftErrors).length}件でエラーがあります。再確認して再度確定してください。
                </p>
              ) : null}
            </div>
          ) : null}
          {!m.loading && !m.marshalOpsBlocked && !m.isCallClosed ? (
            <p
              className={cn(
                "rounded-md border px-2 py-1 text-[10px] leading-snug",
                nfcMarshalInline === "listening" &&
                  "border-orange-200/80 bg-orange-50/90 text-orange-950 dark:border-orange-900 dark:bg-orange-950/35 dark:text-orange-100",
                nfcMarshalInline === "unsupported" &&
                  "border-border/80 bg-muted/30 text-muted-foreground",
                nfcMarshalInline === "error" &&
                  "border-amber-200/90 bg-amber-50/80 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
                nfcMarshalInline === "idle" && "border-transparent bg-transparent text-muted-foreground"
              )}
              role="status"
            >
              {nfcMarshalInline === "listening"
                ? "NFC 待機中（タグをかざすと、該当する未締切ヒートに記録されます）"
                : nfcMarshalInline === "unsupported"
                  ? "この環境では NFC を利用できません。レーン左のチェックで記録してください。"
                  : nfcMarshalInline === "error"
                    ? "NFC を開始できませんでした。「マーシャル」をもう一度タップするか、チェックで記録してください。"
                    : "NFC を準備しています…"}
            </p>
          ) : null}
          <p className="rounded-md border border-dashed border-border/80 bg-muted/20 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
            レーン単位の失格は、直上の
            <span className="font-medium text-foreground"> 失格管理 </span>
            から登録・取り消しできます。
          </p>
        </div>
      ) : m && !marshalInline && !resultMode && !m.loading ? (
        <p className="rounded-md border border-dashed border-border/80 bg-muted/20 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
          通常モードです。マーシャル操作は
          <span className="font-medium text-foreground"> 「マーシャル」モード </span>
          、着順の記録・失格管理は
          <span className="font-medium text-foreground"> 「リザルト」モード </span>
          に切り替えてください。マーシャルモードでは、各ヒートの
          <span className="font-medium text-foreground"> マーシャル締切まで </span>
          召集チェックの付け外しが可能です（確定または締切で反映。締切の解除は公式リザルト記録前に限ります）。
        </p>
      ) : null}
    </>
  );
}
