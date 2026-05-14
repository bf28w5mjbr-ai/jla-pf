import { toast } from "sonner";

/** ヒート設定 PUT 成功後、統合カードの persistTabs と同様にスナップショットを更新する */
export async function captureStartListSnapshotAfterHeatSave(
  competitionId: string
): Promise<boolean> {
  try {
    const capRes = await fetch(
      `/api/competitions/${competitionId}/start-list-snapshot/capture`,
      { method: "POST" }
    );
    const capJson = (await capRes.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    if (!capRes.ok) {
      toast.error(
        capJson.error ||
          capJson.message ||
          "スタートリスト記録の更新に失敗しました（ヒート設定は保存済みです）。もう一度保存してください。"
      );
      return false;
    }
    return true;
  } catch {
    toast.error(
      "スタートリスト記録の更新に失敗しました（ヒート設定は保存済みです）。通信を確認のうえ、もう一度保存してください。"
    );
    return false;
  }
}
