"use client";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { MarshalResultPayload } from "@/components/MarshalStartListWidgets";

export type LiveRoundHeatMarshalDialogsProps = {
  heatCloseTarget: number | null;
  setHeatCloseTarget: (n: number | null) => void;
  heatCloseBusy: boolean;
  runHeatMarshalClose: (heatIndex: number) => void | Promise<void>;
  heatReopenTarget: number | null;
  setHeatReopenTarget: (n: number | null) => void;
  heatReopenBusy: boolean;
  runHeatMarshalReopen: (heatIndex: number) => void | Promise<void>;
  heatResultConfirmTarget: number | null;
  setHeatResultConfirmTarget: (n: number | null) => void;
  heatResultUnconfirmTarget: number | null;
  setHeatResultUnconfirmTarget: (n: number | null) => void;
  heatResultConfirmBusyHeat: number | null;
  runHeatResultConfirm: (heatIndex: number) => void | Promise<void>;
  runHeatResultUnconfirm: (heatIndex: number) => void | Promise<void>;
  runUpTarget: number | null;
  setRunUpTarget: (n: number | null) => void;
  runUpBusyHeat: number | null;
  runHeatResultRunUp: (heatIndex: number) => void | Promise<void>;
  clearRunUpTarget: number | null;
  setClearRunUpTarget: (n: number | null) => void;
  runHeatResultClearRunUp: (heatIndex: number) => void | Promise<void>;
  marshalResult: MarshalResultPayload | null;
  setMarshalResult: (r: MarshalResultPayload | null) => void;
};

