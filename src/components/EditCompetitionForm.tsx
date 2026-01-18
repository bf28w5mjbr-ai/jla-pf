"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

type Competition = {
  id: string;
  organizationId: string;
  name: string;
  nameKana: string | null;
  startDate: Date;
  endDate: Date;
  venue: string;
  venueAddress: string | null;
};

type Props = {
  competition: Competition;
  organizationId: string;
};

export default function EditCompetitionForm({ competition, organizationId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // フォームデータ
  const [name, setName] = useState(competition.name);
  const [nameKana, setNameKana] = useState(competition.nameKana || "");
  const [startDate, setStartDate] = useState(
    new Date(competition.startDate).toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(
    new Date(competition.endDate).toISOString().slice(0, 10)
  );
  const [venue, setVenue] = useState(competition.venue);
  const [venueAddress, setVenueAddress] = useState(competition.venueAddress || "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // バリデーション
    if (!name.trim()) {
      toast.error("大会名を入力してください");
      return;
    }

    if (!venue.trim()) {
      toast.error("開催場所を入力してください");
      return;
    }

    // 日付の妥当性チェック
    if (new Date(startDate) > new Date(endDate)) {
      toast.error("終了日時は開始日時より後にしてください");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`/api/competitions/${competition.id}/update`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          nameKana,
          startDate,
          endDate,
          venue,
          venueAddress,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "大会の更新に失敗しました");
      }

      toast.success("大会情報を更新しました");
      router.push(`/organizations/${organizationId}/competitions/${competition.id}`);
      router.refresh();
    } catch (error) {
      console.error("Update competition error:", error);
      toast.error(
        error instanceof Error ? error.message : "大会の更新に失敗しました"
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

      <div className="flex gap-4">
        <Button type="submit" disabled={loading}>
          {loading ? "更新中..." : "更新する"}
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
