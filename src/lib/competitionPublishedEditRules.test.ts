import { describe, expect, it } from "vitest";
import type { Competition } from "@prisma/client";
import {
  assertEntryFeeEditable,
  assertEntrySettingsChange,
  assertEventAddAllowed,
  assertEventDeletionAllowed,
  assertRequiredQualificationsChange,
  CompetitionEditForbiddenError,
} from "./competitionPublishedEditRules";

function createCompetition(overrides: Partial<Competition> = {}): Competition {
  return {
    id: "comp_test",
    organizationId: "org_test",
    hostOrganizationName: null,
    hostOrganizationNameKana: null,
    hostOrganizationAbbreviation: null,
    name: "テスト大会",
    nameKana: null,
    description: null,
    category: null,
    competitionType: null,
    startDate: new Date("2026-08-01T09:00:00.000Z"),
    endDate: new Date("2026-08-02T17:00:00.000Z"),
    venue: "テスト会場",
    venueAddress: null,
    entryStartDate: new Date("2026-07-01T00:00:00.000Z"),
    entryEndDate: new Date("2026-07-20T23:59:59.000Z"),
    maxParticipants: null,
    entryFee: null,
    requiredQualifications: [],
    participantEligibilityText: null,
    allowMultipleEventEntries: true,
    maxEventEntriesPerPerson: null,
    requireClubMembership: false,
    startListSettings: null,
    minAge: null,
    maxAge: null,
    entryPledgeEnabled: false,
    entryPledgeText: null,
    entryPledgeLockNoOffer: false,
    allowedClubTypes: [],
    officialPositions: null,
    officialRecruitmentEnabled: true,
    officialQualificationFilterEnabled: false,
    technicalOfficialRecruitmentEnabled: true,
    technicalOfficialQualificationTemplateId: null,
    technicalOfficialTiers: null,
    sponsors: null,
    cooperators: null,
    cooperatorsLogos: null,
    supporters: null,
    grants: null,
    grantsLogos: null,
    status: "DRAFT",
    isPublished: false,
    publishedAt: null,
    dayOpsAccessSecretHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("competitionPublishedEditRules", () => {
  it("blocks entry fee updates after payment flow started", () => {
    expect(() =>
      assertEntryFeeEditable({
        isPublished: true,
        hasPaymentFlowStarted: true,
        hasEstablishedEntry: false,
      })
    ).toThrowError(CompetitionEditForbiddenError);
  });

  it("allows entry fee update when unpublished", () => {
    expect(() =>
      assertEntryFeeEditable({
        isPublished: false,
        hasPaymentFlowStarted: true,
        hasEstablishedEntry: true,
      })
    ).not.toThrow();
  });

  it("blocks period extension after established entry when no announcement", () => {
    const competition = createCompetition({
      isPublished: true,
    });
    expect(() =>
      assertEntrySettingsChange(
        competition,
        { entryEndDate: "2026-07-25T23:59:59.000Z" },
        {
          isPublished: true,
          hasPaymentFlowStarted: true,
          hasEstablishedEntry: true,
        }
      )
    ).toThrowError(CompetitionEditForbiddenError);
  });

  it("allows qualification relaxation with announcement", () => {
    const competition = createCompetition({
      isPublished: true,
      requiredQualifications: ["選手登録", "BLS・WS"],
    });
    expect(() =>
      assertRequiredQualificationsChange(
        competition,
        ["選手登録"],
        {
          isPublished: true,
          hasPaymentFlowStarted: true,
          hasEstablishedEntry: true,
        },
        "資格条件を緩和しました。"
      )
    ).not.toThrow();
  });

  it("blocks event deletion after established entry", () => {
    expect(() =>
      assertEventDeletionAllowed({
        isPublished: true,
        hasPaymentFlowStarted: true,
        hasEstablishedEntry: true,
      })
    ).toThrowError(CompetitionEditForbiddenError);
  });

  it("blocks tightening max event entry limit after established entry", () => {
    const competition = createCompetition({
      isPublished: true,
      maxEventEntriesPerPerson: null,
    });
    expect(() =>
      assertEntrySettingsChange(
        competition,
        { maxEventEntriesPerPerson: 2 },
        {
          isPublished: true,
          hasPaymentFlowStarted: true,
          hasEstablishedEntry: true,
        }
      )
    ).toThrowError(CompetitionEditForbiddenError);
  });

  it("requires announcement when adding event after established entry", () => {
    expect(() =>
      assertEventAddAllowed(
        {
          isPublished: true,
          hasPaymentFlowStarted: true,
          hasEstablishedEntry: true,
        },
        undefined
      )
    ).toThrowError(CompetitionEditForbiddenError);
  });
});
