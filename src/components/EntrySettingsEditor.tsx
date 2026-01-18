"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

// デフォルト種目リスト
const DEFAULT_EVENTS = {
  POOL: {
    INDIVIDUAL: [
      "障害物スイム（200m）",
      "マネキンキャリー（50m）",
      "レスキューメドレー（100m）",
      "マネキンキャリー・ウィズフィン（100m）",
      "マネキントウ・ウィズフィン（100m）",
      "スーパーライフセーバー（200m）",
    ],
    TEAM: [
      "ラインスロー（12.5m）",
      "マネキンリレー（4×25m）",
      "障害物リレー（4×50m）",
      "メドレーリレー（4×50m）",
      "プールライフセーバーリレー（4×50m）",
    ],
  },
  OCEAN: {
    INDIVIDUAL: [
      "サーフレース",
      "サーフスキー",
      "ボードレース",
      "ビーチフラッグス",
      "ビーチスプリント",
      "2kmビーチラン",
      "オーシャンマン",
      "オーシャンウーマン",
    ],
    TEAM: [
      "レスキューチューブレスキュー",
      "ボードレスキュー",
      "ビーチリレー",
      "オーシャンマンリレー",
      "オーシャンウーマンリレー",
    ],
  },
};

type Event = {
  id: string;
  name: string;
  sex: "MALE" | "FEMALE";
  type: "INDIVIDUAL" | "TEAM";
  category: "POOL" | "OCEAN";
  requiresEntryTime: boolean;
  displayOrder: number;
};

type EntryFee = {
  baseFee: number;
  multiEventSurcharge?: {
    minEvents: number;
    feePerEvent: number;
  }[];
  teamOnlyFee?: number;
};

type EntrySettingsEditorProps = {
  competitionId: string;
  initialData: {
    entryStartDate: Date | null;
    entryEndDate: Date | null;
    entryFee?: EntryFee;
  };
  initialEvents?: Event[];
  canEdit: boolean;
};

