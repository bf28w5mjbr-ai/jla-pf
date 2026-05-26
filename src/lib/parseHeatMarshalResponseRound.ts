import type { ResultRound } from "@prisma/client";

const RESULT_ROUNDS = ["HEAT", "SEMI", "FINAL"] as const;

export function parseHeatMarshalResponseRound(raw: unknown): ResultRound | null {
  if (typeof raw !== "string") return null;
  return (RESULT_ROUNDS as readonly string[]).includes(raw) ? (raw as ResultRound) : null;
}
