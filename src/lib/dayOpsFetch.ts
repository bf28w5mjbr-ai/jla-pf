/** 当日運用 API 向け fetch 初期値（httpOnly Cookie を必ず送る） */
export const dayOpsFetchInit: RequestInit = { credentials: "same-origin" };

export function dayOpsFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...dayOpsFetchInit, ...init });
}
