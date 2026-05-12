export const COMPETITION_MANAGEMENT_TAB_VALUES = [
  "page",
  "official",
  "entries",
  "finance",
] as const;

export type CompetitionManagementTabValue =
  (typeof COMPETITION_MANAGEMENT_TAB_VALUES)[number];

/** オフィシャルタブ内サブ（`?tab=official&officialSub=`） */
export const OFFICIAL_SUB_TAB_VALUES = ["manage", "dayops"] as const;

export type OfficialSubTabValue = (typeof OFFICIAL_SUB_TAB_VALUES)[number];

/** Next の searchParams で同キーが複数あると string[] になることがある */
export function parseOfficialSubTab(
  raw: string | string[] | null | undefined
): OfficialSubTabValue {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const normalized = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (normalized === "dayops") {
    return "dayops";
  }
  return "manage";
}

/** 大会管理 `page.tsx` が受け取る searchParams のうち、タブ解決に使う形 */
export type CompetitionManagementPageSearchParams = {
  tab?: string | string[] | undefined;
  officialSub?: string | string[] | undefined;
};

/** Next の searchParams で同キーが複数あると string[] になることがある */
export function parseCompetitionManagementTab(
  tab: string | string[] | null | undefined
): CompetitionManagementTabValue {
  const raw = Array.isArray(tab) ? tab[0] : tab;
  const normalized =
    typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (
    normalized &&
    (COMPETITION_MANAGEMENT_TAB_VALUES as readonly string[]).includes(normalized)
  ) {
    return normalized as CompetitionManagementTabValue;
  }
  return "page";
}

/**
 * `?tab=` から現在タブを決定する唯一の入口（大会管理ページ用）。
 * 生の `tab` と解決結果は開発環境のみ `console.debug` する。
 */
export function resolveCompetitionManagementActiveTab(
  searchParams: CompetitionManagementPageSearchParams
): CompetitionManagementTabValue {
  const rawTab = searchParams.tab;
  const activeTab = parseCompetitionManagementTab(rawTab);
  if (process.env.NODE_ENV === "development") {
    // タブが空になる不具合の切り分け用（本番では出さない）
    console.debug("[competition-management] ?tab raw:", rawTab, "-> activeTab:", activeTab);
  }
  return activeTab;
}
