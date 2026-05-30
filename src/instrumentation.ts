/**
 * Next dev 終了時に Prisma 接続を明示的に閉じ、Supabase の EMAXCONN 蓄積を抑える。
 * Node 専用 API は instrumentation.node.ts へ分離（Edge Runtime の静的解析を避ける）。
 */
export async function register() {
  if (process.env.NODE_ENV === "production") return;
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation.node");
  }
}