export default function EntrySettingsEditor({
  competitionId,
  initialData,
  initialEvents = [],
  canEdit,
}: EntrySettingsEditorProps) {
  const [entryStartDate, setEntryStartDate] = useState(
    initialData.entryStartDate
      ? new Date(initialData.entryStartDate).toISOString().slice(0, 16)
      : ""
  );
  const [entryEndDate, setEntryEndDate] = useState(
    initialData.entryEndDate
      ? new Date(initialData.entryEndDate).toISOString().slice(0, 16)
      : ""
  );
  const [isUpdating, setIsUpdating] = useState(false);
  
  // エントリー費用設定
  const [baseFee, setBaseFee] = useState(initialData.entryFee?.baseFee?.toString() || "");
  const [teamOnlyFee, setTeamOnlyFee] = useState(initialData.entryFee?.teamOnlyFee?.toString() || "");
  const [multiEventSurcharges, setMultiEventSurcharges] = useState<{minEvents: string; feePerEvent: string}[]>(
    initialData.entryFee?.multiEventSurcharge?.map(d => ({
      minEvents: d.minEvents.toString(),
      feePerEvent: d.feePerEvent.toString()
    })) || []
  );
  const [isUpdatingFee, setIsUpdatingFee] = useState(false);
  
  // 種目管理
  const [events, setEvents] = useState<Event[]>(initialEvents);
  const [poolIndividualName, setPoolIndividualName] = useState("");
  const [poolTeamName, setPoolTeamName] = useState("");
  const [oceanIndividualName, setOceanIndividualName] = useState("");
  const [oceanTeamName, setOceanTeamName] = useState("");
  const [isAddingPoolIndividual, setIsAddingPoolIndividual] = useState(false);
  const [isAddingPoolTeam, setIsAddingPoolTeam] = useState(false);
  const [isAddingOceanIndividual, setIsAddingOceanIndividual] = useState(false);
  const [isAddingOceanTeam, setIsAddingOceanTeam] = useState(false);
  const [poolIndividualError, setPoolIndividualError] = useState<string | null>(null);
  const [poolTeamError, setPoolTeamError] = useState<string | null>(null);
  const [oceanIndividualError, setOceanIndividualError] = useState<string | null>(null);
  const [oceanTeamError, setOceanTeamError] = useState<string | null>(null);

  // デフォルト種目追加のローディング状態
  const [isAddingDefaultEvents, setIsAddingDefaultEvents] = useState<string | null>(null);

  // Category selection state
  const [selectedCategory, setSelectedCategory] = useState<"POOL" | "OCEAN">("POOL");

  // デフォルト種目を一括追加
  const handleAddDefaultEvents = async (category: "POOL" | "OCEAN", type: "INDIVIDUAL" | "TEAM") => {
    const loadingKey = `${category}-${type}`;
    setIsAddingDefaultEvents(loadingKey);
    const defaultEventNames = DEFAULT_EVENTS[category][type];
    const existingEventNames = new Set(
      events
        .filter(e => e.category === category && e.type === type)
        .map(e => e.name)
    );

    const newEventNames = defaultEventNames.filter(name => !existingEventNames.has(name));

    if (newEventNames.length === 0) {
      toast.info("すべてのデフォルト種目は既に登録されています");
      return;
    }

    const categoryLabel = category === "POOL" ? "プール" : "オーシャン";
    const typeLabel = type === "INDIVIDUAL" ? "個人" : "チーム";
    
    toast.loading(`${categoryLabel}${typeLabel}種目を追加中...`);

    try {
      let successCount = 0;
      let errorCount = 0;

      // 各種目を順次追加
      for (const eventName of newEventNames) {
        try {
          const response = await fetch(`/api/competitions/${competitionId}/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: eventName,
              type,
              category,
            }),
          });

          if (response.ok) {
            successCount++;
          } else {
            const error = await response.json();
            console.error(`種目「${eventName}」の追加に失敗:`, error);
            errorCount++;
          }
        } catch (err) {
          console.error(`種目「${eventName}」の追加エラー:`, err);
          errorCount++;
        }
      }

      // 最新の種目一覧を取得
      const response = await fetch(`/api/competitions/${competitionId}/events`);
      if (response.ok) {
        const { events: updatedEvents } = await response.json();
        setEvents(updatedEvents);
        
        toast.dismiss();
        if (errorCount === 0) {
          toast.success(`${categoryLabel}${typeLabel}種目のデフォルト種目を追加しました（${successCount}件）`);
        } else {
          toast.warning(`${successCount}件追加、${errorCount}件失敗しました`);
        }
      } else {
        toast.dismiss();
        toast.error("種目一覧の更新に失敗しました");
      }
    } catch (error) {
      console.error("デフォルト種目追加エラー:", error);
      toast.dismiss();
      toast.error("デフォルト種目の追加に失敗しました");
    } finally {
      setIsAddingDefaultEvents(null);
    }
  };

  // 種目を一括削除
  const handleDeleteAllEvents = async (category: "POOL" | "OCEAN", type: "INDIVIDUAL" | "TEAM") => {
    const targetEvents = events.filter(e => e.category === category && e.type === type);
    
    if (targetEvents.length === 0) {
      toast.info("削除する種目がありません");
      return;
    }

    const categoryLabel = category === "POOL" ? "プール" : "オーシャン";
    const typeLabel = type === "INDIVIDUAL" ? "個人" : "チーム";
    
    if (!confirm(`${categoryLabel}${typeLabel}種目をすべて削除しますか？（${targetEvents.length}件）\n\nこの操作は取り消せません。`)) {
      return;
    }

    toast.loading(`${categoryLabel}${typeLabel}種目を削除中...`);

    try {
      let successCount = 0;
      let errorCount = 0;

      // 各種目を削除（男女ペアごとに削除）
      const uniqueNames = Array.from(new Set(targetEvents.map(e => e.name)));
      
      for (const name of uniqueNames) {
        const eventToDelete = targetEvents.find(e => e.name === name);
        if (!eventToDelete) continue;

        try {
          const response = await fetch(`/api/competitions/${competitionId}/events/${eventToDelete.id}`, {
            method: "DELETE",
          });

          if (response.ok) {
            successCount++;
          } else {
            const error = await response.json();
            console.error(`種目「${name}」の削除に失敗:`, error);
            errorCount++;
          }
        } catch (err) {
          console.error(`種目「${name}」の削除エラー:`, err);
          errorCount++;
        }
      }

      // 最新の種目一覧を取得
      const response = await fetch(`/api/competitions/${competitionId}/events`);
      if (response.ok) {
        const { events: updatedEvents } = await response.json();
        setEvents(updatedEvents);
        
        toast.dismiss();
        if (errorCount === 0) {
          toast.success(`${categoryLabel}${typeLabel}種目を削除しました（${successCount}件）`);
        } else {
          toast.warning(`${successCount}件削除、${errorCount}件失敗しました`);
        }
      } else {
        toast.dismiss();
        toast.error("種目一覧の更新に失敗しました");
      }
    } catch (error) {
      console.error("種目一括削除エラー:", error);
      toast.dismiss();
      toast.error("種目の削除に失敗しました");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!entryStartDate || !entryEndDate) {
      toast.error("エントリー期間を入力してください");
      return;
    }

    if (new Date(entryStartDate) > new Date(entryEndDate)) {
      toast.error("エントリー終了日時はエントリー開始日時より後にしてください");
      return;
    }

    setIsUpdating(true);

    try {
      const response = await fetch(`/api/competitions/${competitionId}/entry-settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entryStartDate,
          entryEndDate,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "エントリー設定の更新に失敗しました");
      }

      toast.success("エントリー設定を更新しました");
    } catch (error) {
      console.error("エントリー設定の更新エラー:", error);
      toast.error(error instanceof Error ? error.message : "エントリー設定の更新に失敗しました");
    } finally {
      setIsUpdating(false);
    }
  };

  // エントリー費用更新
  const handleUpdateEntryFee = async () => {
    const baseFeeNum = parseFloat(baseFee);
    if (isNaN(baseFeeNum) || baseFeeNum < 0) {
      toast.error("基本料金を正しく入力してください");
      return;
    }

    // 複数種目割増のバリデーション
    const surcharges = multiEventSurcharges
      .filter(d => d.minEvents && d.feePerEvent)
      .map(d => ({
        minEvents: parseInt(d.minEvents),
        feePerEvent: parseFloat(d.feePerEvent)
      }));

    for (const surcharge of surcharges) {
      if (isNaN(surcharge.minEvents) || surcharge.minEvents < 2) {
        toast.error("複数種目割増は2種目以上で設定してください");
        return;
      }
      if (isNaN(surcharge.feePerEvent) || surcharge.feePerEvent < 0) {
        toast.error("1種目あたりの料金を正しく入力してください");
        return;
      }
    }

    const teamOnlyFeeNum = teamOnlyFee ? parseFloat(teamOnlyFee) : undefined;
    if (teamOnlyFee && (isNaN(teamOnlyFeeNum!) || teamOnlyFeeNum! < 0)) {
      toast.error("チーム種目のみ料金を正しく入力してください");
      return;
    }

    setIsUpdatingFee(true);

    try {
      const response = await fetch(`/api/competitions/${competitionId}/entry-fee`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          baseFee: baseFeeNum,
          multiEventSurcharge: surcharges.length > 0 ? surcharges : undefined,
          teamOnlyFee: teamOnlyFeeNum,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "エントリー費用設定の更新に失敗しました");
      }

      toast.success("エントリー費用設定を更新しました");
    } catch (error) {
      console.error("エントリー費用設定の更新エラー:", error);
      toast.error(error instanceof Error ? error.message : "エントリー費用設定の更新に失敗しました");
    } finally {
      setIsUpdatingFee(false);
    }
  };

  const handleAddPoolIndividual = async () => {
    if (!poolIndividualName.trim()) {
      setPoolIndividualError("種目名を入力してください");
      return;
    }

    if (isAddingPoolIndividual) return; // 二重送信防止

    setIsAddingPoolIndividual(true);
    setPoolIndividualError(null);

    try {
      const response = await fetch(`/api/competitions/${competitionId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: poolIndividualName.trim(),
          type: "INDIVIDUAL",
          category: "POOL",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        setPoolIndividualError(error.message || "種目の追加に失敗しました");
        return;
      }

      const { events: newEvents } = await response.json();
      setEvents(newEvents);
      setPoolIndividualName("");
      toast.success(`プール個人種目「${poolIndividualName}」を追加しました（男子・女子）`);
    } catch (error) {
      console.error("種目追加エラー:", error);
      setPoolIndividualError(error instanceof Error ? error.message : "種目の追加に失敗しました");
    } finally {
      setIsAddingPoolIndividual(false);
    }
  };

  const handleAddPoolTeam = async () => {
    if (!poolTeamName.trim()) {
      setPoolTeamError("種目名を入力してください");
      return;
    }

    if (isAddingPoolTeam) return; // 二重送信防止

    setIsAddingPoolTeam(true);
    setPoolTeamError(null);

    try {
      const response = await fetch(`/api/competitions/${competitionId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: poolTeamName.trim(),
          type: "TEAM",
          category: "POOL",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        setPoolTeamError(error.message || "種目の追加に失敗しました");
        return;
      }

      const { events: newEvents } = await response.json();
      setEvents(newEvents);
      setPoolTeamName("");
      toast.success(`プールチーム種目「${poolTeamName}」を追加しました（男子・女子）`);
    } catch (error) {
      console.error("種目追加エラー:", error);
      setPoolTeamError(error instanceof Error ? error.message : "種目の追加に失敗しました");
    } finally {
      setIsAddingPoolTeam(false);
    }
  };

  const handleAddOceanIndividual = async () => {
    if (!oceanIndividualName.trim()) {
      setOceanIndividualError("種目名を入力してください");
      return;
    }

    if (isAddingOceanIndividual) return; // 二重送信防止

    setIsAddingOceanIndividual(true);
    setOceanIndividualError(null);

    try {
      const response = await fetch(`/api/competitions/${competitionId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: oceanIndividualName.trim(),
          type: "INDIVIDUAL",
          category: "OCEAN",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        setOceanIndividualError(error.message || "種目の追加に失敗しました");
        return;
      }

      const { events: newEvents } = await response.json();
      setEvents(newEvents);
      setOceanIndividualName("");
      toast.success(`オーシャン個人種目「${oceanIndividualName}」を追加しました（男子・女子）`);
    } catch (error) {
      console.error("種目追加エラー:", error);
      setOceanIndividualError(error instanceof Error ? error.message : "種目の追加に失敗しました");
    } finally {
      setIsAddingOceanIndividual(false);
    }
  };

  const handleAddOceanTeam = async () => {
    if (!oceanTeamName.trim()) {
      setOceanTeamError("種目名を入力してください");
      return;
    }

    if (isAddingOceanTeam) return; // 二重送信防止

    setIsAddingOceanTeam(true);
    setOceanTeamError(null);

    try {
      const response = await fetch(`/api/competitions/${competitionId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: oceanTeamName.trim(),
          type: "TEAM",
          category: "OCEAN",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        setOceanTeamError(error.message || "種目の追加に失敗しました");
        return;
      }

      const { events: newEvents } = await response.json();
      setEvents(newEvents);
      setOceanTeamName("");
      toast.success(`オーシャンチーム種目「${oceanTeamName}」を追加しました（男子・女子）`);
    } catch (error) {
      console.error("種目追加エラー:", error);
      setOceanTeamError(error instanceof Error ? error.message : "種目の追加に失敗しました");
    } finally {
      setIsAddingOceanTeam(false);
    }
  };

  const handleDeleteEvent = async (eventId: string, eventName: string) => {
    if (!confirm(`「${eventName}」を削除しますか？`)) {
      return;
    }

    try {
      const response = await fetch(`/api/competitions/${competitionId}/events/${eventId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "種目の削除に失敗しました");
      }

      const { events: updatedEvents } = await response.json();
      setEvents(updatedEvents);
      toast.success(`「${eventName}」を削除しました`);
    } catch (error) {
      console.error("種目削除エラー:", error);
      toast.error(error instanceof Error ? error.message : "種目の削除に失敗しました");
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>エントリー期間</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="entryStartDate">エントリー開始日時 *</Label>
                <Input
                  id="entryStartDate"
                  type="datetime-local"
                  value={entryStartDate}
                  onChange={(e) => setEntryStartDate(e.target.value)}
                  required
                  disabled={!canEdit}
                />
              </div>

              <div>
                <Label htmlFor="entryEndDate">エントリー終了日時 *</Label>
                <Input
                  id="entryEndDate"
                  type="datetime-local"
                  value={entryEndDate}
                  onChange={(e) => setEntryEndDate(e.target.value)}
                  required
                  disabled={!canEdit}
                />
              </div>
            </div>

            {canEdit && (
              <Button type="submit" disabled={isUpdating}>
                {isUpdating ? "更新中..." : "エントリー期間を更新"}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>種目設定</CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            プール競技はエントリータイム入力必須、オーシャン競技は種目選択のみ
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Category Selection Tabs */}
          <div className="border-b border-gray-200">
            <div className="flex space-x-4">
              <button
                type="button"
                onClick={() => setSelectedCategory("POOL")}
                className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                  selectedCategory === "POOL"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                プール競技
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategory("OCEAN")}
                className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                  selectedCategory === "OCEAN"
                    ? "border-cyan-500 text-cyan-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                オーシャン競技
              </button>
            </div>
          </div>

          {/* プール競技 */}
          {selectedCategory === "POOL" && (
            <div className="space-y-6">
              {/* プール個人種目 */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-blue-700">個人種目 (タイム入力必須)</h4>
                  {canEdit && (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddDefaultEvents("POOL", "INDIVIDUAL")}
                        disabled={isAddingDefaultEvents === "POOL-INDIVIDUAL"}
                        className="text-xs"
                      >
                        {isAddingDefaultEvents === "POOL-INDIVIDUAL" ? "追加中..." : "デフォルト種目を追加"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteAllEvents("POOL", "INDIVIDUAL")}
                        className="text-xs text-red-600 hover:text-red-700"
                      >
                        すべて削除
                      </Button>
                    </div>
                  )}
                </div>
              {poolIndividualError && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                  {poolIndividualError}
                </div>
              )}
              
              {canEdit && (
                <div className="flex gap-2">
                  <Input
                    placeholder="例: 100m障害物"
                    value={poolIndividualName}
                    onChange={(e) => {
                      setPoolIndividualName(e.target.value);
                      if (poolIndividualError) setPoolIndividualError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddPoolIndividual();
                      }
                    }}
                  />
                  <Button
                    onClick={handleAddPoolIndividual}
                    disabled={isAddingPoolIndividual || !poolIndividualName.trim()}
                    size="icon"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                {events.filter(e => e.category === "POOL" && e.type === "INDIVIDUAL").length === 0 ? (
                  <p className="text-sm text-gray-500">プール個人種目が登録されていません</p>
                ) : (
                  <div className="space-y-2">
                    {Array.from(
                      new Map(
                        events
                          .filter(e => e.category === "POOL" && e.type === "INDIVIDUAL")
                          .map(e => [e.name, e])
                      ).values()
                    )
                      .sort((a, b) => a.displayOrder - b.displayOrder)
                      .map((event) => {
                        // オーシャンマン/オーシャンウーマン系の種目は性別表記を除外
                        const hideGenderLabel = [
                          'オーシャンマン',
                          'オーシャンウーマン',
                          'オーシャンマンリレー',
                          'オーシャンウーマンリレー'
                        ].includes(event.name);
                        
                        return (
                          <div
                            key={event.name}
                            className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-700 rounded-lg"
                          >
                            <span className="text-sm font-semibold text-black dark:text-white">
                              {event.name}{!hideGenderLabel && '(男女)'}
                              <span className="ml-2 text-xs font-normal text-blue-600 dark:text-blue-400">(タイム入力必須)</span>
                            </span>
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteEvent(event.id, event.name)}
                              >
                                <Trash2 className="h-4 w-4 text-red-500 dark:text-red-400" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>

            {/* プールチーム種目 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-blue-700">チーム種目 (タイム入力必須)</h4>
                {canEdit && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddDefaultEvents("POOL", "TEAM")}
                      disabled={isAddingDefaultEvents === "POOL-TEAM"}
                      className="text-xs"
                    >
                      {isAddingDefaultEvents === "POOL-TEAM" ? "追加中..." : "デフォルト種目を追加"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteAllEvents("POOL", "TEAM")}
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      すべて削除
                    </Button>
                  </div>
                )}
              </div>
              {poolTeamError && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                  {poolTeamError}
                </div>
              )}
              
              {canEdit && (
                <div className="flex gap-2">
                  <Input
                    placeholder="例: 4×50mメドレーリレー"
                    value={poolTeamName}
                    onChange={(e) => {
                      setPoolTeamName(e.target.value);
                      if (poolTeamError) setPoolTeamError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddPoolTeam();
                      }
                    }}
                  />
                  <Button
                    onClick={handleAddPoolTeam}
                    disabled={isAddingPoolTeam || !poolTeamName.trim()}
                    size="icon"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                {events.filter(e => e.category === "POOL" && e.type === "TEAM").length === 0 ? (
                  <p className="text-sm text-gray-500">プールチーム種目が登録されていません</p>
                ) : (
                  <div className="space-y-2">
                    {Array.from(
                      new Map(
                        events
                          .filter(e => e.category === "POOL" && e.type === "TEAM")
                          .map(e => [e.name, e])
                      ).values()
                    )
                      .sort((a, b) => a.displayOrder - b.displayOrder)
                      .map((event) => {
                        // オーシャンマン/オーシャンウーマン系の種目は性別表記を除外
                        const hideGenderLabel = [
                          'オーシャンマン',
                          'オーシャンウーマン',
                          'オーシャンマンリレー',
                          'オーシャンウーマンリレー'
                        ].includes(event.name);
                        
                        return (
                          <div
                            key={event.name}
                            className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-700 rounded-lg"
                          >
                            <span className="text-sm font-semibold text-black dark:text-white">
                              {event.name}{!hideGenderLabel && '（男女）'}
                              <span className="ml-2 text-xs font-normal text-blue-600 dark:text-blue-400">(タイム入力必須)</span>
                            </span>
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteEvent(event.id, event.name)}
                              >
                                <Trash2 className="h-4 w-4 text-red-500 dark:text-red-400" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </div>
          )}

          {/* オーシャン競技 */}
          {selectedCategory === "OCEAN" && (
            <div className="space-y-6">
              {/* オーシャン個人種目 */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-cyan-700">個人種目 (選択のみ)</h4>
                  {canEdit && (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddDefaultEvents("OCEAN", "INDIVIDUAL")}
                        disabled={isAddingDefaultEvents === "OCEAN-INDIVIDUAL"}
                        className="text-xs"
                      >
                        {isAddingDefaultEvents === "OCEAN-INDIVIDUAL" ? "追加中..." : "デフォルト種目を追加"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteAllEvents("OCEAN", "INDIVIDUAL")}
                        className="text-xs text-red-600 hover:text-red-700"
                      >
                        すべて削除
                      </Button>
                    </div>
                  )}
                </div>
              {oceanIndividualError && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                  {oceanIndividualError}
                </div>
              )}
              
              {canEdit && (
                <div className="flex gap-2">
                  <Input
                    placeholder="例: ビーチフラッグス"
                    value={oceanIndividualName}
                    onChange={(e) => {
                      setOceanIndividualName(e.target.value);
                      if (oceanIndividualError) setOceanIndividualError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddOceanIndividual();
                      }
                    }}
                  />
                  <Button
                    onClick={handleAddOceanIndividual}
                    disabled={isAddingOceanIndividual || !oceanIndividualName.trim()}
                    size="icon"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                {events.filter(e => e.category === "OCEAN" && e.type === "INDIVIDUAL").length === 0 ? (
                  <p className="text-sm text-gray-500">オーシャン個人種目が登録されていません</p>
                ) : (
                  <div className="space-y-2">
                    {Array.from(
                      new Map(
                        events
                          .filter(e => e.category === "OCEAN" && e.type === "INDIVIDUAL")
                          .map(e => [e.name, e])
                      ).values()
                    )
                      .sort((a, b) => a.displayOrder - b.displayOrder)
                      .map((event) => {
                        // オーシャンマン/オーシャンウーマン系の種目は性別表記を除外
                        const hideGenderLabel = [
                          'オーシャンマン',
                          'オーシャンウーマン',
                          'オーシャンマンリレー',
                          'オーシャンウーマンリレー'
                        ].includes(event.name);
                        
                        return (
                          <div
                            key={event.name}
                            className="flex items-center justify-between p-3 bg-cyan-100 dark:bg-cyan-950 border border-cyan-300 dark:border-cyan-700 rounded-lg"
                          >
                            <span className="text-sm font-semibold text-black dark:text-white">
                              {event.name}{!hideGenderLabel && '（男女）'}
                              <span className="ml-2 text-xs font-normal text-cyan-700 dark:text-cyan-400">(選択のみ)</span>
                            </span>
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteEvent(event.id, event.name)}
                              >
                                <Trash2 className="h-4 w-4 text-red-500 dark:text-red-400" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>

            {/* オーシャンチーム種目 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-cyan-700">チーム種目 (選択のみ)</h4>
                {canEdit && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddDefaultEvents("OCEAN", "TEAM")}
                      disabled={isAddingDefaultEvents === "OCEAN-TEAM"}
                      className="text-xs"
                    >
                      {isAddingDefaultEvents === "OCEAN-TEAM" ? "追加中..." : "デフォルト種目を追加"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteAllEvents("OCEAN", "TEAM")}
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      すべて削除
                    </Button>
                  </div>
                )}
              </div>
              {oceanTeamError && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                  {oceanTeamError}
                </div>
              )}
              
              {canEdit && (
                <div className="flex gap-2">
                  <Input
                    placeholder="例: ビーチリレー"
                    value={oceanTeamName}
                    onChange={(e) => {
                      setOceanTeamName(e.target.value);
                      if (oceanTeamError) setOceanTeamError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddOceanTeam();
                      }
                    }}
                  />
                  <Button
                    onClick={handleAddOceanTeam}
                    disabled={isAddingOceanTeam || !oceanTeamName.trim()}
                    size="icon"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                {events.filter(e => e.category === "OCEAN" && e.type === "TEAM").length === 0 ? (
                  <p className="text-sm text-gray-500">オーシャンチーム種目が登録されていません</p>
                ) : (
                  <div className="space-y-2">
                    {Array.from(
                      new Map(
                        events
                          .filter(e => e.category === "OCEAN" && e.type === "TEAM")
                          .map(e => [e.name, e])
                      ).values()
                    )
                      .sort((a, b) => a.displayOrder - b.displayOrder)
                      .map((event) => {
                        // オーシャンマン/オーシャンウーマン系の種目は性別表記を除外
                        const hideGenderLabel = [
                          'オーシャンマン',
                          'オーシャンウーマン',
                          'オーシャンマンリレー',
                          'オーシャンウーマンリレー'
                        ].includes(event.name);
                        
                        return (
                          <div
                            key={event.name}
                            className="flex items-center justify-between p-3 bg-cyan-100 dark:bg-cyan-950 border border-cyan-300 dark:border-cyan-700 rounded-lg"
                          >
                            <span className="text-sm font-semibold text-black dark:text-white">
                              {event.name}{!hideGenderLabel && '（男女）'}
                              <span className="ml-2 text-xs font-normal text-cyan-700 dark:text-cyan-400">(選択のみ)</span>
                            </span>
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteEvent(event.id, event.name)}
                              >
                                <Trash2 className="h-4 w-4 text-red-500 dark:text-red-400" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </div>
          )}
        </CardContent>
      </Card>

      {/* エントリー費用設定 */}
      <Card>
        <CardHeader>
          <CardTitle>エントリー費用設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 基本料金 */}
          <div className="space-y-2">
            <Label htmlFor="baseFee">基本料金（円）</Label>
            <div className="flex gap-2">
              <Input
                id="baseFee"
                type="number"
                min="0"
                step="100"
                value={baseFee}
                onChange={(e) => setBaseFee(e.target.value)}
                placeholder="5000"
                disabled={!canEdit}
              />
            </div>
            <p className="text-sm text-gray-500">1種目あたりの基本料金を設定します</p>
          </div>

          {/* 複数種目割増 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>複数種目割増</Label>
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMultiEventSurcharges([...multiEventSurcharges, { minEvents: "", feePerEvent: "" }])}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  割増を追加
                </Button>
              )}
            </div>
            {multiEventSurcharges.length === 0 ? (
              <p className="text-sm text-gray-500">複数種目割増が設定されていません</p>
            ) : (
              <div className="space-y-2">
                {multiEventSurcharges.map((surcharge, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <Input
                      type="number"
                      min="2"
                      placeholder="種目数"
                      value={surcharge.minEvents}
                      onChange={(e) => {
                        const newSurcharges = [...multiEventSurcharges];
                        newSurcharges[index].minEvents = e.target.value;
                        setMultiEventSurcharges(newSurcharges);
                      }}
                      disabled={!canEdit}
                      className="w-24"
                    />
                    <span className="text-sm">種目以降は1種目あたり</span>
                    <Input
                      type="number"
                      min="0"
                      step="100"
                      placeholder="料金"
                      value={surcharge.feePerEvent}
                      onChange={(e) => {
                        const newSurcharges = [...multiEventSurcharges];
                        newSurcharges[index].feePerEvent = e.target.value;
                        setMultiEventSurcharges(newSurcharges);
                      }}
                      disabled={!canEdit}
                      className="w-32"
                    />
                    <span className="text-sm">円</span>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const newSurcharges = multiEventSurcharges.filter((_, i) => i !== index);
                          setMultiEventSurcharges(newSurcharges);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="text-sm text-gray-500">指定種目数以降の1種目あたりの料金を設定します（例: 3種目以降は1種目3,000円）</p>
          </div>

          {/* チーム種目のみ料金 */}
          <div className="space-y-2">
            <Label htmlFor="teamOnlyFee">チーム種目のみ料金（円）</Label>
            <div className="flex gap-2">
              <Input
                id="teamOnlyFee"
                type="number"
                min="0"
                step="100"
                value={teamOnlyFee}
                onChange={(e) => setTeamOnlyFee(e.target.value)}
                placeholder="3000"
                disabled={!canEdit}
              />
            </div>
            <p className="text-sm text-gray-500">チーム種目のみにエントリーする場合の料金（任意）</p>
          </div>

          {canEdit && (
            <Button
              onClick={handleUpdateEntryFee}
              disabled={isUpdatingFee}
              className="w-full"
            >
              {isUpdatingFee ? "更新中..." : "エントリー費用設定を更新"}
            </Button>
          )}
        </CardContent>
      </Card>
    </>
  );
}
