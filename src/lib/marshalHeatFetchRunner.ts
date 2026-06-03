/** heat-marshal 取得の同時実行制御（inFlight 中の再要求は finish 後に 1 回リトライ） */
export function createMarshalHeatFetchRunner() {
  let inFlight = false;
  let pendingRetry = false;

  return {
    tryStart(): boolean {
      if (inFlight) {
        pendingRetry = true;
        return false;
      }
      inFlight = true;
      return true;
    },
    finish(onRetry: () => void): void {
      inFlight = false;
      if (pendingRetry) {
        pendingRetry = false;
        onRetry();
      }
    },
  };
}
