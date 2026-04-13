"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IdCard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isValidJlaMemberNumber, normalizeJlaMemberNumber } from "@/lib/jlaMemberNumber";

interface JlaMemberNumberEditorProps {
  initialValue: string | null;
}

export default function JlaMemberNumberEditor({ initialValue }: JlaMemberNumberEditorProps) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(initialValue ?? "");
  }, [initialValue]);

  const submit = async () => {
    if (saving) return;
    const normalized = normalizeJlaMemberNumber(value);
    if (!isValidJlaMemberNumber(normalized)) {
      toast.error("500から始まる半角9桁の数字で入力してください");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/users/me/jla-member-number", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jlaMemberNumber: normalized }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; jlaMemberNumber?: string };
      if (!res.ok) {
        throw new Error(data.error || "保存に失敗しました");
      }
      if (data.jlaMemberNumber) {
        setValue(data.jlaMemberNumber);
      }
      toast.success(data.message ?? "保存しました");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card padding="none" className="overflow-hidden border-border/90 shadow-sm">
      <CardHeader className="border-b border-border/80 bg-muted/25">
        <div className="flex items-center gap-2">
          <IdCard className="h-5 w-5 text-primary" strokeWidth={1.75} aria-hidden />
          <CardTitle className="text-lg">JLAメンバーID</CardTitle>
        </div>
        <CardDescription>
          日本ライフセービング協会が発行するメンバーID（半角9桁・500から始まる）を登録します。保有資格の紐づけ保存でも使用されます。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:p-6">
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="profile-jla-member-id">メンバーID</Label>
          <Input
            id="profile-jla-member-id"
            value={value}
            onChange={(e) => setValue(normalizeJlaMemberNumber(e.target.value))}
            numericInput="integer"
            maxLength={9}
            placeholder="500123456"
            autoComplete="off"
            className="max-w-xs font-mono"
          />
          <p className="text-xs text-muted-foreground">
            500から始まる半角9桁。変更した場合は保存ボタンを押してください。
          </p>
        </div>
        <Button type="button" onClick={submit} disabled={saving} className="shrink-0 sm:mb-0.5">
          {saving ? "保存中…" : "保存"}
        </Button>
      </CardContent>
    </Card>
  );
}
