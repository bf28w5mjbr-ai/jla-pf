"use client";

import { ChevronDown } from "lucide-react";
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

function NfcStatusLine({
  state,
  listeningText,
  unsupportedText,
  errorText,
  classListening,
  classUnsupported,
  classError,
}: {
  state: "idle" | "listening" | "unsupported" | "error";
  listeningText: string;
  unsupportedText: string;
  errorText: string;
  classListening: string;
  classUnsupported: string;
  classError: string;
}) {
  if (state === "idle") return null;
  return (
    <p
      className={cn(
        "rounded-md border px-2 py-1 text-[10px] leading-snug",
        state === "listening" && classListening,
        state === "unsupported" && classUnsupported,
        state === "error" && classError
      )}
      role="status"
    >
      {state === "listening"
        ? listeningText
        : state === "unsupported"
          ? unsupportedText
          : errorText}
    </p>
  );
}

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
  const callWindowLoading = Boolean(m?.callWindowLoading);
  const resultCaptureInitialLoading = Boolean(
    resultCapture?.loading && (resultCapture.rows.length ?? 0) === 0 && !hasResultDraftOps
  );
  const showDayOpsLoadingStatus =
    Boolean(m) &&
    (callWindowLoading || (resultCaptureVisible && resultCaptureInitialLoading));
  const showResultNfc =
    !marshalParticipantsPending &&
    !resultCaptureInitialLoading &&
    m &&
    resultCapture &&
    !m.marshalOpsBlocked &&
    !resultCapture.locked;
  const showMarshalNfc = Boolean(
    m && !m.loading && !m.marshalOpsBlocked && !m.isCallClosed
  );

  return (
    <>
      {showDayOpsLoadingStatus ? (
        <p className="text-[10px] text-muted-foreground" role="status">
          {resultCaptureVisible && resultCaptureInitialLoading && !callWindowLoading
            ? "リザルト記録状況を読み込み中…"
            : "マーシャル締切状態を読み込み中…"}
        </p>
      ) : null}
      {resultCaptureVisible && m && resultCapture ? (
        <>
          <div className="rounded-md border border-violet-200/90 bg-violet-50/60 px-2 py-1.5 text-[10px] leading-snug text-violet-950 dark:border-violet-900/70 dark:bg-violet-950/35 dark:text-violet-100">
            <p>
              <span className="font-semibold">リザルト</span>
              {" — "}
              マーシャル締切後のヒートで、召集済みのみ着順を記録し、全員分そろったら「リザルト確定」。
            </p>
            {resultCapture.locked ? (
              <p className="mt-1 font-semibold text-amber-800 dark:text-amber-200">
                公式結果が確定済みのため記録できません。
              </p>
            ) : null}
            {localConfirmedHeats.length > 0 && !resultCapture.locked ? (
              <p className="mt-1 text-muted-foreground dark:text-violet-200/85">
                確定済みヒートの左は着順（未記録は L＋レーン）。
              </p>
            ) : null}
            <details className="group mt-1.5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-muted-foreground hover:text-foreground dark:text-violet-200/85">
                <ChevronDown
                  className="size-3 shrink-0 transition-transform group-open:rotate-180"
                  aria-hidden
                />
                <span className="font-medium">もう少し詳しく</span>
              </summary>
              <ul className="mt-1.5 list-inside list-disc space-y-1 pl-0.5 text-muted-foreground dark:text-violet-200/85">
                <li>チェックまたは NFC で記録。PC はドラッグ、スマホは行右の矢印で並べ替え可。</li>
                <li>
                  脱落式:「下位から」後、ヒート見出しの「残りをランアップ」で生存者を進出登録（枠があるとき）。
                </li>
                <li>終了ステータス（DNS 等）は直上の「終了ステータス管理」から（公式結果に反映）。</li>
                <li>Web 公開は主催の「公式結果」で公開日時を設定したとき（当日確定のみでは掲載されない）。</li>
              </ul>
            </details>
          </div>
          {showResultNfc ? (
            <NfcStatusLine
              state={nfcResultInline}
              listeningText="NFC 待機中 — タグで次の着順に記録"
              unsupportedText="NFC 不可 — レーン左のチェックで記録"
              errorText="NFC 開始失敗 — 「リザルト」を再タップするかチェックで記録"
              classListening="border-violet-200/80 bg-violet-50/90 text-violet-950 dark:border-violet-900 dark:bg-violet-950/35 dark:text-violet-100"
              classUnsupported="border-border/80 bg-muted/30 text-muted-foreground"
              classError="border-amber-200/90 bg-amber-50/80 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
            />
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
                  title="最下位から埋めます。基準は当ヒートの召集済人数（団体は全員召集済で1枠）。失格・未記録は末尾。"
                >
                  下位から<span className="ml-0.5 font-normal opacity-90">（最下位〜）</span>
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : resultMode && m && !resultCapture ? (
        <p className="rounded-md border border-violet-200/90 bg-violet-50/60 px-2 py-1.5 text-[10px] leading-snug text-violet-950 dark:border-violet-900/70 dark:bg-violet-950/35 dark:text-violet-100">
          <span className="font-semibold">リザルト</span>
          — 読み込みに失敗しました。ページを更新してください。
        </p>
      ) : null}
      {marshalInline && m ? (
        <div className="space-y-1.5">
          <div className="rounded-md border border-emerald-200/90 bg-emerald-50/60 px-2 py-1.5 text-[10px] leading-snug text-emerald-950 dark:border-emerald-900/70 dark:bg-emerald-950/35 dark:text-emerald-100">
            <p>
              <span className="font-semibold">マーシャル</span>
              {" — "}
              チェックは端末間で下書き共有。DB 反映は「確定」またはヒートの「マーシャル締切」時。
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
                <p className="mt-1 text-destructive">
                  {Object.keys(marshalDraftErrors).length}件のエラー — 再確認して確定してください。
                </p>
              ) : null}
            </div>
          ) : null}
          {showMarshalNfc ? (
            <NfcStatusLine
              state={nfcMarshalInline}
              listeningText="NFC 待機中 — タグで未締切ヒートに記録"
              unsupportedText="NFC 不可 — レーン左のチェックで記録"
              errorText="NFC 開始失敗 — 「マーシャル」を再タップするかチェックで記録"
              classListening="border-orange-200/80 bg-orange-50/90 text-orange-950 dark:border-orange-900 dark:bg-orange-950/35 dark:text-orange-100"
              classUnsupported="border-border/80 bg-muted/30 text-muted-foreground"
              classError="border-amber-200/90 bg-amber-50/80 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}
