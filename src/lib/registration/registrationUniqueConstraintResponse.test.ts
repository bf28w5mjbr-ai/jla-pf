import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { registrationUniqueConstraintResponse } from "@/lib/registration/registrationUniqueConstraintResponse";

function p2002(target: string[] | string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint", {
    code: "P2002",
    clientVersion: "test",
    meta: { target },
  });
}

describe("registrationUniqueConstraintResponse", () => {
  it("maps email unique violation to 409 with existingUser", async () => {
    const res = registrationUniqueConstraintResponse(p2002(["email"]));
    expect(res?.status).toBe(409);
    const body = await res!.json();
    expect(body.existingUser).toBe(true);
    expect(body.error).toContain("メールアドレス");
  });

  it("maps profile unique violation to 409 with existingUser", async () => {
    const res = registrationUniqueConstraintResponse(
      p2002(["normalizedFamilyName", "normalizedGivenName", "dateOfBirth"])
    );
    expect(res?.status).toBe(409);
    const body = await res!.json();
    expect(body.existingUser).toBe(true);
    expect(body.error).toContain("氏名・生年月日");
  });

  it("returns null for non-P2002 errors", () => {
    const err = new Prisma.PrismaClientKnownRequestError("Not found", {
      code: "P2025",
      clientVersion: "test",
    });
    expect(registrationUniqueConstraintResponse(err)).toBeNull();
  });
});
