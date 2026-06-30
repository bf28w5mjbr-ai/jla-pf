import {
  BadgeCheck,
  ChevronDown,
  Coins,
  FileText,
  ListOrdered,
  Users,
} from "lucide-react";
import type { CompetitionPublicOverviewDetail } from "@/lib/competitionPublicPageLoader";
import { toIsoStringOrNull } from "@/lib/datetimeLocal";
import {
  buildParticipationEventSections,
  isUnassignedParticipationAgeBlock,
} from "@/lib/competitionPublicParticipationEvents";
import { resolveRelatedOrganizationsForDisplay } from "@/lib/competitionRelatedOrganizations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CompetitionEditorialSection,
  CompetitionFlatField,
} from "./competitionEditorialUi";
import { cn } from "@/lib/utils";
import {
  CompetitionAnnouncementsManagerLazy,
  CompetitionAttachmentsManagerLazy,
  CompetitionGalleryManagerLazy,
  CompetitionPublicGalleryLazy,
  CompetitionRelationsEditorLazy,
} from "./competitionPublicDynamicClients";
import {
  renderEntryFeeForCategories,
  renderParticipantEligibility,
  renderRequiredQualifications,
  showCertifiedLifesaverHelp,
} from "./competitionPublicOverviewRenderers";

type Props = {
  competition: CompetitionPublicOverviewDetail;
  hasIndividualEvents: boolean;
  hasTeamEvents: boolean;
  showEntryLinks: boolean;
  canEdit?: boolean;
  layout?: "classic" | "editorial";
};