export function LiveRoundHeatMarshalDialogs({
  heatCloseTarget,
  setHeatCloseTarget,
  heatCloseBusy,
  runHeatMarshalClose,
  heatReopenTarget,
  setHeatReopenTarget,
  heatReopenBusy,
  runHeatMarshalReopen,
  heatResultConfirmTarget,
  setHeatResultConfirmTarget,
  heatResultUnconfirmTarget,
  setHeatResultUnconfirmTarget,
  heatResultConfirmBusyHeat,
  runHeatResultConfirm,
  runHeatResultUnconfirm,
  runUpTarget,
  setRunUpTarget,
  runUpBusyHeat,
  runHeatResultRunUp,
  clearRunUpTarget,
  setClearRunUpTarget,
  runHeatResultClearRunUp,
  marshalResult,
  setMarshalResult,
}: LiveRoundHeatMarshalDialogsProps) {
  const heatResultConfirmBusy =
    heatResultConfirmTarget !== null &&
    heatResultConfirmBusyHeat === heatResultConfirmTarget;
  const heatResultUnconfirmBusy =
    heatResultUnconfirmTarget !== null &&
    heatResultConfirmBusyHeat === heatResultUnconfirmTarget;
  const runUpBusy =
    runUpTarget !== null && runUpBusyHeat === runUpTarget;
  const clearRunUpBusy =
    clearRunUpTarget !== null && runUpBusyHeat === clearRunUpTarget;

  return (
    <>
      <AlertDialog
        open={heatCloseTarget !== null}
        onOpenChange={(open) => {
          if (!open && !heatCloseBusy) setHeatCloseTarget(null);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>ヒート {heatCloseTarget ?? "—"} のマーシャル締切</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm text-foreground">
                <p>
                  このヒートの召集を締め切り、
                  <span className="font-semibold"> 未召集の参加者を未出場扱い </span>
                  にします（表示は「未出場（マーシャル未完了）」。競技中の失格 DSQ
                  とは別で、リザルトの対象外です）。
                  締切後にリザルトモードで着順の記録が可能になります。
                </p>
                <p className="text-muted-foreground">
                  競技中の失格の訂正は「失格管理」画面から行ってください。
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel type="button" disabled={heatCloseBusy}>
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                type="button"
                variant="destructive"
                disabled={heatCloseBusy || heatCloseTarget === null}
                onClick={(e) => {
                  e.preventDefault();
                  if (heatCloseTarget !== null) void runHeatMarshalClose(heatCloseTarget);
                }}
              >
                {heatCloseBusy ? "処理中…" : "実行する"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={heatReopenTarget !== null}
        onOpenChange={(open) => {
          if (!open && !heatReopenBusy) setHeatReopenTarget(null);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>ヒート {heatReopenTarget ?? "—"} を受付中に戻す</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm text-foreground">
                <p>
                  このヒートのマーシャル締切を解除し、
                  <span className="font-semibold"> 召集の受付を再開 </span>
                  します。公式リザルトが入っているヒートはサーバー側で拒否されます。
                </p>
                <p className="text-muted-foreground">
                  種目全体のマーシャル締切が有効な場合は、全体の解除が必要になることがあります。
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel type="button" disabled={heatReopenBusy}>
              キャンセル
            </AlertDialogCancel>
            <Button
              type="button"
              variant="default"
              disabled={heatReopenBusy || heatReopenTarget === null}
              onClick={() =>
                heatReopenTarget !== null ? void runHeatMarshalReopen(heatReopenTarget) : undefined
              }
            >
              {heatReopenBusy ? "処理中…" : "受付中に戻す"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={heatResultConfirmTarget !== null}
        onOpenChange={(open) => {
          if (!open && !heatResultConfirmBusy) setHeatResultConfirmTarget(null);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>ヒート {heatResultConfirmTarget ?? "—"} のリザルト確定</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm text-foreground">
                <p>
                  このヒートのリザルト記録を
                  <span className="font-semibold"> 確定 </span>
                  します。確定後はこのヒートへの追記（チェック・NFC・ランアップ）はできません。
                  タイムトライアル型は全員着順、脱落式は脱落着順とランアップが揃っていることが前提です。
                </p>
                <p className="text-muted-foreground">
                  確定後に修正する場合は「確定を解除」からチェック操作に戻せます（種目全体の公式結果ロック中は不可）。
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel type="button" disabled={heatResultConfirmBusy}>
              キャンセル
            </AlertDialogCancel>
            <Button
              type="button"
              variant="default"
              disabled={heatResultConfirmBusy || heatResultConfirmTarget === null}
              onClick={() =>
                heatResultConfirmTarget !== null
                  ? void runHeatResultConfirm(heatResultConfirmTarget)
                  : undefined
              }
            >
              {heatResultConfirmBusy ? "処理中…" : "確定する"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={heatResultUnconfirmTarget !== null}
        onOpenChange={(open) => {
          if (!open && !heatResultUnconfirmBusy) setHeatResultUnconfirmTarget(null);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              ヒート {heatResultUnconfirmTarget ?? "—"} のリザルト確定解除
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm text-foreground">
                <p>
                  このヒートのリザルト確定を
                  <span className="font-semibold"> 解除 </span>
                  し、チェック・並べ替え・ランアップによる修正を再び可能にします。記録済みの着順データは残ります。
                </p>
                <p className="text-muted-foreground">
                  前ラ結果を直したあとは、次ラウンドタブで SL 再生成が必要になる場合があります。
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel type="button" disabled={heatResultUnconfirmBusy}>
              キャンセル
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={heatResultUnconfirmBusy || heatResultUnconfirmTarget === null}
              onClick={() =>
                heatResultUnconfirmTarget !== null
                  ? void runHeatResultUnconfirm(heatResultUnconfirmTarget)
                  : undefined
              }
            >
              {heatResultUnconfirmBusy ? "処理中…" : "解除する"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={runUpTarget !== null}
        onOpenChange={(open) => {
          if (!open && !runUpBusy) setRunUpTarget(null);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>ヒート {runUpTarget ?? "—"} の残りをランアップ</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm text-foreground">
                <p>
                  脱落着順の記録が済んだ召集済み参加者を、
                  <span className="font-semibold"> 着順なしで進出 </span>
                  として一括登録します（次ラ進出枠まで）。
                </p>
                <p className="text-muted-foreground">
                  リザルト確定前であれば「ランアップ解除」で取り消せます。
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel type="button" disabled={runUpBusy}>
              キャンセル
            </AlertDialogCancel>
            <Button
              type="button"
              variant="default"
              disabled={runUpBusy || runUpTarget === null}
              onClick={() =>
                runUpTarget !== null ? void runHeatResultRunUp(runUpTarget) : undefined
              }
            >
              {runUpBusy ? "処理中…" : "ランアップする"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={clearRunUpTarget !== null}
        onOpenChange={(open) => {
          if (!open && !clearRunUpBusy) setClearRunUpTarget(null);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>ヒート {clearRunUpTarget ?? "—"} のランアップ解除</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm text-foreground">
                <p>
                  このヒートの
                  <span className="font-semibold"> 着順なし進出（ランアップ） </span>
                  記録をすべて削除します。脱落の着順記録は残ります。
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel type="button" disabled={clearRunUpBusy}>
              キャンセル
            </AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              disabled={clearRunUpBusy || clearRunUpTarget === null}
              onClick={() =>
                clearRunUpTarget !== null
                  ? void runHeatResultClearRunUp(clearRunUpTarget)
                  : undefined
              }
            >
              {clearRunUpBusy ? "処理中…" : "解除する"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={marshalResult !== null}
        onOpenChange={(open) => {
          if (!open) setMarshalResult(null);
        }}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>マーシャル完了</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm text-foreground">
                {marshalResult ? (
                  <>
                    <p>
                      <span className="text-muted-foreground">レーン</span> {marshalResult.lane}
                    </p>
                    <p className="text-base font-semibold">{marshalResult.label}</p>
                    <p>
                      <span className="text-muted-foreground">所属</span>{" "}
                      {marshalResult.clubName?.trim() ? marshalResult.clubName : "—"}
                    </p>
                    {marshalResult.alreadyMarshalled ? (
                      <p className="text-amber-700 dark:text-amber-300">すでに召集済みでした。</p>
                    ) : null}
                  </>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction type="button">OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
