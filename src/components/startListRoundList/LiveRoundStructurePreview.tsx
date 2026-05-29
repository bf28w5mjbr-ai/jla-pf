"use client";

import type { StartListTabDisplaySource } from "@/lib/startListEventTabDisplay";

export type LiveRoundStructurePreviewProps = {
  heatCount: number;
  marshalDisplayHeatIndices: number[];
  previewEstimatedParticipants?: number;
  previewMaxLanesPerHeat?: number;
  displaySource?: StartListTabDisplaySource;
};

export function LiveRoundStructurePreview({
  heatCount,
  marshalDisplayHeatIndices,
  previewEstimatedParticipants,
  previewMaxLanesPerHeat,
}: LiveRoundStructurePreviewProps) {
  if (heatCount <= 0) {
    return (
      <p className="rounded-md border border-dashed border-border/70 bg-muted/15 px-3 py-4 text-xs text-muted-foreground">
        進出者未確定のため、ヒート構成はラウンド設定から試算表示しています（枠のみ）。
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs leading-relaxed text-muted-foreground">
        進出者は未確定です。ヒート数・最大レーンはラウンド設定に基づく試算です（選手名は表示しません）。
        {typeof previewEstimatedParticipants === "number" && previewEstimatedParticipants > 0 ? (
          <>
            {" "}
            想定定員 約 {previewEstimatedParticipants} 名。
          </>
        ) : null}
      </p>
      <ul className="space-y-1.5">
        {Array.from({ length: heatCount }, (_, heatIndex) => {
          const displayNum = marshalDisplayHeatIndices[heatIndex] ?? heatIndex + 1;
          const lanes =
            typeof previewMaxLanesPerHeat === "number" && previewMaxLanesPerHeat >= 1
              ? previewMaxLanesPerHeat
              : null;
          return (
            <li
              key={`preview-heat-${displayNum}`}
              className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs text-foreground"
            >
              <span className="font-semibold text-muted-foreground">ヒート {displayNum}</span>
              {lanes != null ? (
                <span className="text-muted-foreground"> · 最大 {lanes} 枠</span>
              ) : (
                <span className="text-muted-foreground"> · 枠数は種目設定を参照</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
