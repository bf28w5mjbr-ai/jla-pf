/**
 * フロントの主要ルート（パス文字列）を一箇所に集約する。
 * クラブ×大会のサブページ、個人向け、旧URL互換など、ドメインの置き場所を揃える。
 */

export const appRoutes = {
  /** ログイン後トップ（個人） */
  dashboard: () => "/dashboard",

  me: {
    entries: () => "/me/entries",
  },

  /** プロフィール配下（検索・申請など） */
  profile: {
    clubs: () => "/profile/clubs",
  },

  clubs: {
    /** アプリ内のクラブ一覧 */
    list: () => "/clubs",
    /** 新規クラブ作成 */
    create: () => "/clubs/create",
    root: (clubId: string) => `/clubs/${clubId}`,
    /** `tab` クエリ。`hash` は # を除いたアンカー id（例: club-team-assignment） */
    tab: (clubId: string, tab: "members" | "competitions", options?: { hash?: string }) => {
      const q = `/clubs/${clubId}?tab=${tab}`;
      if (!options?.hash) return q;
      const h = options.hash.startsWith("#") ? options.hash.slice(1) : options.hash;
      return `${q}#${h}`;
    },
    /** 参加大会セクション（メンバー割当ジャンプ用） */
    competitionsParticipation: (clubId: string) =>
      `/clubs/${clubId}?tab=competitions#club-team-assignment`,
    entries: (clubId: string) => `/clubs/${clubId}/entries`,
    edit: (clubId: string) => `/clubs/${clubId}/edit`,
    competition: {
      /**
       * チーム種目ハブ（エントリー・履歴 / メンバー割当）
       * `tab` 省略時はサーバ側でエントリー扱いに寄せる想定（URL は `/team` のみでも可）
       */
      team: (clubId: string, competitionId: string, options?: { tab?: "entry" | "assignment" }) => {
        const base = `/clubs/${clubId}/competitions/${competitionId}/team`;
        const t = options?.tab;
        if (t === "assignment") return `${base}?tab=assignment`;
        if (t === "entry") return `${base}?tab=entry`;
        return base;
      },
      /** @deprecated `team` + `tab` に統合。互換リダイレクト用 */
      teamAssignment: (clubId: string, competitionId: string) =>
        `/clubs/${clubId}/competitions/${competitionId}/team-assignment`,
      /** @deprecated `team` + `tab` に統合。互換リダイレクト用 */
      teamEntry: (clubId: string, competitionId: string) =>
        `/clubs/${clubId}/competitions/${competitionId}/team-entry`,
    },
  },

  competitions: {
    root: (competitionId: string) => `/competitions/${competitionId}`,
    entry: (competitionId: string) => `/competitions/${competitionId}/entry`,
    officialEntry: (competitionId: string) => `/competitions/${competitionId}/official-entry`,
    results: (competitionId: string) => `/competitions/${competitionId}/results`,
    resultsManage: (competitionId: string) => `/competitions/${competitionId}/results/manage`,
    startList: (competitionId: string) => `/competitions/${competitionId}/start-list`,
    /** 旧パス（リダイレクト先の club 配下へ誘導する前段） */
    legacyTeamAssignment: (competitionId: string) =>
      `/competitions/${competitionId}/team-assignment`,
    legacyTeamEntry: (competitionId: string) => `/competitions/${competitionId}/team-entry`,
  },
} as const;

/** `origin`（例: https://example.com）とパスから絶対URL（API の Stripe 戻り先など） */
export function absoluteAppUrl(origin: string, path: string): string {
  const o = origin.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${o}${p}`;
}
