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

  /** 一般公開（大会・クラブディレクトリ） */
  public: {
    competitions: () => "/browse/competitions",
    competitionView: (competitionId: string) => `/competitions/view/${competitionId}`,
    clubs: () => "/clubs",
    clubView: (clubId: string) => `/clubs/view/${clubId}`,
  },

  clubs: {
    /** 一般公開のクラブ一覧 */
    directory: () => "/clubs",
    /** 会員向け: クラブを探して参加 */
    join: () => "/clubs/join",
    /** @deprecated 会員の「戻る」は profile.clubs() を使用 */
    list: () => "/clubs/join",
    /** 新規クラブ作成 */
    create: () => "/clubs/create",
    root: (clubId: string) => `/clubs/${clubId}`,
    /** 一般公開のクラブ基本情報 */
    publicView: (clubId: string) => `/clubs/view/${clubId}`,
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
      assignments: (clubId: string, competitionId: string) =>
        `/clubs/${clubId}/competitions/${competitionId}/assignments`,
    },
  },

  competitions: {
    /** 会員向け大会一覧 */
    list: () => "/competitions",
    root: (competitionId: string) => `/competitions/${competitionId}`,
    entry: (competitionId: string) => `/competitions/${competitionId}/entry`,
    teamEntry: (competitionId: string, options?: { clubId?: string }) => {
      const base = `/competitions/${competitionId}/team-entry`;
      const clubId = options?.clubId?.trim();
      if (!clubId) return base;
      return `${base}?clubId=${encodeURIComponent(clubId)}`;
    },
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