export function CompetitionPublicOverviewPanel({
  competition,
  hasIndividualEvents,
  hasTeamEvents,
  showEntryLinks,
  canEdit = false,
  layout = "classic",
}: Props) {
  const isEditorial = layout === "editorial";
  const participationEventSections = buildParticipationEventSections(
    competition.events,
    competition.ageCategories
  );

  const entryFeeDisplay = renderEntryFeeForCategories(competition.entryFee, competition.ageCategories, {
    hasIndividualEvents,
    hasTeamEvents,
  });

  const participationBody = (
    <div className={cn(isEditorial ? "divide-y divide-border/40" : "divide-y divide-border")}>
              {competition.events.length > 0 ? (
                isEditorial ? (
                  <details className="group py-1">
                    <summary className="flex cursor-pointer list-none items-start gap-3.5 py-3 marker:content-none transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-border/55 bg-muted/20 text-muted-foreground shadow-sm">
                        <ListOrdered className="size-4" strokeWidth={1.75} aria-hidden />
                      </span>
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                          種目
                        </p>
                        <ChevronDown
                          className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                          aria-hidden
                        />
                      </div>
                    </summary>
                    <div className="flex flex-col gap-4 pb-2 pl-[2.875rem]">
                      {participationEventSections.map((section) => (
                        <div key={section.category}>
                          {participationEventSections.length > 1 ? (
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/75">
                              {section.label}
                            </p>
                          ) : null}
                          <div className="flex flex-col gap-3">
                            {section.ageBlocks.map((block) => {
                              const framed = section.ageBlocks.length > 1;
                              const showAgeLabel =
                                section.ageBlocks.length > 1 ||
                                (section.ageBlocks.length === 1 &&
                                  !isUnassignedParticipationAgeBlock(block));
                              return (
                                <div
                                  key={`${section.category}-${block.key}`}
                                  className={
                                    framed ? "border-t border-border/40 pt-3 first:border-t-0 first:pt-0" : undefined
                                  }
                                >
                                  {showAgeLabel ? (
                                    <p className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground">
                                      {block.title}
                                    </p>
                                  ) : null}
                                  <ul className="flex flex-col gap-2.5">
                                    {block.rows.map((row) => (
                                      <li key={row.key}>
                                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                          <span className="text-sm font-medium text-foreground">{row.name}</span>
                                          <span className="text-[11px] leading-snug text-muted-foreground">
                                            {row.metaLine}
                                          </span>
                                        </div>
                                        {row.scheduleLine ? (
                                          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/90">
                                            {row.scheduleLine}
                                          </p>
                                        ) : null}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : (
                <details className="group px-4 py-3 sm:px-5">
                  <summary className="flex cursor-pointer list-none items-start gap-3 marker:content-none [&::-webkit-details-marker]:hidden">
                    <ListOrdered className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" aria-hidden />
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                      <p className="text-xs font-medium text-muted-foreground">種目</p>
                      <ChevronDown
                        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                        aria-hidden
                      />
                    </div>
                  </summary>
                  <div className="mt-1.5 flex flex-col gap-4 pl-7">
                    {participationEventSections.map((section) => (
                      <div key={section.category}>
                        {participationEventSections.length > 1 ? (
                          <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-foreground/85">
                            {section.label}
                          </p>
                        ) : null}
                        <div className="flex flex-col gap-3">
                          {section.ageBlocks.map((block) => {
                            const framed = section.ageBlocks.length > 1;
                            const showAgeLabel =
                              section.ageBlocks.length > 1 ||
                              (section.ageBlocks.length === 1 &&
                                !isUnassignedParticipationAgeBlock(block));
                            return (
                              <div
                                key={`${section.category}-${block.key}`}
                                className={
                                  framed
                                    ? "rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 sm:px-3.5"
                                    : undefined
                                }
                              >
                                {showAgeLabel ? (
                                  <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">
                                    {block.title}
                                  </p>
                                ) : null}
                                <ul className="flex flex-col gap-2">
                                  {block.rows.map((row) => (
                                    <li key={row.key} className="text-sm">
                                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                        <span className="font-medium text-foreground">{row.name}</span>
                                        <span className="text-[11px] leading-snug text-muted-foreground">
                                          {row.metaLine}
                                        </span>
                                      </div>
                                      {row.scheduleLine ? (
                                        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                                          {row.scheduleLine}
                                        </p>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
                )
              ) : null}

              {competition.maxParticipants ? (
                isEditorial ? (
                  <CompetitionFlatField icon={Users} label="最大参加者数">
                    <p className="font-medium">{competition.maxParticipants.toLocaleString()}名</p>
                  </CompetitionFlatField>
                ) : (
                <div className="flex gap-3 px-4 py-3 sm:px-5">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground">最大参加者数</p>
                    <p className="mt-0.5 text-sm font-medium">
                      {competition.maxParticipants.toLocaleString()}名
                    </p>
                  </div>
                </div>
                )
              ) : null}

              {entryFeeDisplay !== null ? (
                isEditorial ? (
                  <CompetitionFlatField icon={Coins} label="参加費">
                    {entryFeeDisplay}
                  </CompetitionFlatField>
                ) : (
                <div className="flex gap-3 px-4 py-3 sm:px-5">
                  <Coins className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground">参加費</p>
                    <div className="mt-0.5">{entryFeeDisplay}</div>
                  </div>
                </div>
                )
              ) : null}

              {isEditorial ? (
                <CompetitionFlatField icon={BadgeCheck} label="参加資格">
                  {renderRequiredQualifications(
                    competition.requiredQualifications,
                    competition.ageCategories
                  )}
                  {showCertifiedLifesaverHelp(competition.requiredQualifications)}
                </CompetitionFlatField>
              ) : (
              <div className="flex gap-3 px-4 py-3 sm:px-5">
                <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">参加資格</p>
                  <div className="mt-1">
                    {renderRequiredQualifications(
                      competition.requiredQualifications,
                      competition.ageCategories
                    )}
                  </div>
                  {showCertifiedLifesaverHelp(competition.requiredQualifications)}
                </div>
              </div>
              )}

              {isEditorial ? (
                <CompetitionFlatField icon={FileText} label="参加対象者">
                  {renderParticipantEligibility(competition.participantEligibilityText)}
                </CompetitionFlatField>
              ) : (
              <div className="flex gap-3 px-4 py-3 sm:px-5">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">参加対象者</p>
                  <div className="mt-1">
                    {renderParticipantEligibility(competition.participantEligibilityText)}
                  </div>
                </div>
              </div>
              )}

    </div>
  );

  const showParticipation =
    competition.events.length > 0 ||
    competition.maxParticipants ||
    entryFeeDisplay !== null ||
    (showEntryLinks && (hasIndividualEvents || hasTeamEvents));

  return (
    <div className={cn(isEditorial ? "space-y-0" : "space-y-4")}>
      {showParticipation ? (
        isEditorial ? (
          <CompetitionEditorialSection
            subheading="Participation"
            title="参加情報"
            variant="flat"
            accent="orange"
          >
            {participationBody}
          </CompetitionEditorialSection>
        ) : (
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="border-b border-border/80 bg-muted/20 px-4 py-3 sm:px-5">
              <CardTitle className="text-base font-semibold tracking-tight">参加情報</CardTitle>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground sm:text-xs">
                種目・参加費・参加資格・対象者など、エントリー前にご確認ください。
              </p>
            </CardHeader>
            <CardContent className="p-0 sm:p-0">{participationBody}</CardContent>
          </Card>
        )
      ) : null}

      {competition.description ? (
        isEditorial ? (
          <CompetitionEditorialSection subheading="About" title="大会について" variant="flat" accent="muted">
            <div className="max-w-3xl whitespace-pre-wrap text-[0.9375rem] leading-[1.85] text-foreground/88">
              {competition.description}
            </div>
          </CompetitionEditorialSection>
        ) : (
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="border-b border-border/80 bg-muted/20 px-4 py-3 sm:px-5">
              <CardTitle className="text-base font-semibold tracking-tight">大会について</CardTitle>
            </CardHeader>
            <CardContent className="px-4 py-4 sm:px-5 sm:py-5">
              <div className="max-w-3xl whitespace-pre-wrap text-sm leading-[1.7] text-foreground/90">
                {competition.description}
              </div>
            </CardContent>
          </Card>
        )
      ) : null}

      {canEdit ? (
        <div className="rounded-xl border border-orange-300/35 bg-gradient-to-r from-orange-50/50 via-background to-background px-4 py-3 text-xs leading-relaxed text-muted-foreground dark:border-orange-800/40 dark:from-orange-950/25 dark:via-background">
          主催者としてログイン中です。お知らせ・関係組織・添付・ギャラリーはこのページから直接編集できます。
        </div>
      ) : null}

      <CompetitionRelationsEditorLazy
        competitionId={competition.id}
        relatedOrganizations={resolveRelatedOrganizationsForDisplay({
          relatedOrganizations: competition.relatedOrganizations,
        })}
        canEdit={canEdit}
        layout={layout}
      />

      {canEdit || competition.announcements.length > 0 ? (
        <CompetitionAnnouncementsManagerLazy
          competitionId={competition.id}
          initialAnnouncements={competition.announcements.map((a) => ({
            id: a.id,
            title: a.title,
            content: a.content,
            publishedAt: toIsoStringOrNull(a.publishedAt),
            createdAt: toIsoStringOrNull(a.createdAt) ?? "",
          }))}
          canEdit={canEdit}
          layout={layout}
        />
      ) : null}

      {canEdit || (competition.attachments?.length ?? 0) > 0 ? (
        <CompetitionAttachmentsManagerLazy
          competitionId={competition.id}
          initialAttachments={(competition.attachments ?? []).map((a) => ({
            id: a.id,
            fileName: a.fileName,
            fileUrl: a.fileUrl,
            fileSize: a.fileSize,
            mimeType: a.mimeType,
            createdAt: toIsoStringOrNull(a.createdAt) ?? "",
          }))}
          canEdit={canEdit}
          layout={layout}
        />
      ) : null}

      {canEdit ? (
        <CompetitionGalleryManagerLazy
          competitionId={competition.id}
          canEdit={canEdit}
          layout={layout}
          initialPhotos={competition.galleryPhotos.map((p) => ({
            id: p.id,
            imageUrl: p.imageUrl,
            fileName: p.fileName,
            createdAt: toIsoStringOrNull(p.createdAt) ?? "",
          }))}
        />
      ) : (
        <CompetitionPublicGalleryLazy photos={competition.galleryPhotos} layout={layout} />
      )}
    </div>
  );
}
