import type { ComponentProps } from "react";
import { prisma } from "@/server/db";
import CompetitionEntrySettingsEditor from "@/components/CompetitionEntrySettingsEditor";
import CompetitionParticipationConditionsEditor from "@/components/CompetitionParticipationConditionsEditor";
import CompetitionBasicInfoEditor from "@/components/CompetitionBasicInfoEditor";
import { loadCompetitionMutationState } from "@/lib/competitionPublishedEditRules";
import {
  COMPETITION_ADMIN_DATE_TIME_ZONE,
  formatDateForDatetimeLocalInput,
} from "@/lib/datetimeLocal";
import { getCachedQualificationTemplates } from "@/lib/qualificationTemplatesCache";
import { buildCompetitionManagementIncludeForPageTab } from "@/lib/competitionManagementQueries";
import {
  OrgEditorialPanel,
  OrgSubheading,
} from "../../../_components/organizationEditorialUi";

type EntrySettingsEditorProps = ComponentProps<typeof CompetitionEntrySettingsEditor>;

export default async function CompetitionManagementPageTab({
  organizationId,
  competitionId,
  userId,
}: {
  organizationId: string;
  competitionId: string;
  userId: string;
}) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: buildCompetitionManagementIncludeForPageTab(userId),
  });
  if (!competition) {
    return null;
  }

  const entryMutationState = await loadCompetitionMutationState(competitionId);
  const qualificationTemplates = await getCachedQualificationTemplates();

  const canEdit = true;
  const allowMultipleEventEntries = competition.allowMultipleEventEntries ?? true;
  const maxEventEntriesPerPerson =
    typeof competition.maxEventEntriesPerPerson === "number" &&
    competition.maxEventEntriesPerPerson > 0
      ? competition.maxEventEntriesPerPerson
      : null;

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border/50 bg-background">
      <div className="divide-y divide-border/40 px-4 sm:px-5">
      <CompetitionBasicInfoEditor
        competitionId={competition.id}
        canEdit={canEdit}
        initialData={{
          name: competition.name,
          category: competition.category,
          startDate: competition.startDate.toISOString().slice(0, 10),
          endDate: competition.endDate.toISOString().slice(0, 10),
          entryStartDate: competition.entryStartDate
            ? formatDateForDatetimeLocalInput(competition.entryStartDate, {
                timeZone: COMPETITION_ADMIN_DATE_TIME_ZONE,
              })
            : "",
          entryEndDate: competition.entryEndDate
            ? formatDateForDatetimeLocalInput(competition.entryEndDate, {
                timeZone: COMPETITION_ADMIN_DATE_TIME_ZONE,
              })
            : "",
          venue: competition.venue,
          requireClubMembership: competition.requireClubMembership ?? false,
        }}
      />

      <CompetitionParticipationConditionsEditor
        competitionId={competitionId}
        canEdit={canEdit}
        isPublished={competition.isPublished}
        requiresParticipantNotice={
          entryMutationState.isPublished && entryMutationState.hasEstablishedEntry
        }
        settingsVersion={competition.updatedAt.toISOString()}
        initialData={{
          entryStartDate: competition.entryStartDate,
          entryEndDate: competition.entryEndDate,
          entryFee: competition.entryFee as unknown as NonNullable<
            EntrySettingsEditorProps["initialData"]
          >["entryFee"],
          requiredQualifications: competition.requiredQualifications as unknown,
          participantEligibilityText: competition.participantEligibilityText,
          allowMultipleEventEntries,
          maxEventEntriesPerPerson,
          requireClubMembership: competition.requireClubMembership ?? false,
          minAge: competition.minAge,
          maxAge: competition.maxAge,
          competitionCategory: competition.category,
          entryPledgeEnabled: competition.entryPledgeEnabled ?? false,
          entryPledgeText: competition.entryPledgeText,
          entryPledgeLockNoOffer: competition.entryPledgeLockNoOffer ?? false,
          competitionStartDate: competition.startDate,
        }}
        initialEvents={
          competition.events.map((e) => ({
            ...e,
            sex: e.sex as "MALE" | "FEMALE",
            minAge: e.minAge,
            maxAge: e.maxAge,
            ageCategoryId: e.ageCategoryId ?? null,
            createdAt: e.createdAt.toISOString(),
            updatedAt: e.updatedAt.toISOString(),
          })) as unknown as NonNullable<EntrySettingsEditorProps["initialEvents"]>
        }
        initialAgeCategories={competition.ageCategories.map((c) => ({
          id: c.id,
          name: c.name,
          displayOrder: c.displayOrder,
          eligibleBirthDateFrom: c.eligibleBirthDateFrom,
          eligibleBirthDateTo: c.eligibleBirthDateTo,
        }))}
        qualificationTemplates={qualificationTemplates.map((template) => ({
          id: template.id,
          name: template.name,
          kind: template.kind,
        }))}
      />

      <CompetitionEntrySettingsEditor
        competitionId={competitionId}
        canEdit={canEdit}
        isPublished={competition.isPublished}
        requiresParticipantNotice={
          entryMutationState.isPublished && entryMutationState.hasEstablishedEntry
        }
        settingsVersion={competition.updatedAt.toISOString()}
        initialData={{
          entryStartDate: competition.entryStartDate,
          entryEndDate: competition.entryEndDate,
          entryFee: competition.entryFee as unknown as NonNullable<
            EntrySettingsEditorProps["initialData"]
          >["entryFee"],
          requiredQualifications: competition.requiredQualifications as unknown,
          participantEligibilityText: competition.participantEligibilityText,
          allowMultipleEventEntries,
          maxEventEntriesPerPerson,
          requireClubMembership: competition.requireClubMembership ?? false,
          minAge: competition.minAge,
          maxAge: competition.maxAge,
          competitionCategory: competition.category,
          entryPledgeEnabled: competition.entryPledgeEnabled ?? false,
          entryPledgeText: competition.entryPledgeText,
          entryPledgeLockNoOffer: competition.entryPledgeLockNoOffer ?? false,
        }}
        initialEvents={
          competition.events.map((e) => ({
            ...e,
            sex: e.sex as "MALE" | "FEMALE",
            minAge: e.minAge,
            maxAge: e.maxAge,
            ageCategoryId: e.ageCategoryId ?? null,
            createdAt: e.createdAt.toISOString(),
            updatedAt: e.updatedAt.toISOString(),
          })) as unknown as NonNullable<EntrySettingsEditorProps["initialEvents"]>
        }
        initialAgeCategories={competition.ageCategories.map((c) => ({
          id: c.id,
          name: c.name,
          displayOrder: c.displayOrder,
          eligibleBirthDateFrom: c.eligibleBirthDateFrom,
          eligibleBirthDateTo: c.eligibleBirthDateTo,
        }))}
        qualificationTemplates={qualificationTemplates.map((template) => ({
          id: template.id,
          name: template.name,
          kind: template.kind,
        }))}
      />

      {competition.description ? (
        <div className="py-4">
          <OrgEditorialPanel accent="muted" className="border-0 bg-transparent p-0 shadow-none">
            <OrgSubheading>About</OrgSubheading>
            <h3 className="mt-1 text-base font-semibold text-foreground">大会について</h3>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {competition.description}
            </p>
          </OrgEditorialPanel>
        </div>
      ) : null}
      </div>
    </div>
  );
}
