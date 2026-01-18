"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export default function CreateCompetitionForm({
  organizationId,
}: {
  organizationId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // 基本情報
  const [name, setName] = useState("");
  const [nameKana, setNameKana] = useState("");

  // 開催情報
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [venue, setVenue] = useState("");
  const [venueAddress, setVenueAddress] = useState("");

  // 参加情報
  const [entryStartDate, setEntryStartDate] = useState("");
  const [entryEndDate, setEntryEndDate] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !startDate || !endDate || !venue) {
      toast.error("必須項目を入力してください");
      return;
    }

    // 日付の妥当性チェック
    if (new Date(startDate) > new Date(endDate)) {
      toast.error("終了日時は開始日時より後にしてください");
      return;
    }

    if (entryStartDate && entryEndDate && new Date(entryStartDate) > new Date(entryEndDate)) {
      toast.error("エントリー終了日時はエントリー開始日時より後にしてください");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch("/api/competitions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          name,
          nameKana,
          startDate,
          endDate,
          venue,
          venueAddress,
          entryStartDate,
          entryEndDate,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "大会の作成に失敗しました");
      }

      const { competition } = await response.json();
      toast.success("大会を作成しました");
      router.push(`/organizations/${organizationId}/competitions/${competition.id}`);
      router.refresh();
    } catch (error) {
      console.error("Create competition error:", error);
      toast.error(
        error instanceof Error ? error.message : "大会の作成に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 基本情報 */}
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">基本情報</h2>
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">
              大会名 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 第1回全国ライフセービング選手権大会"
              required
            />
          </div>

          <div>
            <Label htmlFor="nameKana">大会名（カナ）</Label>
            <Input
              id="nameKana"
              value={nameKana}
              onChange={(e) => setNameKana(e.target.value)}
              placeholder="例: ダイイッカイゼンコクライフセービングセンシュケンタイカイ"
            />
          </div>
        </div>
      </Card>

      {/* 開催情報 */}
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">開催情報</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="startDate">
                開始日 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="endDate">
                終了日 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="venue">
              開催場所 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="venue"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="例: 東京辰巳国際水泳場"
              required
            />
          </div>

          <div>
            <Label htmlFor="venueAddress">会場住所</Label>
            <Input
              id="venueAddress"
              value={venueAddress}
              onChange={(e) => setVenueAddress(e.target.value)}
              placeholder="例: 東京都江東区辰巳2-8-10"
            />
          </div>
        </div>
      </Card>

      {/* エントリー情報 */}
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">エントリー情報</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="entryStartDate">エントリー開始日時 *</Label>
              <Input
                id="entryStartDate"
                type="datetime-local"
                value={entryStartDate}
                onChange={(e) => setEntryStartDate(e.target.value)}
                required
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
              />
            </div>
          </div>
        </div>
      </Card>

      <div className="flex gap-4">
        <Button type="submit" disabled={loading}>
          {loading ? "作成中..." : "大会を作成"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          キャンセル
        </Button>
      </div>
    </form>
  );
}

