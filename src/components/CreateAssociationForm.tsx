"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export default function CreateAssociationForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("協会名を入力してください");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch("/api/associations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, abbreviation }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "協会の作成に失敗しました");
      }

      toast.success("協会を作成しました（承認待ち）");
      router.push(
        data?.id
          ? `/admin/account?created=${encodeURIComponent(data.id)}`
          : "/admin/account"
      );
      router.refresh();
    } catch (error) {
      console.error("Create association error:", error);
      toast.error(
        error instanceof Error ? error.message : "協会の作成に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">協会基本情報</h2>
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">
              協会名 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 日本ライフセービング協会"
              maxLength={120}
              required
            />
          </div>

          <div>
            <Label htmlFor="abbreviation">略称</Label>
            <Input
              id="abbreviation"
              value={abbreviation}
              onChange={(e) => setAbbreviation(e.target.value)}
              placeholder="例: JLA"
              maxLength={20}
            />
          </div>
        </div>
      </Card>

      <div className="flex gap-4">
        <Button type="submit" disabled={loading}>
          {loading ? "作成中..." : "協会を作成"}
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
