/** カバーページ（公開ランディング）を配信するホスト。仕様: docs/SITE_ENTRY_AND_ROUTING.md */
const COVER_PAGE_HOSTS = new Set([
  "bluvium.jp",
  "www.bluvium.jp",
  "localhost",
  "127.0.0.1",
]);

export function normalizeHostname(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const host = raw.split(":")[0]?.toLowerCase();
  return host || null;
}

export function hostnameFromHeaders(headerList: Headers): string | null {
  const forwarded = headerList.get("x-forwarded-host");
  const raw =
    forwarded?.split(",")[0]?.trim() || headerList.get("host") || "";
  return normalizeHostname(raw);
}

export function hostnameFromRequestHostHeader(hostHeader: string | null): string | null {
  const raw = hostHeader?.split(",")[0]?.trim() ?? "";
  return normalizeHostname(raw);
}

/** proxy / テスト: Host ヘッダーが無いときは URL の hostname にフォールバック */
export function resolveRequestHostname(
  hostHeader: string | null,
  urlHostname: string
): string | null {
  return hostnameFromRequestHostHeader(hostHeader) ?? normalizeHostname(urlHostname);
}

export function isCoverPageHost(hostname: string | null): boolean {
  if (!hostname) return false;
  return COVER_PAGE_HOSTS.has(hostname);
}
