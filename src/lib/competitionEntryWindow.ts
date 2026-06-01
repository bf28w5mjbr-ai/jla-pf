export type HeroEntryDisplayMode = "full" | "preview";

export type HeroEntryDisplay = {
  showSection: boolean;
  mode: HeroEntryDisplayMode | null;
  isEntryWindowOpen: boolean;
};

export function isCompetitionEntryWindowOpen(
  now: Date,
  entryStart: Date | null,
  entryEnd: Date | null
): boolean {
  if (entryStart === null || entryEnd === null) return false;
  return now >= entryStart && now <= entryEnd;
}

/** 公開大会ヒーロー「エントリー」セクションの表示モード */
export function resolveHeroEntryDisplay(params: {
  now: Date;
  entryStart: Date | null;
  entryEnd: Date | null;
  isOrgAdmin: boolean;
  showEntryLinksBase: boolean;
}): HeroEntryDisplay {
  const { now, entryStart, entryEnd, isOrgAdmin, showEntryLinksBase } = params;

  const hasEntryPeriod = entryStart !== null && entryEnd !== null;
  const isEntryWindowOpen = isCompetitionEntryWindowOpen(now, entryStart, entryEnd);

  if (!showEntryLinksBase) {
    return { showSection: false, mode: null, isEntryWindowOpen };
  }

  if (!hasEntryPeriod || isOrgAdmin || isEntryWindowOpen) {
    return { showSection: true, mode: "full", isEntryWindowOpen };
  }

  if (entryStart !== null && now < entryStart) {
    return { showSection: true, mode: "preview", isEntryWindowOpen: false };
  }

  return { showSection: false, mode: null, isEntryWindowOpen: false };
}
