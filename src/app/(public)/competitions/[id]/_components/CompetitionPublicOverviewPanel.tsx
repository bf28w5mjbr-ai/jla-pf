import {
  BadgeCheck,
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
import { relationLogosWithDisplaySrc } from "@/lib/relationLogos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CompetitionAnnouncementsManagerLazy,
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
};

export function CompetitionPublicOverviewPanel({
  competition,
  hasIndividualEvents,
  hasTeamEvents,
  showEntryLinks,
}: Props) {
  const participationEventSections = buildParticipationEventSections(
    competition.events,
    competition.ageCategories
  );

  const entryFeeDisplay = renderEntryFeeForCategories(competition.entryFee, competition.ageCategories, {
    hasIndividualEvents,
    hasTeamEvents,
  });

  return (
    <div className="space-y-4">
      {(competition.events.length > 0 ||
        competition.maxParticipants ||
        entryFeeDisplay !== null ||
        (showEntryLinks && (hasIndividualEvents || hasTeamEvents))) && (
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="border-b border-border/80 bg-muted/20 px-4 py-3 sm:px-5">
            <CardTitle className="text-base font-semibold tracking-tight">参加情報</CardTitle>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground sm:text-xs">
              種目・参加費・参加資格・対象者など、エントリー前にご確認ください。
            </p>
          </CardHeader>
          <CardContent className="p-0 sm:p-0">
            <div className="divide-y divide-border">
              {competition.events.length > 0 ? (
                <div className="flex gap-3 px-4 py-3 sm:px-5">
                  <ListOrdered className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground">種目</p>
                    <div className="mt-1.5 flex flex-col gap-4">
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
                  </div>
                </div>
              ) : null}

              {competition.maxParticipants ? (
                <div className="flex gap-3 px-4 py-3 sm:px-5">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground">最大参加者数</p>
                    <p className="mt-0.5 text-sm font-medium">
                      {competition.maxParticipants.toLocaleString()}名
                    </p>
                  </div>
                </div>
              ) : null}

              {entryFeeDisplay !== null ? (
                <div className="flex gap-3 px-4 py-3 sm:px-5">
                  <Coins className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground">参加費</p>
                    <div className="mt-0.5">{entryFeeDisplay}</div>
                  </div>
                </div>
              ) : null}

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

              <div className="flex gap-3 px-4 py-3 sm:px-5">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground">参加対象者</p>
                  <div className="mt-1">
                    {renderParticipantEligibility(competition.participantEligibilityText)}
                  </div>
                </div>
              </div>

            </div>
          </CardContent>
        </Card>
      )}

      {competition.description ? (
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
      ) : null}

      <CompetitionRelationsEditorLazy
        competitionId={competition.id}
        sponsors={competition.sponsors}
        cooperators={competition.cooperators}
        cooperatorsLogos={relationLogosWithDisplaySrc(competition.cooperatorsLogos)}
        supporters={competition.supporters}
        grants={competition.grants}
        grantsLogos={relationLogosWithDisplaySrc(competition.grantsLogos)}
        canEdit={false}
      />

      {competition.announcements.length > 0 ? (
        <CompetitionAnnouncementsManagerLazy
          competitionId={competition.id}
          initialAnnouncements={competition.announcements.map((a) => ({
            id: a.id,
            title: a.title,
            content: a.content,
            publishedAt: toIsoStringOrNull(a.publishedAt),
            createdAt: toIsoStringOrNull(a.createdAt) ?? "",
          }))}
          canEdit={false}
        />
      ) : null}

      <CompetitionPublicGalleryLazy photos={competition.galleryPhotos} />
    </div>
  );
}
