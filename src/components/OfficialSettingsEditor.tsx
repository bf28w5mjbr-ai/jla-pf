"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Trash2, Check } from "lucide-react";

type OfficialPosition = {
  positionName: string;
  count: string;
};

type OfficialPositionsData = OfficialPosition[];

type OfficialSettingsEditorProps = {
  competitionId: string;
  organizationId: string;
  officialPositions?: OfficialPositionsData | null;
};

export function OfficialSettingsEditor({
  competitionId,
  organizationId,
  officialPositions: initialOfficialPositions,
}: OfficialSettingsEditorProps) {
  const [positions, setPositions] = useState<OfficialPosition[]>(
    initialOfficialPositions && Array.isArray(initialOfficialPositions)
      ? initialOfficialPositions.map((position: any) => ({
          positionName: position.positionName ?? "",
          count:
            typeof position.count === "number"
              ? position.count.toString()
              : "",
        }))
      : []
  );
  const [savedPositions, setSavedPositions] = useState<
    { positionName: string; count: number }[]
  >(
    initialOfficialPositions && Array.isArray(initialOfficialPositions)
      ? initialOfficialPositions.map((position: any) => ({
          positionName: position.positionName ?? "",
          count: typeof position.count === "number" ? position.count : 0,
        }))
      : []
  );
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const addPosition = () => {
    setPositions([...positions, { positionName: "", count: "1" }]);
  };

  const removePosition = (index: number) => {
    setPositions(positions.filter((_, i) => i !== index));
  };

  const updatePosition = (
    index: number,
    field: keyof OfficialPosition,
    value: string
  ) => {
    const newPositions = [...positions];
    newPositions[index][field] = value;
    setPositions(newPositions);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);

      // バリデーション
      const normalizedPositions = positions.map((position) => ({
        positionName: position.positionName.trim(),
        count: Number(position.count),
      }));

      const invalidPositions = normalizedPositions.filter(
        (position) =>
          !position.positionName ||
          !Number.isFinite(position.count) ||
          position.count < 1
      );
      if (invalidPositions.length > 0) {
        toast.error("ポジション名を入力し、募集人数は1人以上にしてください");
        return;
      }

      const response = await fetch(
        `/api/organizations/${organizationId}/competitions/${competitionId}/official-positions`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ positions: normalizedPositions }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "保存に失敗しました");
      }

      setSavedPositions(normalizedPositions);
      setLastSavedAt(new Date());
      toast.success("オフィシャル設定を保存しました");
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save official positions:", error);
      toast.error(
        error instanceof Error ? error.message : "保存に失敗しました"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>オフィシャル募集設定</CardTitle>
          <CardDescription>
            募集するポジションと人数を設定します。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            {positions.length === 0 ? (
              <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-muted-foreground dark:border-gray-700 dark:bg-gray-900">
                オフィシャルポジションが登録されていません。
                <br />
                「ポジションを追加」から登録できます。
              </div>
            ) : (
              positions.map((position, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-950 md:flex-row md:items-end"
                >
                  <div className="flex-1 space-y-3">
                    <div>
                      <Label htmlFor={`position-name-${index}`}>ポジション名</Label>
                      <Input
                        id={`position-name-${index}`}
                        value={position.positionName}
                        onChange={(e) =>
                          updatePosition(index, "positionName", e.target.value)
                        }
                        placeholder="例: 審判長、タイムキーパー、記録員"
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="w-32">
                      <Label htmlFor={`position-count-${index}`}>募集人数</Label>
                      <Input
                        id={`position-count-${index}`}
                        type="number"
                        min="1"
                        value={position.count}
                        onChange={(e) =>
                          updatePosition(index, "count", e.target.value)
                        }
                        className="mt-1"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removePosition(index)}
                      aria-label="ポジションを削除"
                      className="h-10 w-10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={addPosition}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              ポジションを追加
            </Button>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button 
              onClick={handleSave} 
              disabled={isSaving || justSaved}
              className={justSaved ? "bg-green-600 hover:bg-green-700" : ""}
            >
              {isSaving ? (
                "保存中..."
              ) : justSaved ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  保存しました
                </>
              ) : (
                "保存"
              )}
            </Button>
          </div>

          <div className="border-t pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                保存済みの内容
              </p>
              {lastSavedAt && (
                <p className="text-xs text-gray-500">
                  {lastSavedAt.toLocaleString("ja-JP")}
                </p>
              )}
            </div>
            {savedPositions.length === 0 ? (
              <p className="text-sm text-gray-500">保存済みの募集設定はありません。</p>
            ) : (
              <ul className="space-y-2">
                {savedPositions.map((position, index) => (
                  <li
                    key={`${position.positionName}-${position.count}-${index}`}
                    className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {position.positionName || "（名称未設定）"}
                    </span>
                    <span className="text-gray-600 dark:text-gray-400">
                      {position.count}人
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
