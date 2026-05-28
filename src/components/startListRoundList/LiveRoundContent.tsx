"use client";

import { useEffect, useMemo, useRef } from "react";
import { LiveRoundModeBanners } from "./LiveRoundModeBanners";
import { LiveRoundHeatMarshalDialogs } from "./LiveRoundHeatMarshalDialogs";
import { LiveRoundDsqLink } from "./LiveRoundDsqLink";
import { LiveRoundHeatSection } from "./LiveRoundHeatSection";
import { useLiveRoundParticipantStatus } from "@/hooks/liveRound/useLiveRoundParticipantStatus";
import { useMarshalDraftOps } from "@/hooks/liveRound/useMarshalDraftOps";
import { useResultCaptureDraft } from "@/hooks/liveRound/useResultCaptureDraft";
import { useLiveRoundHeatMarshalActions } from "@/hooks/liveRound/useLiveRoundHeatMarshalActions";
import { useLiveRoundNfc } from "@/hooks/liveRound/useLiveRoundNfc";
import { toLiveRoundMarshalContext } from "@/hooks/liveRound/toLiveRoundMarshalContext";
import type { LiveRoundContentProps } from "./types";
import { sexLabel } from "./panelHelpers";

export function LiveRoundContent({
  eventId,
  isTeam,
  individualHeats,
  teamHeats,
  marshalDisplayHeatIndices,
  heatAdvanceQuotas,
  startListMarshal,
  participantStatusByKey,
  participantStatusRows,
  marshalRoundForDisplay,
  heatPlanConfirmedForDsq = false,
}: LiveRoundContentProps) {
  const snapshotHeatIndexForRow = (rowIdx: number) =>
    marshalDisplayHeatIndices?.[rowIdx] ?? rowIdx + 1;
  const quotaFor = (heatIndex: number) => heatAdvanceQuotas?.[heatIndex];
  const { statusByKey, statusUpdatedAtByKey } = useLiveRoundParticipantStatus({
    participantStatusRows,
    participantStatusByKey,
    marshalRoundForDisplay,
  });

  const m = startListMarshal ?? null;
  const marshalCtx = toLiveRoundMarshalContext(m);
  const mRef = useRef(marshalCtx);
  useEffect(() => {
    mRef.current = marshalCtx;
  }, [marshalCtx]);

  const uiMode = m?.marshalUiMode ?? "dialog";
  const resultMode = uiMode === "result";
  const marshalInline = Boolean(m && uiMode === "inline");
  const showMarshalAdminUi = Boolean(m && !resultMode);
  const showMarshalHeatControls = marshalInline;
  const marshalRoundMismatch = Boolean(m?.marshalRoundMismatch);
  const showDsqManagementLink = Boolean(
    m && !m.loading && heatPlanConfirmedForDsq && (marshalInline || resultMode)
  );
  const resultCapture = m?.resultCapture;
  const resultCaptureVisible = Boolean(resultMode && m && resultCapture);

  const {
    marshalHeatByDisplayNumber,
    heatsRef,
    marshalDraftOps,
    setMarshalDraftOps,
    marshalDraftErrors,
    setMarshalDraftErrors,
    marshalBulkSubmitting,
    marshalPendingKey,
    setMarshalPendingKey,
    marshalResult,
    setMarshalResult,
    queueMarshalDraftToggle,
    discardMarshalDrafts,
    submitMarshalDrafts,
    patchHeatCallClosed,
    patchHeatCallReopened,
    patchLaneCalled,
    handleMarshalResult,
  } = useMarshalDraftOps({
    eventId,
    m: marshalCtx,
    statusUpdatedAtByKey,
  });

  const {
    localResultRows,
    resultCapturePendingKey,
    setResultCapturePendingKey,
    resultDraftOps,
    setResultDraftOps,
    resultDraftErrors,
    setResultDraftErrors,
    tieNextHeatIndex,
    setTieNextHeatIndex,
    tieNextHeatIndexRef,
    localConfirmedHeats,
    confirmedHeatsRef,
    resultInputOrder,
    setResultInputOrder,
    dragSourceParticipantKey,
    setDragSourceParticipantKey,
    dragOverParticipantKey,
    setDragOverParticipantKey,
    heatResultConfirmTarget,
    setHeatResultConfirmTarget,
    heatResultConfirmBusy,
    runUpTarget,
    setRunUpTarget,
    clearRunUpTarget,
    setClearRunUpTarget,
    runUpBusy,
    runHeatResultRunUp,
    runHeatResultClearRunUp,
    handleRankRecorded,
    countResultDraftsForHeat,
    toggleResultDraft,
    rankedParticipantKeysForHeat,
    reorderResultRanks,
    runHeatResultConfirm,
  } = useResultCaptureDraft({
    eventId,
    m: marshalCtx,
    mRef,
    resultCaptureVisible,
    resultCapture,
    heatsRef,
  });

  const {
    heatCloseTarget,
    setHeatCloseTarget,
    heatCloseBusy,
    heatReopenTarget,
    setHeatReopenTarget,
    heatReopenBusy,
    runHeatMarshalClose,
    runHeatMarshalReopen,
  } = useLiveRoundHeatMarshalActions({
    eventId,
    m: marshalCtx,
    marshalDraftOps,
    setMarshalDraftOps,
    setMarshalDraftErrors,
    patchHeatCallClosed,
    patchHeatCallReopened,
  });

  const { nfcMarshalInline, nfcResultInline } = useLiveRoundNfc({
    eventId,
    m: marshalCtx,
    mRef,
    marshalInline,
    resultCaptureVisible,
    resultCapture,
    heatsRef,
    confirmedHeatsRef,
    resultInputOrder,
    patchLaneCalled,
    handleMarshalResult,
    handleRankRecorded,
    setMarshalPendingKey,
    setResultCapturePendingKey,
    tieNextHeatIndexRef,
  });

  return (
    <div className="space-y-1.5">
      <LiveRoundModeBanners
        resultCaptureVisible={resultCaptureVisible}
        resultMode={resultMode}
        marshalInline={marshalInline}
        m={m}
        resultCapture={resultCapture}
        localConfirmedHeats={localConfirmedHeats}
        resultInputOrder={resultInputOrder}
        setResultInputOrder={setResultInputOrder}
        nfcResultInline={nfcResultInline}
        nfcMarshalInline={nfcMarshalInline}
        marshalDraftOps={marshalDraftOps}
        marshalDraftErrors={marshalDraftErrors}
        marshalBulkSubmitting={marshalBulkSubmitting}
        discardMarshalDrafts={discardMarshalDrafts}
        submitMarshalDrafts={submitMarshalDrafts}
      />
      <LiveRoundDsqLink
        showDsqManagementLink={showDsqManagementLink}
        marshalRoundMismatch={marshalRoundMismatch}
        m={m}
        eventId={eventId}
        marshalRoundForDisplay={marshalRoundForDisplay}
      />
      {(isTeam ? teamHeats : individualHeats).map((heatItems, heatIndex) => (
        <LiveRoundHeatSection
          key={`${eventId}-heat-${heatIndex}`}
          isTeam={isTeam}
          eventId={eventId}
          heatIndex={heatIndex}
          heatItems={heatItems}
          displayHeatNumber={snapshotHeatIndexForRow(heatIndex)}
          apiHeat={marshalHeatByDisplayNumber.get(snapshotHeatIndexForRow(heatIndex))}
          heatAdvanceQuota={quotaFor(heatIndex)}
          m={m}
          resultCapture={resultCapture}
          statusByKey={statusByKey}
          marshalRoundMismatch={marshalRoundMismatch}
          showMarshalAdminUi={showMarshalAdminUi}
          showMarshalHeatControls={showMarshalHeatControls}
          resultCaptureVisible={resultCaptureVisible}
          marshalInline={marshalInline}
          localConfirmedHeats={localConfirmedHeats}
          localResultRows={localResultRows}
          resultDraftOps={resultDraftOps}
          resultDraftErrors={resultDraftErrors}
          resultInputOrder={resultInputOrder}
          tieNextHeatIndex={tieNextHeatIndex}
          setTieNextHeatIndex={setTieNextHeatIndex}
          resultCapturePendingKey={resultCapturePendingKey}
          dragSourceParticipantKey={dragSourceParticipantKey}
          dragOverParticipantKey={dragOverParticipantKey}
          setDragSourceParticipantKey={setDragSourceParticipantKey}
          setDragOverParticipantKey={setDragOverParticipantKey}
          countResultDraftsForHeat={countResultDraftsForHeat}
          toggleResultDraft={toggleResultDraft}
          reorderResultRanks={reorderResultRanks}
          setHeatResultConfirmTarget={setHeatResultConfirmTarget}
          heatResultConfirmBusy={heatResultConfirmBusy}
          setRunUpTarget={setRunUpTarget}
          setClearRunUpTarget={setClearRunUpTarget}
          runUpBusy={runUpBusy}
          setHeatCloseTarget={setHeatCloseTarget}
          setHeatReopenTarget={setHeatReopenTarget}
          marshalBulkSubmitting={marshalBulkSubmitting}
          marshalPendingKey={marshalPendingKey}
          marshalDraftErrors={marshalDraftErrors}
          queueMarshalDraftToggle={queueMarshalDraftToggle}
        />
      ))}

      <LiveRoundHeatMarshalDialogs
        heatCloseTarget={heatCloseTarget}
        setHeatCloseTarget={setHeatCloseTarget}
        heatCloseBusy={heatCloseBusy}
        runHeatMarshalClose={runHeatMarshalClose}
        heatReopenTarget={heatReopenTarget}
        setHeatReopenTarget={setHeatReopenTarget}
        heatReopenBusy={heatReopenBusy}
        runHeatMarshalReopen={runHeatMarshalReopen}
        heatResultConfirmTarget={heatResultConfirmTarget}
        setHeatResultConfirmTarget={setHeatResultConfirmTarget}
        heatResultConfirmBusy={heatResultConfirmBusy}
        runHeatResultConfirm={runHeatResultConfirm}
        runUpTarget={runUpTarget}
        setRunUpTarget={setRunUpTarget}
        runUpBusy={runUpBusy}
        runHeatResultRunUp={runHeatResultRunUp}
        clearRunUpTarget={clearRunUpTarget}
        setClearRunUpTarget={setClearRunUpTarget}
        runHeatResultClearRunUp={runHeatResultClearRunUp}
        marshalResult={marshalResult}
        setMarshalResult={setMarshalResult}
      />
    </div>
  );
}

export { sexLabel };
