import type { ComponentProps } from "react";
import { prisma } from "@/server/db";
import CompetitionRelationsEditor from "@/components/CompetitionRelationsEditor";
import CompetitionAnnouncementsManager from "@/components/CompetitionAnnouncementsManager";
import CompetitionAttachmentsManager from "@/components/CompetitionAttachmentsManager";
import CompetitionGalleryManager from "@/components/CompetitionGalleryManager";
import CompetitionEntrySettingsEditor from "@/components/CompetitionEntrySettingsEditor";
import CompetitionParticipationConditionsEditor from "@/components/CompetitionParticipationConditionsEditor";
import CompetitionBasicInfoEditor from "@/components/CompetitionBasicInfoEditor";
import { loadCompetitionMutationState } from "@/lib/competitionPublishedEditRules";
import {
  COMPETITION_ADMIN_DATE_TIME_ZONE,
  formatDateForDatetimeLocalInput,
  toIsoStringOrNull,
} from "@/lib/datetimeLocal";
import { resolveRelatedOrganizationsForDisplay } from "@/lib/competitionRelatedOrganizations";
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
  const entryRowCount = await prisma.competitionEntry.count({ where: { competitionId } });
  const teamEntryRowCount = await prisma.teamEntry.count({ where: { competitionId } });
  const siblingCompetitionsForCopy = await prisma.competition.findMany({
    where: { organizationId, id: { not: competitionId } },
    orderBy: { startDate: "desc" },
    take: 40,
    select: { id: true, name: true, startDate: true },
  });

  const canEdit = true;
  const copyEntrySettingsAllowed = entryRowCount === 0 && teamEntryRowCount === 0;
  const copyEntrySettingsBlockedReason = copyEntrySettingsAllowed
    ? null
    : "エントリーが1件でもある大会では、種目・参加費のコピーはできません。";
  const allowMultipleEventEntries = competition.allowMultipleEventEntries ?? true;
  const maxEventEntriesPerPerson =
    typeof competition.maxEventEntriesPerPerson === "number" &&
    competition.maxEventEntriesPerPerson > 0
      ? competition.maxEventEntriesPerPerson
      : null;

  return (
    <div className="min-w-0 space-y-5">
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
          underAgeSystemEnabled: competition.underAgeSystemEnabled ?? false,
          underAgeUThresholds: competition.underAgeUThresholds ?? [],
          underAgeOpenEnabled: competition.underAgeOpenEnabled ?? true,
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
        siblingCompetitionsForCopy={siblingCompetitionsForCopy.map((c) => ({
          id: c.id,
          name: c.name,
          startDate: c.startDate.toISOString(),
        }))}
        copyEntrySettingsAllowed={copyEntrySettingsAllowed}
        copyEntrySettingsBlockedReason={copyEntrySettingsBlockedReason}
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
          underAgeSystemEnabled: competition.underAgeSystemEnabled ?? false,
          underAgeUThresholds: competition.underAgeUThresholds ?? [],
          underAgeOpenEnabled: competition.underAgeOpenEnabled ?? true,
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
        <OrgEditorialPanel accent="muted" className="mt-5">
          <OrgSubheading>About</OrgSubheading>
          <h3 className="mt-1 text-base font-semibold text-foreground">大会について</h3>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {competition.description}
          </p>
        </OrgEditorialPanel>
      ) : null}

      <CompetitionRelationsEditor
        competitionId={competition.id}
        relatedOrganizations={resolveRelatedOrganizationsForDisplay({
          relatedOrganizations: competition.relatedOrganizations,
        })}
        canEdit={canEdit}
      />

      <CompetitionAnnouncementsManager
        competitionId={competitionId}
        initialAnnouncements={competition.announcements.map((a) => ({
          ...a,
          createdAt: toIsoStringOrNull(a.createdAt) ?? "",
          updatedAt: toIsoStringOrNull(a.updatedAt) ?? "",
          publishedAt: toIsoStringOrNull(a.publishedAt),
        }))}
        canEdit={canEdit}
      />

      <CompetitionAttachmentsManager
        competitionId={competitionId}
        initialAttachments={competition.attachments.map((a) => ({
          ...a,
          createdAt: a.createdAt.toISOString(),
        }))}
        canEdit={canEdit}
      />

      <CompetitionGalleryManager
        competitionId={competitionId}
        canEdit={canEdit}
        initialPhotos={competition.galleryPhotos.map((p) => ({
          id: p.id,
          imageUrl: p.imageUrl,
          fileName: p.fileName,
          createdAt: p.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
