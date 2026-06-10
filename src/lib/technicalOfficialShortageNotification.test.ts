import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTechnicalOfficialShortageNotificationContent,
  syncTechnicalOfficialShortageNotificationsForUser,
  technicalOfficialShortageRelatedId,
} from "./technicalOfficialShortageNotification";

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

vi.mock("./technicalOfficialQueries", () => ({
  listClubAdminTechnicalOfficialAlerts: vi.fn(),
}));

import { revalidateTag } from "next/cache";
import { listClubAdminTechnicalOfficialAlerts } from "./technicalOfficialQueries";

const alert = {
  clubId: "club-1",
  clubName: "西浜SC",
  competitionId: "comp-1",
  competitionName: "春季大会",
  shortage: 2,
  required: 3,
  assigned: 1,
};

describe("technicalOfficialShortageRelatedId", () => {
  it("joins club and competition ids", () => {
    expect(technicalOfficialShortageRelatedId("club-1", "comp-1")).toBe("club-1:comp-1");
  });
});

describe("buildTechnicalOfficialShortageNotificationContent", () => {
  it("includes club, competition, and shortage counts", () => {
    const content = buildTechnicalOfficialShortageNotificationContent(alert);
    expect(content.title).toBe("テクニカルオフィシャルが不足しています");
    expect(content.body).toContain("西浜SC");
    expect(content.body).toContain("春季大会");
    expect(content.body).toContain("不足 2 人");
    expect(content.linkUrl).toBe("/clubs/club-1?tab=competitions");
  });
});

describe("syncTechnicalOfficialShortageNotificationsForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips sync for non-club-admin users", async () => {
    const db = {
      membership: { count: vi.fn().mockResolvedValue(0) },
      notification: {
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    } as never;

    const result = await syncTechnicalOfficialShortageNotificationsForUser("user-1", db);

    expect(result).toEqual({ created: 0, updated: 0, removed: 0 });
    expect(listClubAdminTechnicalOfficialAlerts).not.toHaveBeenCalled();
  });

  it("creates notifications for active shortages", async () => {
    vi.mocked(listClubAdminTechnicalOfficialAlerts).mockResolvedValue([alert]);

    const create = vi.fn().mockResolvedValue({ id: "n1" });
    const update = vi.fn();
    const deleteFn = vi.fn();
    const findMany = vi.fn().mockResolvedValue([]);

    const db = {
      membership: { count: vi.fn().mockResolvedValue(1) },
      notification: { findMany, create, update, delete: deleteFn },
    } as never;

    const result = await syncTechnicalOfficialShortageNotificationsForUser("user-1", db);

    expect(result).toEqual({ created: 1, updated: 0, removed: 0 });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        type: "TECHNICAL_OFFICIAL_SHORTAGE",
        relatedId: "club-1:comp-1",
        read: false,
      }),
    });
    expect(revalidateTag).toHaveBeenCalledWith("notification-unread-count-user-1", "max");
  });

  it("removes notifications when shortage is resolved", async () => {
    vi.mocked(listClubAdminTechnicalOfficialAlerts).mockResolvedValue([]);

    const findMany = vi.fn().mockResolvedValue([
      { id: "n-old", relatedId: "club-1:comp-1", body: "old" },
    ]);
    const deleteFn = vi.fn().mockResolvedValue({ id: "n-old" });

    const db = {
      membership: { count: vi.fn().mockResolvedValue(1) },
      notification: {
        findMany,
        create: vi.fn(),
        update: vi.fn(),
        delete: deleteFn,
      },
    } as never;

    const result = await syncTechnicalOfficialShortageNotificationsForUser("user-1", db);

    expect(result).toEqual({ created: 0, updated: 0, removed: 1 });
    expect(deleteFn).toHaveBeenCalledWith({ where: { id: "n-old" } });
  });

  it("updates body and marks unread when shortage counts change", async () => {
    vi.mocked(listClubAdminTechnicalOfficialAlerts).mockResolvedValue([
      { ...alert, shortage: 3, assigned: 0 },
    ]);

    const findMany = vi.fn().mockResolvedValue([
      {
        id: "n1",
        relatedId: "club-1:comp-1",
        body: "西浜SC · 春季大会（必要 3 人 / 充足 1 人 · 不足 2 人）",
      },
    ]);
    const update = vi.fn().mockResolvedValue({ id: "n1" });

    const db = {
      membership: { count: vi.fn().mockResolvedValue(1) },
      notification: {
        findMany,
        create: vi.fn(),
        update,
        delete: vi.fn(),
      },
    } as never;

    const result = await syncTechnicalOfficialShortageNotificationsForUser("user-1", db);

    expect(result).toEqual({ created: 0, updated: 1, removed: 0 });
    expect(update).toHaveBeenCalledWith({
      where: { id: "n1" },
      data: expect.objectContaining({
        read: false,
        body: expect.stringContaining("不足 3 人"),
      }),
    });
  });
});
