/**
 * Node.js 専用の dev シャットダウン処理（instrumentation.ts から動的 import される）。
 */
let disconnecting = false;

function onShutdown(): void {
  if (disconnecting) return;
  disconnecting = true;
  void import("@/server/db").then(({ disconnectPrismaForDevShutdown }) =>
    disconnectPrismaForDevShutdown()
  );
}

process.once("SIGINT", onShutdown);
process.once("SIGTERM", onShutdown);

export {};
