import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrganizerLifecycleError } from "@/lib/organizerLifecycle";

const { findUniqueMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    competition: {
      findUnique: findUniqueMock,
    },
  },
}));

import { requireHostOrgAdminForCompetition } from "./organizerAccess";

describe("requireHostOrgAdminForCompetition", () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
  });

  it("rejects when competition not found", async () => {
    findUniqueMock.mockResolvedValue(null);
    await expect(
      requireHostOrgAdminForCompetition("comp-1", "user-1")
    ).rejects.toMatchObject({
      code: "COMPETITION_NOT_FOUND",
    } satisfies Partial<OrganizerLifecycleError>);
  });

  it("rejects PENDING organization", async () => {
    findUniqueMock.mockResolvedValue({
      organizationId: "org-1",
      organization: {
        status: "PENDING",
        admins: [{ role: "ADMIN" }],
      },
    });
    await expect(
      requireHostOrgAdminForCompetition("comp-1", "user-1")
    ).rejects.toMatchObject({ code: "ORG_ADMIN_REQUIRED" });
  });

  it("rejects MEMBER role", async () => {
    findUniqueMock.mockResolvedValue({
      organizationId: "org-1",
      organization: {
        status: "APPROVED",
        admins: [{ role: "MEMBER" }],
      },
    });
    await expect(
      requireHostOrgAdminForCompetition("comp-1", "user-1")
    ).rejects.toMatchObject({ code: "ORG_ADMIN_REQUIRED" });
  });

  it("allows APPROVED org with ADMIN", async () => {
    findUniqueMock.mockResolvedValue({
      organizationId: "org-1",
      organization: {
        status: "APPROVED",
        admins: [{ role: "ADMIN" }],
      },
    });
    await expect(
      requireHostOrgAdminForCompetition("comp-1", "user-1")
    ).resolves.toEqual({
      organizationId: "org-1",
      organizationStatus: "APPROVED",
    });
  });
});
