import { appRoutes } from "@/lib/appRoutes";

/** 大会詳細の「レース情報」タブ（スタートリスト）への戻り先 */
export function competitionResultsTabHref(competitionId: string, isLoggedIn: boolean): string {
  const base = isLoggedIn
    ? appRoutes.competitions.root(competitionId)
    : appRoutes.public.competitionView(competitionId);
  return `${base}?tab=results`;
}

/** 大会詳細トップ（タブなし）への戻り先 */
export function competitionOverviewHref(competitionId: string, isLoggedIn: boolean): string {
  return isLoggedIn
    ? appRoutes.competitions.root(competitionId)
    : appRoutes.public.competitionView(competitionId);
}
