"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  minAge?: number | null;
  maxAge?: number | null;
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
    requiredQualifications?: string[] | null;
    participantEligibilityText?: string | null;
    allowMultipleEventEntries?: boolean | null;
    requireClubMembership?: boolean | null;
    minAge?: number | null;
    maxAge?: number | null;
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
  const router = useRouter();
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
  const [allowMultipleEventEntries, setAllowMultipleEventEntries] = useState(
    initialData.allowMultipleEventEntries ?? true
  );
  const [requireClubMembership, setRequireClubMembership] = useState(
    initialData.requireClubMembership ?? false
  );
  const [competitionMinAge, setCompetitionMinAge] = useState(
    typeof initialData.minAge === "number" ? initialData.minAge.toString() : ""
  );
  const [competitionMaxAge, setCompetitionMaxAge] = useState(
    typeof initialData.maxAge === "number" ? initialData.maxAge.toString() : ""
  );
  const [isUpdating, setIsUpdating] = useState(false);

  // 参加対象者
  const [participantEligibilityText, setParticipantEligibilityText] = useState(
    initialData.participantEligibilityText ?? ""
  );
  const [isUpdatingEligibility, setIsUpdatingEligibility] = useState(false);

  // 出場に必要な資格（3種のみ）
  const allowedQualificationOptions = [
    "選手登録",
    "BLS・WS",
    "認定ライフセーバー",
  ] as const;
  const [requiredQualifications, setRequiredQualifications] = useState<string[]>(
    Array.isArray(initialData.requiredQualifications)
      ? initialData.requiredQualifications
      : []
  );
  const [isUpdatingQualifications, setIsUpdatingQualifications] = useState(false);
  
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
  const [eventAgeRanges, setEventAgeRanges] = useState<Record<string, { minAge: string; maxAge: string }>>(
    () => {
      const map: Record<string, { minAge: string; maxAge: string }> = {};
      initialEvents.forEach((event) => {
        if (!map[event.name]) {
          map[event.name] = {
            minAge: typeof event.minAge === "number" ? event.minAge.toString() : "",
            maxAge: typeof event.maxAge === "number" ? event.maxAge.toString() : "",
          };
        }
      });
      return map;
    }
  );
  const [eventAgeSaveStatus, setEventAgeSaveStatus] = useState<Record<string, Date>>({});
  const syncEvents = (updatedEvents: Event[]) => {
    setEvents(updatedEvents);
    const updatedMap: Record<string, { minAge: string; maxAge: string }> = {};
    updatedEvents.forEach((event) => {
      if (!updatedMap[event.name]) {
        updatedMap[event.name] = {
          minAge: typeof event.minAge === "number" ? event.minAge.toString() : "",
          maxAge: typeof event.maxAge === "number" ? event.maxAge.toString() : "",
        };
      }
    });
    setEventAgeRanges(updatedMap);
  };

  const clearEventAgeSaveStatus = (key: string) => {
    setEventAgeSaveStatus((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const getAgePreview = (eventName: string) => {
    const range = eventAgeRanges[eventName] || { minAge: "", maxAge: "" };
    const minValue = range.minAge.trim();
    const maxValue = range.maxAge.trim();
    if (!minValue && !maxValue) {
      return { label: "未設定", isUnset: true };
    }
    if (minValue && maxValue) {
      return { label: `${minValue}〜${maxValue}歳`, isUnset: false };
    }
    if (minValue) {
      return { label: `${minValue}歳以上`, isUnset: false };
    }
    return { label: `${maxValue}歳以下`, isUnset: false };
  };
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
        syncEvents(updatedEvents);
        
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
        syncEvents(updatedEvents);
        
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

  const handleSubmit = async (e?: React.SyntheticEvent) => {
    e?.preventDefault?.();

    if (!entryStartDate || !entryEndDate) {
      toast.error("エントリー期間を入力してください");
      return;
    }

    if (new Date(entryStartDate) > new Date(entryEndDate)) {
      toast.error("エントリー終了日時はエントリー開始日時より後にしてください");
      return;
    }

    const minAgeValue = competitionMinAge.trim() === "" ? null : Number(competitionMinAge);
    const maxAgeValue = competitionMaxAge.trim() === "" ? null : Number(competitionMaxAge);

    if (minAgeValue !== null && (Number.isNaN(minAgeValue) || minAgeValue < 0)) {
      toast.error("最小年齢は0以上の数値で入力してください");
      return;
    }

    if (maxAgeValue !== null && (Number.isNaN(maxAgeValue) || maxAgeValue < 0)) {
      toast.error("最大年齢は0以上の数値で入力してください");
      return;
    }

    if (minAgeValue !== null && maxAgeValue !== null && minAgeValue > maxAgeValue) {
      toast.error("最小年齢は最大年齢以下にしてください");
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
          allowMultipleEventEntries,
          requireClubMembership,
          minAge: minAgeValue,
          maxAge: maxAgeValue,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "エントリー設定の更新に失敗しました");
      }

      toast.success("エントリー設定を更新しました");
      router.refresh();
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

  const handleUpdateEligibility = async () => {
    setIsUpdatingEligibility(true);

    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/participant-eligibility`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            participantEligibilityText,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "参加対象者の更新に失敗しました");
      }

      const data = await response.json();
      if (typeof data.participantEligibilityText === "string") {
        setParticipantEligibilityText(data.participantEligibilityText);
      } else if (data.participantEligibilityText === null) {
        setParticipantEligibilityText("");
      }

      toast.success("参加対象者を更新しました");
      router.refresh();
    } catch (error) {
      console.error("参加対象者の更新エラー:", error);
      toast.error(
        error instanceof Error ? error.message : "参加対象者の更新に失敗しました"
      );
    } finally {
      setIsUpdatingEligibility(false);
    }
  };

  const toggleQualification = (value: string) => {
    if (requiredQualifications.includes(value)) {
      setRequiredQualifications(requiredQualifications.filter((q) => q !== value));
    } else {
      setRequiredQualifications([...requiredQualifications, value]);
    }
  };

  const handleUpdateQualifications = async () => {
    setIsUpdatingQualifications(true);

    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/entry-qualifications`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ requiredQualifications }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "必要資格の更新に失敗しました");
      }

      const data = await response.json();
      if (Array.isArray(data.requiredQualifications)) {
        setRequiredQualifications(data.requiredQualifications);
      }

      toast.success("出場に必要な資格を更新しました");
      router.refresh();
    } catch (error) {
      console.error("必要資格の更新エラー:", error);
      toast.error(
        error instanceof Error ? error.message : "必要資格の更新に失敗しました"
      );
    } finally {
      setIsUpdatingQualifications(false);
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
      syncEvents(newEvents);
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
      syncEvents(newEvents);
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
      syncEvents(newEvents);
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
      syncEvents(newEvents);
      setOceanTeamName("");
      toast.success(`オーシャンチーム種目「${oceanTeamName}」を追加しました（男子・女子）`);
    } catch (error) {
      console.error("種目追加エラー:", error);
      setOceanTeamError(error instanceof Error ? error.message : "種目の追加に失敗しました");
    } finally {
      setIsAddingOceanTeam(false);
    }
  };

  const handleBulkUpdateEventAgeRanges = async (
    category: "POOL" | "OCEAN",
    type: "INDIVIDUAL" | "TEAM"
  ) => {
    const targetEvents = Array.from(
      new Map(
        events
          .filter((event) => event.category === category && event.type === type)
          .map((event) => [event.name, event])
      ).values()
    );

    if (targetEvents.length === 0) {
      toast.info("対象の種目がありません");
      return;
    }

    for (const event of targetEvents) {
      const range = eventAgeRanges[event.name] || { minAge: "", maxAge: "" };
      const minAgeValue = range.minAge.trim() === "" ? null : Number(range.minAge);
      const maxAgeValue = range.maxAge.trim() === "" ? null : Number(range.maxAge);

      if (minAgeValue !== null && (Number.isNaN(minAgeValue) || minAgeValue < 0)) {
        toast.error("種目の最小年齢は0以上の数値で入力してください");
        return;
      }

      if (maxAgeValue !== null && (Number.isNaN(maxAgeValue) || maxAgeValue < 0)) {
        toast.error("種目の最大年齢は0以上の数値で入力してください");
        return;
      }

      if (minAgeValue !== null && maxAgeValue !== null && minAgeValue > maxAgeValue) {
        toast.error("種目の最小年齢は最大年齢以下にしてください");
        return;
      }
    }

    const categoryLabel = category === "POOL" ? "プール" : "オーシャン";
    const typeLabel = type === "INDIVIDUAL" ? "個人" : "チーム";
    toast.loading(`${categoryLabel}${typeLabel}の年齢条件を保存中...`);

    try {
      let errorCount = 0;

      for (const event of targetEvents) {
        const range = eventAgeRanges[event.name] || { minAge: "", maxAge: "" };
        const minAgeValue = range.minAge.trim() === "" ? null : Number(range.minAge);
        const maxAgeValue = range.maxAge.trim() === "" ? null : Number(range.maxAge);

        const response = await fetch(
          `/api/competitions/${competitionId}/events/${event.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ minAge: minAgeValue, maxAge: maxAgeValue }),
          }
        );

        if (!response.ok) {
          errorCount += 1;
        }
      }

      const response = await fetch(`/api/competitions/${competitionId}/events`);
      if (response.ok) {
        const { events: updatedEvents } = await response.json();
        syncEvents(updatedEvents);
      }

      toast.dismiss();
      if (errorCount === 0) {
        toast.success(`${categoryLabel}${typeLabel}の年齢条件を保存しました`);
        setEventAgeSaveStatus((prev) => ({
          ...prev,
          [`${category}-${type}`]: new Date(),
        }));
      } else {
        toast.warning("一部の種目で保存に失敗しました");
      }
      router.refresh();
    } catch (error) {
      console.error("種目年齢条件一括更新エラー:", error);
      toast.dismiss();
      toast.error("種目の年齢条件の更新に失敗しました");
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
      syncEvents(updatedEvents);
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
          <CardDescription>受付期間を設定します。</CardDescription>
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
              <div className="flex justify-end">
                <Button type="submit" disabled={isUpdating} className="w-full md:w-auto">
                  {isUpdating ? "更新中..." : "エントリー期間を更新"}
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>エントリー条件</CardTitle>
          <CardDescription>年齢条件と複数種目の可否を設定します。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
            <p className="font-medium text-gray-800 dark:text-gray-200">現在の条件</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-gray-200 bg-white px-3 py-1 dark:border-gray-700 dark:bg-gray-950">
                {allowMultipleEventEntries ? "複数種目OK" : "1種目のみ"}
              </span>
              <span className="rounded-full border border-gray-200 bg-white px-3 py-1 dark:border-gray-700 dark:bg-gray-950">
                {requireClubMembership ? "所属クラブ必須" : "所属クラブ任意"}
              </span>
              <span className="rounded-full border border-gray-200 bg-white px-3 py-1 dark:border-gray-700 dark:bg-gray-950">
                年齢: {competitionMinAge || "下限なし"}〜{competitionMaxAge || "上限なし"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="competitionMinAge">最小年齢（任意）</Label>
              <Input
                id="competitionMinAge"
                type="number"
                min="0"
                value={competitionMinAge}
                onChange={(e) => setCompetitionMinAge(e.target.value)}
                placeholder="例: 18"
                disabled={!canEdit}
              />
              <p className="text-xs text-gray-500 mt-1">空欄の場合は下限なし</p>
            </div>
            <div>
              <Label htmlFor="competitionMaxAge">最大年齢（任意）</Label>
              <Input
                id="competitionMaxAge"
                type="number"
                min="0"
                value={competitionMaxAge}
                onChange={(e) => setCompetitionMaxAge(e.target.value)}
                placeholder="例: 35"
                disabled={!canEdit}
              />
              <p className="text-xs text-gray-500 mt-1">空欄の場合は上限なし</p>
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={allowMultipleEventEntries}
                onChange={(e) => setAllowMultipleEventEntries(e.target.checked)}
                disabled={!canEdit}
              />
              <span>
                1人あたり複数種目のエントリーを許可する
                <span className="block text-xs text-gray-500">
                  オフの場合は1種目のみ選択可能になります。
                </span>
              </span>
            </label>
          </div>

          <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                所属クラブ
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition hover:border-gray-300 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200">
                  <input
                    type="radio"
                    name="requireClubMembership"
                    checked={requireClubMembership}
                    onChange={() => setRequireClubMembership(true)}
                    disabled={!canEdit}
                  />
                  <span>所属クラブ必須</span>
                </label>
                <label className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition hover:border-gray-300 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200">
                  <input
                    type="radio"
                    name="requireClubMembership"
                    checked={!requireClubMembership}
                    onChange={() => setRequireClubMembership(false)}
                    disabled={!canEdit}
                  />
                  <span>所属クラブ不要</span>
                </label>
              </div>
              <p className="text-xs text-gray-500">
                「所属クラブ必須」を選ぶと、所属クラブのないユーザーはエントリーできません。
              </p>
            </div>
          </div>

          {canEdit && (
            <div className="flex justify-end">
              <Button type="button" onClick={handleSubmit} disabled={isUpdating} className="w-full md:w-auto">
                {isUpdating ? "更新中..." : "エントリー条件を更新"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>出場に必要な資格</CardTitle>
          <CardDescription>出場資格の条件を設定します。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              出場に必須とする資格を選択してください（複数可）。
              未選択の場合は「資格不要」として扱われます。
            </p>
            {requiredQualifications.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {requiredQualifications.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  >
                    {item}
                  </span>
                ))}
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {allowedQualificationOptions.map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 transition hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                >
                  <input
                    type="checkbox"
                    checked={requiredQualifications.includes(option)}
                    onChange={() => toggleQualification(option)}
                    disabled={!canEdit}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </div>

          {canEdit && (
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleUpdateQualifications}
                disabled={isUpdatingQualifications}
                className="w-full md:w-auto"
              >
                {isUpdatingQualifications ? "更新中..." : "必要資格を更新"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>参加対象者</CardTitle>
          <CardDescription>参加対象者の条件を記載します。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="participantEligibility">参加対象者（自由記述）</Label>
            <Textarea
              id="participantEligibility"
              value={participantEligibilityText}
              onChange={(e) => setParticipantEligibilityText(e.target.value)}
              placeholder="例: ○○クラブ所属者のみ、18歳以上の男女、JLA会員限定 など"
              rows={4}
              disabled={!canEdit}
            />
            <p className="text-sm text-gray-500">
              参加対象者の条件を自由に記載できます（未入力の場合は制限なし）
            </p>
            <p className="text-xs text-gray-500">{participantEligibilityText.length} 文字</p>
          </div>

          {canEdit && (
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleUpdateEligibility}
                disabled={isUpdatingEligibility}
                className="w-full md:w-auto"
              >
                {isUpdatingEligibility ? "更新中..." : "参加対象者を更新"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>種目設定</CardTitle>
          <CardDescription>
            プール競技はエントリータイム入力必須、オーシャン競技は種目選択のみ
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Category Selection Tabs */}
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
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
                        onClick={() => handleBulkUpdateEventAgeRanges("POOL", "INDIVIDUAL")}
                        className="text-xs"
                      >
                        年齢条件を保存
                      </Button>
                      {eventAgeSaveStatus["POOL-INDIVIDUAL"] && (
                        <span className="self-center text-[11px] text-gray-500">
                          保存済み {eventAgeSaveStatus["POOL-INDIVIDUAL"].toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
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
                            <div className="space-y-2">
                                <span className="text-sm font-semibold text-black dark:text-white">
                                  {event.name}{!hideGenderLabel && '(男女)'}
                                  <span className="ml-2 text-xs font-normal text-blue-600 dark:text-blue-400">(タイム入力必須)</span>
                                  {(() => {
                                    const preview = getAgePreview(event.name);
                                    return (
                                      <span
                                        className={
                                          preview.isUnset
                                            ? "ml-2 rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-normal text-gray-500"
                                            : "ml-2 text-[11px] font-normal text-gray-500"
                                        }
                                      >
                                        年齢: {preview.label}
                                      </span>
                                    );
                                  })()}
                                </span>
                              <details className="text-xs text-gray-600">
                                <summary className="cursor-pointer font-medium">年齢条件を設定</summary>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder="—"
                                    value={eventAgeRanges[event.name]?.minAge ?? ""}
                                    onChange={(e) => {
                                      clearEventAgeSaveStatus("POOL-INDIVIDUAL");
                                      setEventAgeRanges((prev) => ({
                                        ...prev,
                                        [event.name]: {
                                          minAge: e.target.value,
                                          maxAge: prev[event.name]?.maxAge ?? "",
                                        },
                                      }));
                                    }}
                                    disabled={!canEdit}
                                    className="h-8 w-16 text-xs"
                                  />
                                  <span>〜</span>
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder="—"
                                    value={eventAgeRanges[event.name]?.maxAge ?? ""}
                                    onChange={(e) => {
                                      clearEventAgeSaveStatus("POOL-INDIVIDUAL");
                                      setEventAgeRanges((prev) => ({
                                        ...prev,
                                        [event.name]: {
                                          minAge: prev[event.name]?.minAge ?? "",
                                          maxAge: e.target.value,
                                        },
                                      }));
                                    }}
                                    disabled={!canEdit}
                                    className="h-8 w-16 text-xs"
                                  />
                                </div>
                              </details>
                            </div>
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
                      onClick={() => handleBulkUpdateEventAgeRanges("POOL", "TEAM")}
                      className="text-xs"
                    >
                      年齢条件を保存
                    </Button>
                    {eventAgeSaveStatus["POOL-TEAM"] && (
                      <span className="self-center text-[11px] text-gray-500">
                        保存済み {eventAgeSaveStatus["POOL-TEAM"].toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
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
                            <div className="space-y-2">
                                <span className="text-sm font-semibold text-black dark:text-white">
                                  {event.name}{!hideGenderLabel && '（男女）'}
                                  <span className="ml-2 text-xs font-normal text-blue-600 dark:text-blue-400">(タイム入力必須)</span>
                                  {(() => {
                                    const preview = getAgePreview(event.name);
                                    return (
                                      <span
                                        className={
                                          preview.isUnset
                                            ? "ml-2 rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-normal text-gray-500"
                                            : "ml-2 text-[11px] font-normal text-gray-500"
                                        }
                                      >
                                        年齢: {preview.label}
                                      </span>
                                    );
                                  })()}
                                </span>
                              <details className="text-xs text-gray-600">
                                <summary className="cursor-pointer font-medium">年齢条件を設定</summary>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder="—"
                                    value={eventAgeRanges[event.name]?.minAge ?? ""}
                                    onChange={(e) => {
                                      clearEventAgeSaveStatus("POOL-TEAM");
                                      setEventAgeRanges((prev) => ({
                                        ...prev,
                                        [event.name]: {
                                          minAge: e.target.value,
                                          maxAge: prev[event.name]?.maxAge ?? "",
                                        },
                                      }));
                                    }}
                                    disabled={!canEdit}
                                    className="h-8 w-16 text-xs"
                                  />
                                  <span>〜</span>
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder="—"
                                    value={eventAgeRanges[event.name]?.maxAge ?? ""}
                                    onChange={(e) => {
                                      clearEventAgeSaveStatus("POOL-TEAM");
                                      setEventAgeRanges((prev) => ({
                                        ...prev,
                                        [event.name]: {
                                          minAge: prev[event.name]?.minAge ?? "",
                                          maxAge: e.target.value,
                                        },
                                      }));
                                    }}
                                    disabled={!canEdit}
                                    className="h-8 w-16 text-xs"
                                  />
                                </div>
                              </details>
                            </div>
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
                        onClick={() => handleBulkUpdateEventAgeRanges("OCEAN", "INDIVIDUAL")}
                        className="text-xs"
                      >
                        年齢条件を保存
                      </Button>
                      {eventAgeSaveStatus["OCEAN-INDIVIDUAL"] && (
                        <span className="self-center text-[11px] text-gray-500">
                          保存済み {eventAgeSaveStatus["OCEAN-INDIVIDUAL"].toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
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
                            <div className="space-y-2">
                                <span className="text-sm font-semibold text-black dark:text-white">
                                  {event.name}{!hideGenderLabel && '（男女）'}
                                  <span className="ml-2 text-xs font-normal text-cyan-700 dark:text-cyan-400">(選択のみ)</span>
                                  {(() => {
                                    const preview = getAgePreview(event.name);
                                    return (
                                      <span
                                        className={
                                          preview.isUnset
                                            ? "ml-2 rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-normal text-gray-500"
                                            : "ml-2 text-[11px] font-normal text-gray-500"
                                        }
                                      >
                                        年齢: {preview.label}
                                      </span>
                                    );
                                  })()}
                                </span>
                              <details className="text-xs text-gray-600">
                                <summary className="cursor-pointer font-medium">年齢条件を設定</summary>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder="—"
                                    value={eventAgeRanges[event.name]?.minAge ?? ""}
                                    onChange={(e) => {
                                      clearEventAgeSaveStatus("OCEAN-INDIVIDUAL");
                                      setEventAgeRanges((prev) => ({
                                        ...prev,
                                        [event.name]: {
                                          minAge: e.target.value,
                                          maxAge: prev[event.name]?.maxAge ?? "",
                                        },
                                      }));
                                    }}
                                    disabled={!canEdit}
                                    className="h-8 w-16 text-xs"
                                  />
                                  <span>〜</span>
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder="—"
                                    value={eventAgeRanges[event.name]?.maxAge ?? ""}
                                    onChange={(e) => {
                                      clearEventAgeSaveStatus("OCEAN-INDIVIDUAL");
                                      setEventAgeRanges((prev) => ({
                                        ...prev,
                                        [event.name]: {
                                          minAge: prev[event.name]?.minAge ?? "",
                                          maxAge: e.target.value,
                                        },
                                      }));
                                    }}
                                    disabled={!canEdit}
                                    className="h-8 w-16 text-xs"
                                  />
                                </div>
                              </details>
                            </div>
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
                      onClick={() => handleBulkUpdateEventAgeRanges("OCEAN", "TEAM")}
                      className="text-xs"
                    >
                      年齢条件を保存
                    </Button>
                    {eventAgeSaveStatus["OCEAN-TEAM"] && (
                      <span className="self-center text-[11px] text-gray-500">
                        保存済み {eventAgeSaveStatus["OCEAN-TEAM"].toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
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
                            <div className="space-y-2">
                                <span className="text-sm font-semibold text-black dark:text-white">
                                  {event.name}{!hideGenderLabel && '（男女）'}
                                  <span className="ml-2 text-xs font-normal text-cyan-700 dark:text-cyan-400">(選択のみ)</span>
                                  {(() => {
                                    const preview = getAgePreview(event.name);
                                    return (
                                      <span
                                        className={
                                          preview.isUnset
                                            ? "ml-2 rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-normal text-gray-500"
                                            : "ml-2 text-[11px] font-normal text-gray-500"
                                        }
                                      >
                                        年齢: {preview.label}
                                      </span>
                                    );
                                  })()}
                                </span>
                              <details className="text-xs text-gray-600">
                                <summary className="cursor-pointer font-medium">年齢条件を設定</summary>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder="—"
                                    value={eventAgeRanges[event.name]?.minAge ?? ""}
                                    onChange={(e) => {
                                      clearEventAgeSaveStatus("OCEAN-TEAM");
                                      setEventAgeRanges((prev) => ({
                                        ...prev,
                                        [event.name]: {
                                          minAge: e.target.value,
                                          maxAge: prev[event.name]?.maxAge ?? "",
                                        },
                                      }));
                                    }}
                                    disabled={!canEdit}
                                    className="h-8 w-16 text-xs"
                                  />
                                  <span>〜</span>
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder="—"
                                    value={eventAgeRanges[event.name]?.maxAge ?? ""}
                                    onChange={(e) => {
                                      clearEventAgeSaveStatus("OCEAN-TEAM");
                                      setEventAgeRanges((prev) => ({
                                        ...prev,
                                        [event.name]: {
                                          minAge: prev[event.name]?.minAge ?? "",
                                          maxAge: e.target.value,
                                        },
                                      }));
                                    }}
                                    disabled={!canEdit}
                                    className="h-8 w-16 text-xs"
                                  />
                                </div>
                              </details>
                            </div>
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
          <CardDescription>料金体系を設定します。</CardDescription>
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
            <p className="text-sm text-gray-500">エントリーの基本料金を設定します（種目数に関わらず固定）</p>
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
                    <span className="text-sm">種目以上1種目につき</span>
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
                    <span className="text-sm">円追加</span>
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
            <p className="text-sm text-gray-500">指定種目数以上になると、1種目増えるごとに追加される料金を設定します（例: 3種目以上1,000円追加）</p>
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
            <div className="flex justify-end">
              <Button
                onClick={handleUpdateEntryFee}
                disabled={isUpdatingFee}
                className="w-full md:w-auto"
              >
                {isUpdatingFee ? "更新中..." : "エントリー費用設定を更新"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
