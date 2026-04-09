/**
 * スタートリスト機能テスト（モックのみ・常に実行）。
 *
 * 実DBの統合テストは `startListFunctional.integration.test.ts`（DB未起動時はスキップ）。
 *
 *   pnpm test:start-list              # 本ファイルのみ
 *   pnpm test:start-list:integration  # 統合のみ（START_LIST_INTEGRATION_TEST=1）
 *   pnpm test:start-list:db           # シード + モック + 統合
 */
/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
  buildInitialHeatsWithClubDispersion,
  computeHeatCountFromMaxLanes,
  type StartListParticipant,
} from "./startListRounds";

const ENTRIES_PER_CLUB = [2, 3, 5, 8, 10, 12, 15, 20, 25];

function buildPotatoLikeParticipants(): StartListParticipant[] {
  const out: StartListParticipant[] = [];
  let idx = 0;
  for (let ci = 0; ci < ENTRIES_PER_CLUB.length; ci += 1) {
    const n = ENTRIES_PER_CLUB[ci];
    const clubId = `seed-club-${ci + 1}`;
    for (let j = 0; j < n; j += 1) {
      out.push({
        kind: "INDIVIDUAL",
        entryId: `entry-${idx}`,
        userId: `user-${idx}`,
        name: `IronTeam${ci + 1} Member${j + 1}`,
        clubId,
        clubName: `POTATO IRON TC ${ci + 1}`,
      });
      idx += 1;
    }
  }
  return out;
}

describe("スタートリスト（モック: 100人・9クラブ・最大16レーン）", () => {
  it("ヒート数は ceil(100/16)=7", () => {
    expect(computeHeatCountFromMaxLanes(100, 16)).toBe(7);
  });

  it("クラブ分散後も合計100人・7ヒート・各ヒート≤16・重複なし", () => {
    const participants = buildPotatoLikeParticipants();
    expect(participants).toHaveLength(100);

    const heatCount = computeHeatCountFromMaxLanes(participants.length, 16);
    expect(heatCount).toBe(7);
    if (heatCount === null) throw new Error("heatCount");

    const heats = buildInitialHeatsWithClubDispersion(participants, heatCount);
    expect(heats).toHaveLength(heatCount);

    const sizes = heats.map((h) => h.participants.length);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(100);
    for (const s of sizes) {
      expect(s).toBeLessThanOrEqual(16);
      expect(s).toBeGreaterThan(0);
    }

    const seen = new Set<string>();
    for (const h of heats) {
      for (const p of h.participants) {
        if (p.kind === "INDIVIDUAL") {
          expect(seen.has(p.entryId)).toBe(false);
          seen.add(p.entryId);
        }
      }
    }
    expect(seen.size).toBe(100);
  });
});
