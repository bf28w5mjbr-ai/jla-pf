"use client";

import { useEffect, useMemo, useRef } from "react";
import { LiveRoundModeBanners } from "./LiveRoundModeBanners";
import { LiveRoundHeatMarshalDialogs } from "./LiveRoundHeatMarshalDialogs";
import { LiveRoundDsqLink } from "./LiveRoundDsqLink";
import { LiveRoundHeatSection } from "./LiveRoundHeatSection";
import { LiveRoundStructurePreview } from "./LiveRoundStructurePreview";
import { useLiveRoundParticipantStatus } from "@/hooks/liveRound/useLiveRoundParticipantStatus";
import { useMarshalDraftOps } from "@/hooks/liveRound/useMarshalDraftOps";
import { useResultCaptureDraft } from "@/hooks/liveRound/useResultCaptureDraft";
import { useLiveRoundHeatMarshalActions } from "@/hooks/liveRound/useLiveRoundHeatMarshalActions";
import { useLiveRoundNfc } from "@/hooks/liveRound/useLiveRoundNfc";
import { resultDraftHeatsSyncKeyFromHeats } from "@/hooks/liveRound/resultCaptureDraftHelpers";
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
  displaySource,
  previewEstimatedParticipants,
  previewMaxLanesPerHeat,
  resultDraftSyncContext = null,
  marshalDraftSyncContext = null,
  marshalDraftSyncActive = false,
  resultDraftSyncActive = false,
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
  const resultDraftHeatsSyncKey = useMemo(
    () => resultDraftHeatsSyncKeyFromHeats(m?.heats),
    [m?.heats]
  );

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
    flushMarshalDraftsBeforeHeatClose,
    patchHeatCallClosed,
    patchHeatCallReopened,
    patchLaneCalled,
    removeMarshalDraftOp,
    handleMarshalResult,
    marshalSyncBusy,
  } = useMarshalDraftOps({
    eventId,
    m: marshalCtx,
    statusUpdatedAtByKey,
    marshalDraftSyncContext,
    marshalDraftSyncActive,
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
    heatResultConfirmBusyHeat,
    runUpTarget,
    setRunUpTarget,
    clearRunUpTarget,
    setClearRunUpTarget,
    runUpBusyHeat,
    runHeatResultRunUp,
    runHeatResultClearRunUp,
    handleRankRecorded,
    countResultDraftsForHeat,
    toggleResultDraft,
    rankedParticipantKeysForHeat,
    rankOrderKeysForHeatIndex,
    reorderResultRanks,
    reorderResultOrder,
    runHeatResultConfirm,
  } = useResultCaptureDraft({
    eventId,
    m: marshalCtx,
    resultDraftSyncContext,
    resultCaptureVisible,
    resultDraftSyncActive,
    resultCapture,
    heatsRef,
    resultDraftHeatsSyncKey,
  });

  useEffect(() => {
    const setDefer = m?.setMarshalSyncDeferred;
    const hasResultDrafts = Object.keys(resultDraftOps).length > 0;
    const confirming = heatResultConfirmBusyHeat !== null;
    const deferMarshal = marshalInline && marshalSyncBusy;
    const deferResult = resultCaptureVisible && (hasResultDrafts || confirming);
    setDefer?.(deferMarshal || deferResult);
    return () => {
      setDefer?.(false);
    };
  }, [
    marshalInline,
    marshalSyncBusy,
    resultCaptureVisible,
    resultDraftOps,
    heatResultConfirmBusyHeat,
    m?.setMarshalSyncDeferred,
  ]);

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
    flushMarshalDraftsBeforeHeatClose,
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
    removeMarshalDraftOp,
    handleMarshalResult,
    handleRankRecorded,
    setMarshalPendingKey,
    setResultCapturePendingKey,
    tieNextHeatIndexRef,
  });

  const heats = isTeam ? teamHeats : individualHeats;
  const previewStructure = displaySource === "previewStructure";

  if (previewStructure) {
    return (
      <LiveRoundStructurePreview
        heatCount={heats.length}
        marshalDisplayHeatIndices={marshalDisplayHeatIndices ?? []}
        previewEstimatedParticipants={previewEstimatedParticipants}
        previewMaxLanesPerHeat={previewMaxLanesPerHeat}
        displaySource={displaySource}
      />
    );
  }

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
        hasResultDraftOps={Object.keys(resultDraftOps).length > 0}
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
          rankOrderKeysForHeat={rankOrderKeysForHeatIndex}
          reorderResultOrder={reorderResultOrder}
          setHeatResultConfirmTarget={setHeatResultConfirmTarget}
          heatResultConfirmBusyHeat={heatResultConfirmBusyHeat}
          setRunUpTarget={setRunUpTarget}
          setClearRunUpTarget={setClearRunUpTarget}
          runUpBusyHeat={runUpBusyHeat}
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
        heatResultConfirmBusyHeat={heatResultConfirmBusyHeat}
        runHeatResultConfirm={runHeatResultConfirm}
        runUpTarget={runUpTarget}
        setRunUpTarget={setRunUpTarget}
        runUpBusyHeat={runUpBusyHeat}
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
