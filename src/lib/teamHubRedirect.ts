/** 旧 `/team-entry` `/team-assignment` から `/team` へリダイレクトするとき、クエリを引き継ぐ */
export function mergeTeamHubQuery(
  tab: "entry" | "assignment",
  incoming: Record<string, string | string[] | undefined>
): string {
  const q = new URLSearchParams();
  q.set("tab", tab);
  for (const [key, val] of Object.entries(incoming)) {
    if (key === "tab") continue;
    if (val === undefined) continue;
    if (Array.isArray(val)) {
      val.forEach((v) => q.append(key, v));
    } else {
      q.set(key, val);
    }
  }
  return q.toString();
}
