import { describe, expect, it } from "vitest";
import type { ResultDraftOp } from "@/hooks/liveRound/types";
import { computeProvisionalDraftRanks } from "@/lib/heatResultCaptureNextRank";
import {
  resolveTieWithPreviousForDraft,
  resolveTieWithPreviousForNfcAppend,
} from "@/hooks/liveRound/resultCaptureTieSession";

function draft(
  opKey: string,
  heatIndex: number,
  tieWithPrevious: boolean,
  epoch?: number
): ResultDraftOp {
  return {
    opKey,
    heatIndex,
    tieWithPrevious,
    inputOrder: "asc",
    participantType: "INDIVIDUAL",
    competitionEntryId: opKey,
    createdInTieSessionEpoch: epoch,
  };
}

describe("resolveTieWithPreviousForDraft", () => {
  it("同着オフでは常に false", () => {
    expect(
      resolveTieWithPreviousForDraft({
        tieModeOn: false,
        checked: true,
        heatIndex: 1,
        drafts: {},
        tieSessionEpoch: 1,
      })
    ).toEqual({ tieWithPrevious: false });
  });

  it("同着オン・セッション1人目は false + epoch", () => {
    const existing = {
      a: draft("a", 1, false),
      b: draft("b", 1, false),
    };
    expect(
      resolveTieWithPreviousForDraft({
        tieModeOn: true,
        checked: true,
        heatIndex: 1,
        drafts: existing,
        tieSessionEpoch: 2,
      })
    ).toEqual({ tieWithPrevious: false, createdInTieSessionEpoch: 2 });
  });

  it("同着オン・セッション2人目以降は true", () => {
    const existing = {
      c: draft("c", 1, false, 2),
    };
    expect(
      resolveTieWithPreviousForDraft({
        tieModeOn: true,
        checked: true,
        heatIndex: 1,
        drafts: existing,
        tieSessionEpoch: 2,
      })
    ).toEqual({ tieWithPrevious: true, createdInTieSessionEpoch: 2 });
  });

  it("旧セッション epoch の draft はカウントしない", () => {
    const existing = {
      old: draft("old", 1, true, 1),
    };
    expect(
      resolveTieWithPreviousForDraft({
        tieModeOn: true,
        checked: true,
        heatIndex: 1,
        drafts: existing,
        tieSessionEpoch: 3,
      })
    ).toEqual({ tieWithPrevious: false, createdInTieSessionEpoch: 3 });
  });
});

describe("同着セッション + 仮着順", () => {
  it("asc: 1・2位済みのあと同着セッションで C,D は 3位同着", () => {
    const epoch = 5;
    const first = resolveTieWithPreviousForDraft({
      tieModeOn: true,
      checked: true,
      heatIndex: 1,
      drafts: { a: draft("a", 1, false), b: draft("b", 1, false) },
      tieSessionEpoch: epoch,
    });
    const second = resolveTieWithPreviousForDraft({
      tieModeOn: true,
      checked: true,
      heatIndex: 1,
      drafts: {
        a: draft("a", 1, false),
        b: draft("b", 1, false),
        c: { ...draft("c", 1, first.tieWithPrevious, epoch), draftSequence: 3 },
      },
      tieSessionEpoch: epoch,
    });
    const ranks = computeProvisionalDraftRanks({
      serverRanks: [1, 2],
      drafts: [
        { key: "c", seq: 3, tieWithPrevious: first.tieWithPrevious },
        { key: "d", seq: 4, tieWithPrevious: second.tieWithPrevious },
      ],
      inputOrder: "asc",
      calledN: 8,
    });
    expect(ranks.get("c")).toBe(3);
    expect(ranks.get("d")).toBe(3);
  });
});

describe("resolveTieWithPreviousForNfcAppend", () => {
  it("同着オフは false", () => {
    expect(
      resolveTieWithPreviousForNfcAppend({
        tieModeOn: false,
        heatIndex: 1,
        nfcTieSessionStarted: true,
      })
    ).toBe(false);
  });

  it("同着オン・未開始は false、開始後は true", () => {
    expect(
      resolveTieWithPreviousForNfcAppend({
        tieModeOn: true,
        heatIndex: 1,
        nfcTieSessionStarted: false,
      })
    ).toBe(false);
    expect(
      resolveTieWithPreviousForNfcAppend({
        tieModeOn: true,
        heatIndex: 1,
        nfcTieSessionStarted: true,
      })
    ).toBe(true);
  });
});
