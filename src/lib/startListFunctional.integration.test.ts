/**
 * 実DBスタートリスト統合テスト（PostgreSQL 起動が必要）。
 * START_LIST_INTEGRATION_TEST=1 のときだけ接続を試み、接続できなければスキップ（失敗にしない）。
 *
 *   pnpm test:start-list:integration
 *   pnpm test:start-list:db   （シード後に本ファイルのみ実行）
 */
/** @vitest-environment node */

import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { competitionEntryEligibleForStartListWhere } from "./entryCheckoutSessionPaid";
import { computeHeatCountFromMaxLanes } from "./startListRounds";

const COMPETITION_NAME = "POTATO CHALLENGE Yuigahama IRON";
const EVENT_NAME = "OCEAN WOMAN";

const shouldAttempt =
  process.env.START_LIST_INTEGRATION_TEST === "1" && Boolean(process.env.DATABASE_URL);

let integrationEnabled = false;

if (shouldAttempt) {
  const probe = new PrismaClient();
  try {
    await probe.$connect();
    await probe.$queryRaw`SELECT 1`;
    integrationEnabled = true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      "\n[スタートリスト統合] PostgreSQL に接続できません。統合テストをスキップします。\n" +
        "  · Postgres を起動する（例: Docker、brew services、Supabase ローカル）\n" +
        "  · .env.local の DATABASE_URL が正しいか確認する\n" +
        `  · ${msg.split("\n")[0]}\n`
    );
  } finally {
    await probe.$disconnect().catch(() => {});
  }
}

describe.skipIf(!integrationEnabled)("スタートリスト統合（DB: POTATO / OCEAN WOMAN 100人）", () => {
  afterAll(async () => {
    const { prisma } = await import("@/server/db");
    await prisma.$disconnect();
  });

  it("スナップショット生成後、OCEAN WOMAN は計100人・各ヒート≤16・ヒート数はアルゴリズム値", async () => {
    const { prisma } = await import("@/server/db");
    const { replaceCompetitionStartListSnapshot } = await import("@/lib/startListSnapshot");

    const competition = await prisma.competition.findFirst({
      where: { name: COMPETITION_NAME },
      select: { id: true },
    });
    if (!competition) {
      throw new Error(
        `大会が見つかりません。先に: pnpm seed:potato-ocean-woman （${COMPETITION_NAME}）`
      );
    }

    const event = await prisma.event.findFirst({
      where: { competitionId: competition.id, name: EVENT_NAME },
      select: { id: true, preliminaryHeatLaneCount: true },
    });
    if (!event) {
      throw new Error(`種目が見つかりません: ${EVENT_NAME}。pnpm seed:potato-ocean-woman を実行してください。`);
    }
    expect(event.preliminaryHeatLaneCount).toBe(16);

    const entryCount = await prisma.competitionEntry.count({
      where: {
        competitionId: competition.id,
        status: "SUBMITTED",
        ...competitionEntryEligibleForStartListWhere,
        items: { some: { eventId: event.id } },
      },
    });
    expect(entryCount).toBeGreaterThanOrEqual(100);

    await prisma.competitionStartListSnapshot.deleteMany({
      where: { competitionId: competition.id },
    });

    const result = await replaceCompetitionStartListSnapshot({
      competitionId: competition.id,
    });
    expect(result.ok).toBe(true);

    const snap = await prisma.competitionStartListSnapshot.findUnique({
      where: { competitionId: competition.id },
      select: { data: true },
    });
    expect(snap?.data).toBeTruthy();

    const data = snap!.data as {
      events?: Array<{
        eventId: string;
        rounds?: Array<{
          round: string;
          heats?: Array<{ heatIndex: number; participants: unknown[] }>;
        }>;
      }>;
    };
    const ev = data.events?.find((e) => e.eventId === event.id);
    expect(ev).toBeTruthy();

    const L = event.preliminaryHeatLaneCount ?? 16;
    const expectedHeats = computeHeatCountFromMaxLanes(entryCount, L);
    expect(expectedHeats).toBeGreaterThan(0);

    const heatRound = ev!.rounds?.find((r) => r.round === "HEAT");
    expect(heatRound?.heats?.length).toBe(expectedHeats);

    const heats = heatRound!.heats!;
    let total = 0;
    for (const h of heats) {
      expect(h.participants.length).toBeGreaterThan(0);
      expect(h.participants.length).toBeLessThanOrEqual(L);
      total += h.participants.length;
    }
    expect(total).toBe(entryCount);
  });
});
