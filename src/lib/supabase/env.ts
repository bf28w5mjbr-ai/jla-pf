/**
 * Supabase の公開 URL / クライアント用キー。
 * 従来の anon キーに加え、新しい Publishable キー（sb_publishable_...）にも対応。
 *
 * Next が `process.env.NEXT_PUBLIC_*` をビルド時に置換するため、サーバーでは
 * `process.env["NAME"]` で読むと `.env` の現在値が使われやすい（空埋め込みのまま固まるのを避ける）。
 * ブラウザでは従来どおり静的参照でバンドルに載せる。
 */
function firstNonEmpty(...candidates: (string | undefined)[]): string {
  for (const c of candidates) {
    const t = typeof c === "string" ? c.trim() : "";
    if (t) return t;
  }
  return "";
}

function runtimeEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t || undefined;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getSupabaseUrl(): string {
  if (isBrowser()) {
    return firstNonEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL);
  }
  return firstNonEmpty(
    runtimeEnv("NEXT_PUBLIC_SUPABASE_URL"),
    runtimeEnv("SUPABASE_URL")
  );
}

export function getSupabasePublishableKey(): string {
  if (isBrowser()) {
    return firstNonEmpty(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    );
  }
  return firstNonEmpty(
    runtimeEnv("SUPABASE_ANON_KEY"),
    runtimeEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    runtimeEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY"),
    runtimeEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    runtimeEnv("SUPABASE_PUBLISHABLE_KEY")
  );
}
