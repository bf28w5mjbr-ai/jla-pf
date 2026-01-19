"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

type OfficialPosition = {
  positionName: string;
  count: number;
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
      ? initialOfficialPositions
      : []
  );
  const [isSaving, setIsSaving] = useState(false);

  const addPosition = () => {
    setPositions([...positions, { positionName: "", count: 1 }]);
  };

  const removePosition = (index: number) => {
    setPositions(positions.filter((_, i) => i !== index));
  };

  const updatePosition = (
    index: number,
    field: keyof OfficialPosition,
    value: string | number
  ) => {
    const newPositions = [...positions];
    if (field === "count") {
      newPositions[index][field] = typeof value === "string" ? parseInt(value) || 1 : value;
    } else {
      newPositions[index][field] = value as string;
    }
    setPositions(newPositions);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);

      // バリデーション
      const invalidPositions = positions.filter(
        (p) => !p.positionName.trim() || p.count < 1
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
          body: JSON.stringify({ positions }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "保存に失敗しました");
      }

      toast.success("オフィシャル設定を保存しました");
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
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            {positions.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                オフィシャルポジションが登録されていません。
                <br />
                「ポジションを追加」ボタンで追加してください。
              </div>
            ) : (
              positions.map((position, index) => (
                <div
                  key={index}
                  className="flex gap-4 items-start p-4 border rounded-lg"
                >
                  <div className="flex-1 space-y-4">
                    <div>
                      <Label htmlFor={`position-name-${index}`}>
                        ポジション名
                      </Label>
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
                    <div>
                      <Label htmlFor={`position-count-${index}`}>
                        募集人数
                      </Label>
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
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removePosition(index)}
                    className="mt-6"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2">
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
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "保存中..." : "保存"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
