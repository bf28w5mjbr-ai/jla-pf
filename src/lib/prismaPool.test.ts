import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  isPrismaConnectionPoolTimeout,
  isPrismaMaxClientConnections,
  isPrismaPoolRetryable,
} from "./prismaPool";

describe("prismaPool", () => {
  it("detects P2024", () => {
    const err = new Prisma.PrismaClientKnownRequestError("pool timeout", {
      code: "P2024",
      clientVersion: "test",
    });
    expect(isPrismaConnectionPoolTimeout(err)).toBe(true);
    expect(isPrismaPoolRetryable(err)).toBe(true);
  });

  it("detects Supabase EMAXCONN in unknown request errors", () => {
    const err = new Prisma.PrismaClientUnknownRequestError(
      "Error in connector: FATAL: (EMAXCONN) max client connections reached, limit: 200",
      { clientVersion: "test" }
    );
    expect(isPrismaMaxClientConnections(err)).toBe(true);
    expect(isPrismaPoolRetryable(err)).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isPrismaPoolRetryable(new Error("other"))).toBe(false);
  });
});
